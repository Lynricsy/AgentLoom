package runtime

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	firecracker "github.com/firecracker-microvm/firecracker-go-sdk"
	"github.com/firecracker-microvm/firecracker-go-sdk/client/models"
	"github.com/sirupsen/logrus"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type LauncherConfig struct {
	ChrootBase      string
	JailerWrapper   string
	UID             int
	GID             int
	ParentCgroup    string
	GuestCACert     string
	GuestCAKey      string
	GuestServerName string
}

type FirecrackerLauncher struct {
	config LauncherConfig
	issuer *guestIdentityIssuer
	logger *logrus.Entry
}

func NewFirecrackerLauncher(config LauncherConfig) (*FirecrackerLauncher, error) {
	if !filepath.IsAbs(config.ChrootBase) || !filepath.IsAbs(config.JailerWrapper) || config.UID < 1 || config.GID < 1 {
		return nil, errors.New("absolute chroot/wrapper paths and non-root jailer identity are required")
	}
	if config.ParentCgroup == "" {
		config.ParentCgroup = "agentloom-firecracker"
	}
	if err := os.MkdirAll(config.ChrootBase, 0o711); err != nil {
		return nil, err
	}
	issuer, err := newGuestIdentityIssuer(config.GuestCACert, config.GuestCAKey, config.GuestServerName)
	if err != nil {
		return nil, err
	}
	return &FirecrackerLauncher{config: config, issuer: issuer, logger: logrus.New().WithField("component", "firecracker-launcher")}, nil
}

func (launcher *FirecrackerLauncher) Launch(ctx context.Context, spec manager.LaunchSpec) (manager.Instance, error) {
	if err := os.Chown(spec.Metadata.DiskPath, launcher.config.UID, launcher.config.GID); err != nil {
		return nil, fmt.Errorf("chown mutable disk: %w", err)
	}
	if err := os.Chmod(spec.Metadata.DiskPath, 0o600); err != nil {
		return nil, err
	}
	ipAddress := net.ParseIP(spec.Network.GuestIP).To4()
	gateway := net.ParseIP(spec.Network.Gateway).To4()
	maskAddress := net.ParseIP(spec.Network.Netmask).To4()
	if ipAddress == nil || gateway == nil || maskAddress == nil {
		return nil, errors.New("network allocation is not valid IPv4")
	}
	certificate, privateKey, err := launcher.issuer.issue(spec.Network.GuestIP)
	if err != nil {
		return nil, fmt.Errorf("issue guest identity: %w", err)
	}
	uid, gid, numa := launcher.config.UID, launcher.config.GID, 0
	cpuQuota := strconv.FormatInt(int64(spec.Metadata.Resources.CPU*100000), 10) + " 100000"
	socketRelative := "run/firecracker.socket"
	machineConfig := firecracker.Config{
		VMID:            spec.Metadata.SessionID,
		SocketPath:      socketRelative,
		KernelImagePath: spec.Artifacts.Kernel,
		InitrdPath:      spec.Artifacts.Initramfs,
		KernelArgs:      "console=ttyS0 reboot=k panic=1 pci=off nomodule i8042.noaux i8042.nomux i8042.dumbkbd quiet",
		Drives: []models.Drive{
			{DriveID: firecracker.String("rootfs"), PathOnHost: firecracker.String(spec.Artifacts.RootFS), IsRootDevice: firecracker.Bool(true), IsReadOnly: firecracker.Bool(true)},
			{DriveID: firecracker.String("mutable"), PathOnHost: firecracker.String(spec.Metadata.DiskPath), IsRootDevice: firecracker.Bool(false), IsReadOnly: firecracker.Bool(false)},
		},
		MachineCfg: models.MachineConfiguration{VcpuCount: firecracker.Int64(spec.Metadata.Resources.VCPUs), MemSizeMib: firecracker.Int64(spec.Metadata.Resources.MemoryMiB), Smt: firecracker.Bool(false)},
		NetworkInterfaces: firecracker.NetworkInterfaces{{
			AllowMMDS: true,
			StaticConfiguration: &firecracker.StaticNetworkConfiguration{
				HostDevName:     spec.Network.TapName,
				MacAddress:      spec.Network.MAC,
				IPConfiguration: &firecracker.IPConfiguration{IPAddr: net.IPNet{IP: ipAddress, Mask: net.IPMask(maskAddress)}, Gateway: gateway, Nameservers: spec.Network.Nameservers, IfName: "eth0"},
			},
		}},
		NetNS:       spec.Network.NetNSPath,
		MmdsAddress: net.ParseIP("169.254.169.254"),
		MmdsVersion: firecracker.MMDSv2,
		Seccomp:     firecracker.SeccompConfig{Enabled: true},
		JailerCfg: &firecracker.JailerConfig{
			UID: &uid, GID: &gid, ID: spec.Metadata.SessionID, NumaNode: &numa,
			ExecFile: spec.Artifacts.Firecracker, JailerBinary: launcher.config.JailerWrapper,
			ChrootBaseDir: launcher.config.ChrootBase, ChrootStrategy: firecracker.NewNaiveChrootStrategy(spec.Artifacts.Kernel),
			Daemonize: true, CgroupVersion: "2", ParentCgroup: launcher.config.ParentCgroup,
			CgroupArgs: []string{"cpu.max=" + cpuQuota, "memory.max=" + strconv.FormatInt(spec.Metadata.Resources.MemoryMiB*1024*1024, 10), "pids.max=256"},
		},
	}
	machineContext := context.Background()
	machine, err := firecracker.NewMachine(machineContext, machineConfig, firecracker.WithLogger(launcher.logger))
	if err != nil {
		return nil, err
	}
	machine.Handlers.FcInit = machine.Handlers.FcInit.Append(firecracker.NewSetMetadataHandler(map[string]any{
		"agentloom": map[string]any{
			"token": spec.Token, "sessionId": spec.Metadata.SessionID, "guestIp": spec.Network.GuestIP,
			"gateway": spec.Network.Gateway, "artifactDigest": spec.Artifacts.Digest, "guestApiVersion": spec.Artifacts.GuestAPI,
			"tlsCertificate": certificate, "tlsPrivateKey": privateKey,
			"callbackRelayUrl": "http://" + net.JoinHostPort(spec.Network.Gateway, "18080") + "/v1/callbacks",
		},
	}))
	if err := machine.Start(machineContext); err != nil {
		return nil, err
	}
	jailRoot := filepath.Join(launcher.config.ChrootBase, filepath.Base(spec.Artifacts.Firecracker), spec.Metadata.SessionID, "root")
	pid, err := waitForPIDFile(ctx, filepath.Join(jailRoot, "firecracker.pid"))
	if err != nil {
		_ = machine.Shutdown(context.Background())
		return nil, err
	}
	socketPath := filepath.Join(jailRoot, socketRelative)
	return &firecrackerInstance{pid: pid, socketPath: socketPath, machine: machine, client: firecracker.NewClient(socketPath, launcher.logger, false)}, nil
}

func (launcher *FirecrackerLauncher) Reattach(_ context.Context, metadata manager.Metadata, _ string) (manager.Instance, error) {
	if metadata.PID < 2 || metadata.APISocketPath == "" {
		return nil, errors.New("persisted instance handle is incomplete")
	}
	if _, err := os.Stat(metadata.APISocketPath); err != nil {
		return nil, err
	}
	return &firecrackerInstance{pid: metadata.PID, socketPath: metadata.APISocketPath, client: firecracker.NewClient(metadata.APISocketPath, launcher.logger, false)}, nil
}

func waitForPIDFile(ctx context.Context, path string) (int, error) {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		content, err := os.ReadFile(path)
		if err == nil {
			pid, parseErr := strconv.Atoi(strings.TrimSpace(string(content)))
			if parseErr == nil && pid > 1 {
				return pid, nil
			}
		}
		select {
		case <-ctx.Done():
			return 0, fmt.Errorf("wait for Firecracker pid file: %w", ctx.Err())
		case <-ticker.C:
		}
	}
}

type firecrackerInstance struct {
	pid          int
	socketPath   string
	machine      *firecracker.Machine
	client       *firecracker.Client
	shutdownOnce sync.Once
	shutdownErr  error
}

func (instance *firecrackerInstance) PID() int {
	return instance.pid
}

func (instance *firecrackerInstance) APISocketPath() string {
	return instance.socketPath
}

func (instance *firecrackerInstance) Shutdown(ctx context.Context) error {
	instance.shutdownOnce.Do(func() {
		if instance.machine != nil {
			instance.shutdownErr = instance.machine.Shutdown(ctx)
			return
		}
		action := models.InstanceActionInfoActionTypeSendCtrlAltDel
		_, instance.shutdownErr = instance.client.CreateSyncAction(ctx, &models.InstanceActionInfo{ActionType: &action})
	})
	return instance.shutdownErr
}

func (instance *firecrackerInstance) Kill(ctx context.Context) error {
	process, err := os.FindProcess(instance.pid)
	if err != nil {
		return err
	}
	if err := process.Signal(syscall.SIGKILL); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	if instance.machine != nil {
		instance.shutdownOnce.Do(func() {
			instance.shutdownErr = instance.machine.Shutdown(ctx)
		})
	}
	return nil
}

func (instance *firecrackerInstance) Wait(ctx context.Context) error {
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		if !processRunning(instance.pid) {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func processRunning(pid int) bool {
	if pid < 2 {
		return false
	}
	stat, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "stat"))
	if err != nil {
		return false
	}
	fields := strings.Fields(string(stat))
	if len(fields) > 2 && fields[2] == "Z" {
		return false
	}
	process, err := os.FindProcess(pid)
	return err == nil && process.Signal(syscall.Signal(0)) == nil
}
