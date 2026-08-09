package runtime

import (
	"context"
	"encoding/json"
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
	PIDRoot         string
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
	if !filepath.IsAbs(config.ChrootBase) || !filepath.IsAbs(config.JailerWrapper) ||
		!filepath.IsAbs(config.PIDRoot) || config.UID < 1 || config.GID < 1 {
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
	if err := prepareParentCgroup(launcher.config.ParentCgroup); err != nil {
		return nil, fmt.Errorf("prepare jailer parent cgroup: %w", err)
	}
	vmCgroupPath, err := prepareVMCgroup(
		launcher.config.ParentCgroup,
		spec.Metadata.SessionID,
		spec.Metadata.Resources,
	)
	if err != nil {
		return nil, fmt.Errorf("prepare VM cgroup: %w", err)
	}
	jailDir := filepath.Join(
		launcher.config.ChrootBase,
		filepath.Base(spec.Artifacts.Firecracker),
		spec.Metadata.SessionID,
	)
	if err := os.RemoveAll(jailDir); err != nil {
		return nil, fmt.Errorf("remove stale jail: %w", err)
	}
	cleanupOnError := true
	defer func() {
		if cleanupOnError {
			_ = killAndRemoveCgroup(vmCgroupPath)
			_ = os.RemoveAll(jailDir)
		}
	}()
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
	guestMetadata, err := json.Marshal(map[string]string{
		"token": spec.Token, "sessionId": spec.Metadata.SessionID, "guestIp": spec.Network.GuestIP,
		"gateway": spec.Network.Gateway, "artifactDigest": spec.Artifacts.Digest, "guestApiVersion": spec.Artifacts.GuestAPI,
		"tlsCertificate": certificate, "tlsPrivateKey": privateKey,
		"callbackRelayUrl": "http://" + net.JoinHostPort(spec.Network.Gateway, "18080") + "/v1/callbacks",
	})
	if err != nil {
		return nil, fmt.Errorf("encode guest metadata: %w", err)
	}
	uid, gid, numa := launcher.config.UID, launcher.config.GID, -1
	cpuQuota := strconv.FormatInt(int64(spec.Metadata.Resources.CPU*100000), 10) + " 100000"
	pidPath := filepath.Join(launcher.config.PIDRoot, spec.Metadata.SessionID+".pid")
	if err := os.MkdirAll(launcher.config.PIDRoot, 0o755); err != nil {
		return nil, fmt.Errorf("prepare PID root: %w", err)
	}
	if err := os.Remove(pidPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("remove stale PID file: %w", err)
	}
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
		MachineCfg: models.MachineConfiguration{
			VcpuCount:  firecracker.Int64(spec.Metadata.Resources.VCPUs),
			MemSizeMib: firecracker.Int64(spec.Metadata.Resources.MemoryMiB),
			Smt:        firecracker.Bool(false),
		},
		NetworkInterfaces: firecracker.NetworkInterfaces{{
			AllowMMDS: true,
			StaticConfiguration: &firecracker.StaticNetworkConfiguration{
				HostDevName: spec.Network.TapName,
				MacAddress:  spec.Network.MAC,
				IPConfiguration: &firecracker.IPConfiguration{
					IPAddr:      net.IPNet{IP: ipAddress, Mask: net.IPMask(maskAddress)},
					Gateway:     gateway,
					Nameservers: spec.Network.Nameservers,
					IfName:      "eth0",
				},
			},
		}},
		NetNS:       spec.Network.NetNSPath,
		MmdsAddress: net.ParseIP("169.254.169.254"),
		MmdsVersion: firecracker.MMDSv2,
		Seccomp:     firecracker.SeccompConfig{Enabled: true},
		JailerCfg: &firecracker.JailerConfig{
			UID: &uid, GID: &gid, ID: spec.Metadata.SessionID, NumaNode: &numa,
			ExecFile: spec.Artifacts.Firecracker, JailerBinary: launcher.config.JailerWrapper,
			ChrootBaseDir: launcher.config.ChrootBase,
			ChrootStrategy: firecracker.NewNaiveChrootStrategy(
				spec.Artifacts.Kernel,
			),
			Daemonize:     false,
			CgroupVersion: "2",
			ParentCgroup: filepath.Join(
				launcher.config.ParentCgroup,
				spec.Metadata.SessionID,
			),
			CgroupArgs: []string{
				"cpu.max=" + cpuQuota,
				"memory.max=" + strconv.FormatInt(spec.Metadata.Resources.MemoryMiB*1024*1024, 10),
				"pids.max=256",
			},
		},
	}
	machineContext := context.Background()
	machine, err := firecracker.NewMachine(
		machineContext,
		machineConfig,
		firecracker.WithLogger(launcher.logger),
	)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(vmCgroupPath); err != nil {
		return nil, fmt.Errorf("verify VM cgroup before jailer: %w", err)
	}
	launcher.logger.WithField("cgroup", vmCgroupPath).Info("verified VM cgroup before jailer")
	machine.Handlers.FcInit = machine.Handlers.FcInit.Append(firecracker.NewSetMetadataHandler(map[string]any{
		"latest": map[string]any{"meta-data": map[string]any{"agentloom": string(guestMetadata)}},
	}))
	if err := machine.Start(machineContext); err != nil {
		return nil, err
	}
	pid, err := waitForPIDFile(ctx, pidPath)
	if err != nil {
		_ = machine.Shutdown(context.Background())
		return nil, err
	}
	jailRoot := filepath.Join(jailDir, "root")
	socketPath := filepath.Join(jailRoot, socketRelative)
	cleanupOnError = false
	return &firecrackerInstance{
		pid: pid, socketPath: socketPath, pidPath: pidPath,
		cgroupPath: vmCgroupPath, jailDir: jailDir,
		machine: machine, client: firecracker.NewClient(socketPath, launcher.logger, false),
	}, nil
}

func (launcher *FirecrackerLauncher) Reattach(_ context.Context, metadata manager.Metadata, _ string) (manager.Instance, error) {
	if metadata.PID < 2 || metadata.APISocketPath == "" {
		return nil, errors.New("persisted instance handle is incomplete")
	}
	if err := manager.ValidateSessionID(metadata.SessionID); err != nil {
		return nil, err
	}
	if _, err := os.Stat(metadata.APISocketPath); err != nil {
		return nil, err
	}
	jailDir := filepath.Dir(filepath.Dir(filepath.Dir(metadata.APISocketPath)))
	cgroupPath := filepath.Join("/sys/fs/cgroup", launcher.config.ParentCgroup, metadata.SessionID)
	if _, err := os.Stat(cgroupPath); errors.Is(err, os.ErrNotExist) {
		cgroupPath = ""
	} else if err != nil {
		return nil, err
	}
	return &firecrackerInstance{
		pid: metadata.PID, socketPath: metadata.APISocketPath,
		pidPath:    filepath.Join(launcher.config.PIDRoot, metadata.SessionID+".pid"),
		cgroupPath: cgroupPath, jailDir: jailDir,
		client: firecracker.NewClient(metadata.APISocketPath, launcher.logger, false),
	}, nil
}

func (launcher *FirecrackerLauncher) Cleanup(_ context.Context, metadata manager.Metadata) error {
	if err := manager.ValidateSessionID(metadata.SessionID); err != nil {
		return err
	}
	cgroupPath := filepath.Join(
		"/sys/fs/cgroup",
		launcher.config.ParentCgroup,
		metadata.SessionID,
	)
	jailDir := filepath.Join(
		launcher.config.ChrootBase,
		"firecracker",
		metadata.SessionID,
	)
	pidPath := filepath.Join(
		launcher.config.PIDRoot,
		metadata.SessionID+".pid",
	)
	var cleanupErrors []error
	cleanupErrors = append(cleanupErrors, killAndRemoveCgroup(cgroupPath))
	if err := os.RemoveAll(jailDir); err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	if err := os.Remove(pidPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		cleanupErrors = append(cleanupErrors, err)
	}
	return errors.Join(cleanupErrors...)
}

func prepareParentCgroup(parent string) error {
	clean := filepath.Clean(parent)
	if clean == "." || filepath.IsAbs(clean) || strings.Contains(clean, string(os.PathSeparator)) {
		return errors.New("parent cgroup must be one path segment")
	}
	if err := os.WriteFile(
		"/sys/fs/cgroup/cgroup.subtree_control",
		[]byte("+cpu +memory +pids"),
		0o644,
	); err != nil {
		return err
	}
	path := filepath.Join("/sys/fs/cgroup", clean)
	if err := os.MkdirAll(path, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(
		filepath.Join(path, "cgroup.subtree_control"),
		[]byte("+cpu +memory +pids"),
		0o644,
	); err != nil {
		return err
	}
	return nil
}

func prepareVMCgroup(
	parent string,
	sessionID string,
	resources manager.Resources,
) (string, error) {
	if err := manager.ValidateSessionID(sessionID); err != nil {
		return "", err
	}
	path := filepath.Join("/sys/fs/cgroup", parent, sessionID)
	if err := os.Mkdir(path, 0o755); err != nil && !errors.Is(err, os.ErrExist) {
		return "", err
	}
	values := map[string]string{
		"cpu.max":    strconv.FormatInt(int64(resources.CPU*100000), 10) + " 100000",
		"memory.max": strconv.FormatInt(resources.MemoryMiB*1024*1024, 10),
		"pids.max":   "256",
	}
	for name, value := range values {
		if err := os.WriteFile(filepath.Join(path, name), []byte(value), 0o644); err != nil {
			_ = os.Remove(path)
			return "", err
		}
	}
	return path, nil
}

func killAndRemoveCgroup(path string) error {
	killPath := filepath.Join(path, "cgroup.kill")
	if err := os.WriteFile(killPath, []byte("1"), 0o644); err != nil &&
		!errors.Is(err, os.ErrNotExist) {
		return err
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		processes, err := os.ReadFile(filepath.Join(path, "cgroup.procs"))
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if strings.TrimSpace(string(processes)) == "" {
			if err := os.Remove(path); err == nil || errors.Is(err, os.ErrNotExist) {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out cleaning VM cgroup %s", filepath.Base(path))
		}
		time.Sleep(20 * time.Millisecond)
	}
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
			return 0, ctx.Err()
		case <-ticker.C:
		}
	}
}

type firecrackerInstance struct {
	pid          int
	socketPath   string
	cgroupPath   string
	jailDir      string
	machine      *firecracker.Machine
	pidPath      string
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
			if instance.cgroupPath != "" {
				if err := killAndRemoveCgroup(instance.cgroupPath); err != nil {
					return err
				}
				instance.cgroupPath = ""
			}
			if instance.jailDir != "" {
				if err := os.RemoveAll(instance.jailDir); err != nil {
					return err
				}
				instance.jailDir = ""
			}
			if instance.pidPath != "" {
				if err := os.Remove(instance.pidPath); err != nil &&
					!errors.Is(err, os.ErrNotExist) {
					return err
				}
				instance.pidPath = ""
			}
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
