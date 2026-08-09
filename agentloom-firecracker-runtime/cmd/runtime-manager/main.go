package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/api"
	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
	networkpkg "github.com/agentloom/agentloom-firecracker-runtime/internal/network"
	"github.com/agentloom/agentloom-firecracker-runtime/internal/preflight"
	runtimepkg "github.com/agentloom/agentloom-firecracker-runtime/internal/runtime"
	"golang.org/x/sys/unix"
)

type appConfig struct {
	Listen               string
	StateRoot            string
	ChrootBase           string
	PIDRoot              string
	ArtifactRoot         string
	ManifestPath         string
	GuestCIDR            string
	GuestGateway         string
	CNIConfigTemplate    string
	CNIPluginPaths       []string
	ServerCert           string
	CallbackAllowedHosts []string
	AllowedPrivateCIDRs  []string
	ServerKey            string
	ClientCA             string
	GuestCA              string
	GuestCAKey           string
	GuestServerName      string
	JailerWrapper        string
	JailerUID            int
	JailerGID            int
	MaxVMs               int
	MaxVCPU              float64
	MaxMemoryMiB         int64
	MaxDiskGiB           int64
	AllowUnsupported     bool
	AllowSMT             bool
	AllowSwap            bool
	SkipDeviceChecks     bool
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	config, err := loadConfig()
	if err != nil {
		logger.Error("invalid runtime manager configuration", "error", err)
		os.Exit(1)
	}
	fatalIf(logger, joinHostCgroupNamespace(), "join host cgroup namespace")
	check, err := preflight.Check(preflight.Config{
		StateRoot: config.StateRoot, ArtifactRoot: config.ArtifactRoot, ArtifactManifestPath: config.ManifestPath,
		GuestCIDR: config.GuestCIDR, RequiredStateBytes: uint64(config.MaxDiskGiB) * 1024 * 1024 * 1024,
		AllowUnsupportedKernel: config.AllowUnsupported, AllowSMT: config.AllowSMT, AllowSwap: config.AllowSwap, SkipDeviceChecks: config.SkipDeviceChecks,
	})
	if err != nil {
		logger.Error("Firecracker preflight failed", "error", err)
		os.Exit(1)
	}
	logger.Info("Firecracker preflight passed", "checks", check.Checks, "warnings", check.Warnings)

	store, err := manager.NewMetadataStore(config.StateRoot)
	fatalIf(logger, err, "initialize metadata store")
	artifacts, err := manager.MaterializeArtifacts(config.ArtifactRoot, config.StateRoot)
	fatalIf(logger, err, "materialize artifacts")
	capacity, err := manager.NewCapacity(manager.CapacityConfig{MaxVMs: config.MaxVMs, VCPU: config.MaxVCPU, MemoryMiB: config.MaxMemoryMiB, DiskGiB: config.MaxDiskGiB})
	fatalIf(logger, err, "initialize capacity")
	firewall, err := networkpkg.NewNFTables("nft", 18080, config.AllowedPrivateCIDRs)
	fatalIf(logger, err, "initialize nftables")
	provisioner, err := networkpkg.NewCNIProvisioner(networkpkg.Config{
		TemplatePath: config.CNIConfigTemplate, PluginPaths: config.CNIPluginPaths, NetNSRoot: "/run/netns",
		LeaseRoot: filepath.Join(config.StateRoot, "network", "leases"), GuestCIDR: config.GuestCIDR,
		Gateway: config.GuestGateway, Nameservers: []string{"1.1.1.1", "1.0.0.1"}, TapName: "tap0",
		TapUID: config.JailerUID, TapGID: config.JailerGID, Firewall: firewall,
	})
	fatalIf(logger, err, "initialize CNI")
	fatalIf(logger, prepareChrootBase(config.ChrootBase), "prepare jailer chroot")
	launcher, err := runtimepkg.NewFirecrackerLauncher(runtimepkg.LauncherConfig{
		ChrootBase: config.ChrootBase, JailerWrapper: config.JailerWrapper, PIDRoot: config.PIDRoot,
		UID: config.JailerUID, GID: config.JailerGID, ParentCgroup: "agentloom-firecracker",
		GuestCACert: config.GuestCA, GuestCAKey: config.GuestCAKey, GuestServerName: config.GuestServerName,
	})
	fatalIf(logger, err, "initialize Firecracker launcher")
	guestTLS, err := clientTLSConfig(config.GuestCA, "")
	fatalIf(logger, err, "load guest CA")
	guestChecker, err := runtimepkg.NewHTTPSGuestChecker(guestTLS, 8443)
	fatalIf(logger, err, "initialize guest health checker")
	runtimeManager, err := manager.New(manager.Config{
		Store: store, Capacity: capacity, Disks: manager.NewExt4DiskManager(store), Artifacts: artifacts,
		Network: provisioner, Launcher: launcher, GuestChecker: guestChecker,
		TokenRecoverer: runtimepkg.NewMMDSTokenRecoverer(), Logger: logger,
	})
	fatalIf(logger, err, "initialize runtime manager")
	fatalIf(logger, runtimeManager.Recover(context.Background()), "reconcile runtime state")
	apiServer, err := api.NewServer(runtimeManager, api.ServerConfig{
		GuestClient: guestChecker.Client(), CallbackAllowedHosts: config.CallbackAllowedHosts, CallbackGateway: config.GuestGateway,
	}, logger)
	fatalIf(logger, err, "initialize control API")
	serverTLS, err := serverTLSConfig(config.ServerCert, config.ServerKey, config.ClientCA)
	fatalIf(logger, err, "load manager mTLS identity")
	httpServer := &http.Server{
		Addr: config.Listen, Handler: apiServer.Handler(), TLSConfig: serverTLS,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 * 1024,
	}
	callbackServer := &http.Server{
		Addr: "0.0.0.0:18080", Handler: apiServer.CallbackHandler(),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 40 * time.Second, WriteTimeout: 40 * time.Second,
		IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024,
	}

	serveErrors := make(chan error, 1)
	go func() {
		logger.Info("runtime manager listening", "address", config.Listen)
		serveErrors <- httpServer.ListenAndServeTLS("", "")
	}()
	go func() {
		logger.Info("guest callback relay listening", "address", callbackServer.Addr)
		serveErrors <- callbackServer.ListenAndServe()
	}()
	signalContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stopSignals()
	select {
	case <-signalContext.Done():
	case serveErr := <-serveErrors:
		if !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("runtime manager server failed", "error", serveErr)
		}
	}
	shutdownContext, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownContext); err != nil {
		logger.Error("control API shutdown failed", "error", err)
	}
	if err := callbackServer.Shutdown(shutdownContext); err != nil {
		logger.Error("callback relay shutdown failed", "error", err)
	}
	if err := runtimeManager.Shutdown(shutdownContext); err != nil {
		logger.Error("microVM shutdown failed", "error", err)
	}
}

func loadConfig() (appConfig, error) {
	artifactRoot := envString("FIRECRACKER_ARTIFACT_ROOT", "/opt/agentloom-firecracker/artifacts")
	stateRoot := envString("FIRECRACKER_STATE_ROOT", "/var/lib/agentloom-firecracker")
	config := appConfig{
		Listen:               envString("FIRECRACKER_MANAGER_LISTEN", "0.0.0.0:8443"),
		StateRoot:            stateRoot,
		ArtifactRoot:         artifactRoot,
		ChrootBase:           envString("FIRECRACKER_CHROOT_BASE", filepath.Join(stateRoot, "jailer")),
		PIDRoot:              envString("FIRECRACKER_PID_ROOT", "/run/firecracker-pids"),
		ManifestPath:         envString("FIRECRACKER_ARTIFACT_MANIFEST", filepath.Join(artifactRoot, "manifest.json")),
		GuestCIDR:            envString("FIRECRACKER_GUEST_CIDR", "172.30.0.0/16"),
		GuestGateway:         envString("FIRECRACKER_GATEWAY", "172.30.0.1"),
		CNIConfigTemplate:    envString("FIRECRACKER_CNI_TEMPLATE", "/etc/agentloom-firecracker/network/10-agentloom-firecracker.conflist.template"),
		CallbackAllowedHosts: strings.Split(envString("FIRECRACKER_CALLBACK_ALLOWED_HOSTS", "server,worker"), ","),
		AllowedPrivateCIDRs:  splitNonEmptyCSV(os.Getenv("FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS")),
		CNIPluginPaths:       strings.Split(envString("FIRECRACKER_CNI_PATH", "/opt/cni/bin:/usr/libexec/cni"), ":"),
		ServerCert:           os.Getenv("FIRECRACKER_MANAGER_TLS_CERT"),
		ServerKey:            os.Getenv("FIRECRACKER_MANAGER_TLS_KEY"),
		ClientCA:             os.Getenv("FIRECRACKER_MANAGER_CLIENT_CA"),
		GuestCA:              os.Getenv("FIRECRACKER_GUEST_CA"),
		GuestCAKey:           os.Getenv("FIRECRACKER_GUEST_CA_KEY"),
		GuestServerName:      envString("FIRECRACKER_GUEST_SERVER_NAME", "agentloom-guest"),
		JailerWrapper:        envString("FIRECRACKER_JAILER_WRAPPER", "/usr/local/bin/jailer-wrapper"),
	}
	var err error
	if config.JailerUID, err = envInt("FIRECRACKER_JAILER_UID", 1000); err != nil {
		return config, err
	}
	if config.JailerGID, err = envInt("FIRECRACKER_JAILER_GID", 1000); err != nil {
		return config, err
	}
	if config.MaxVMs, err = envInt("FIRECRACKER_MAX_VMS", 20); err != nil {
		return config, err
	}
	if config.MaxVCPU, err = envFloat("FIRECRACKER_MAX_VCPU", 20); err != nil {
		return config, err
	}
	if config.MaxMemoryMiB, err = envInt64("FIRECRACKER_MAX_MEMORY_MIB", 40960); err != nil {
		return config, err
	}
	if config.MaxDiskGiB, err = envInt64("FIRECRACKER_MAX_DISK_GIB", 200); err != nil {
		return config, err
	}
	config.AllowUnsupported = envBool("FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL", false)
	config.AllowSMT = envString("FIRECRACKER_SMT_POLICY", "deny") == "allow"
	if envBool("FIRECRACKER_ALLOW_SWAP", false) {
		if envString("FIRECRACKER_ENV", "") != "test" {
			return config, errors.New("FIRECRACKER_ALLOW_SWAP is restricted to FIRECRACKER_ENV=test")
		}
		config.AllowSwap = true
	}
	config.SkipDeviceChecks = envBool("FIRECRACKER_PREFLIGHT_SKIP_DEVICES", false)
	for name, value := range map[string]string{
		"FIRECRACKER_MANAGER_TLS_CERT":  config.ServerCert,
		"FIRECRACKER_MANAGER_TLS_KEY":   config.ServerKey,
		"FIRECRACKER_MANAGER_CLIENT_CA": config.ClientCA,
		"FIRECRACKER_GUEST_CA":          config.GuestCA,
		"FIRECRACKER_GUEST_CA_KEY":      config.GuestCAKey,
	} {
		if value == "" || !filepath.IsAbs(value) {
			return config, fmt.Errorf("%s must be an absolute path", name)
		}
	}
	return config, nil
}
func joinHostCgroupNamespace() error {
	namespace, err := os.Open("/proc/1/ns/cgroup")
	if err != nil {
		return err
	}
	defer namespace.Close()
	return unix.Setns(int(namespace.Fd()), unix.CLONE_NEWCGROUP)
}

func prepareChrootBase(path string) error {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return os.MkdirAll(path, 0o711)
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink == 0 {
		return os.MkdirAll(path, 0o711)
	}
	target, err := os.Readlink(path)
	if err != nil {
		return err
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(path), target)
	}
	if err := os.MkdirAll(target, 0o711); err != nil {
		return err
	}
	return os.MkdirAll(path, 0o711)
}

func serverTLSConfig(certPath, keyPath, caPath string) (*tls.Config, error) {
	certificate, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, err
	}
	pool, err := loadCAPool(caPath)
	if err != nil {
		return nil, err
	}
	return &tls.Config{
		MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{certificate},
		ClientCAs: pool, ClientAuth: tls.RequireAndVerifyClientCert,
	}, nil
}

func clientTLSConfig(caPath, serverName string) (*tls.Config, error) {
	pool, err := loadCAPool(caPath)
	if err != nil {
		return nil, err
	}
	return &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: pool, ServerName: serverName}, nil
}

func loadCAPool(path string) (*x509.CertPool, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(content) {
		return nil, errors.New("CA bundle contains no certificates")
	}
	return pool, nil
}

func envString(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func splitNonEmptyCSV(raw string) []string {
	values := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	return values
}

func envInt(name string, fallback int) (int, error) {
	value, err := envInt64(name, int64(fallback))
	return int(value), err
}

func envInt64(name string, fallback int64) (int64, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}
	return value, nil
}

func envFloat(name string, fallback float64) (float64, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}
	return value, nil
}

func envBool(name string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	return err == nil && value
}

func fatalIf(logger *slog.Logger, err error, operation string) {
	if err == nil {
		return
	}
	logger.Error(operation+" failed", "error", err)
	os.Exit(1)
}
