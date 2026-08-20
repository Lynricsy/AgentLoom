package preflight

import (
	"crypto/sha256"
	"debug/elf"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/artifactpath"
)

type ArtifactFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type ArtifactManifest struct {
	SchemaVersion   int            `json:"schemaVersion"`
	GuestAPIVersion string         `json:"guestApiVersion"`
	ArtifactDigest  string         `json:"artifactDigest"`
	Files           []ArtifactFile `json:"files"`
}

type Config struct {
	StateRoot              string
	ArtifactRoot           string
	ArtifactManifestPath   string
	GuestCIDR              string
	RequiredStateBytes     uint64
	AllowUnsupportedKernel bool
	AllowSMT               bool
	AllowSwap              bool
	SkipDeviceChecks       bool
}

type Result struct {
	Checks   map[string]string `json:"checks"`
	Warnings []string          `json:"warnings,omitempty"`
}

func Check(config Config) (Result, error) {
	result := Result{Checks: make(map[string]string)}
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		return result, fmt.Errorf("unsupported platform %s/%s; linux/amd64 is required", runtime.GOOS, runtime.GOARCH)
	}
	result.Checks["architecture"] = runtime.GOARCH
	if os.Getpagesize() != 4096 {
		return result, fmt.Errorf("unsupported page size %d; 4096 is required", os.Getpagesize())
	}
	result.Checks["pageSize"] = "4096"

	kernelRelease, err := kernelVersion()
	if err != nil {
		return result, err
	}
	if !strings.HasPrefix(kernelRelease, "6.18.") {
		if !config.AllowUnsupportedKernel {
			return result, fmt.Errorf("unsupported host kernel %s; Firecracker v1.16.1 production baseline is 6.18.x", kernelRelease)
		}
		result.Warnings = append(result.Warnings, "unsupported host kernel override enabled")
	}
	result.Checks["kernel"] = kernelRelease

	if !config.SkipDeviceChecks {
		if err := requireReadWrite("/dev/kvm"); err != nil {
			return result, err
		}
		if err := requireReadWrite("/dev/net/tun"); err != nil {
			return result, err
		}
		result.Checks["kvm"] = "read-write"
		result.Checks["tun"] = "read-write"
	}
	if _, err := os.Stat("/sys/fs/cgroup/cgroup.controllers"); err != nil {
		return result, fmt.Errorf("cgroup v2 unavailable: %w", err)
	}
	result.Checks["cgroup"] = "v2"
	for _, binary := range []string{"firecracker", "jailer", "ip", "tc", "nft"} {
		if _, err := exec.LookPath(binary); err != nil {
			return result, fmt.Errorf("required binary %s unavailable: %w", binary, err)
		}
	}
	result.Checks["binaries"] = "firecracker,jailer,ip,tc,nft"

	if err := checkSwap(); err != nil {
		if !config.AllowSwap {
			return result, err
		}
		result.Warnings = append(result.Warnings, "host swap active by test-only override")
	} else {
		result.Checks["swap"] = "disabled"
	}
	if smtActive() {
		if !config.AllowSMT {
			return result, errors.New("SMT is active and FIRECRACKER_SMT_POLICY does not allow it")
		}
		result.Warnings = append(result.Warnings, "SMT active by explicit operator policy")
	}
	result.Checks["smt"] = map[bool]string{true: "active", false: "disabled"}[smtActive()]

	if err := checkCIDRCollision(config.GuestCIDR); err != nil {
		return result, err
	}
	result.Checks["guestCIDR"] = config.GuestCIDR
	if err := checkStateRoot(config.StateRoot, config.RequiredStateBytes); err != nil {
		return result, err
	}
	result.Checks["stateRoot"] = config.StateRoot

	manifest, err := verifyArtifacts(config.ArtifactRoot, config.ArtifactManifestPath)
	if err != nil {
		return result, err
	}
	result.Checks["artifactDigest"] = manifest.ArtifactDigest
	result.Checks["guestAPIVersion"] = manifest.GuestAPIVersion
	return result, nil
}

func kernelVersion() (string, error) {
	var uname syscall.Utsname
	if err := syscall.Uname(&uname); err != nil {
		return "", fmt.Errorf("read kernel version: %w", err)
	}
	bytes := make([]byte, 0, len(uname.Release))
	for _, value := range uname.Release {
		if value == 0 {
			break
		}
		bytes = append(bytes, byte(value))
	}
	return string(bytes), nil
}

func requireReadWrite(path string) error {
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return fmt.Errorf("%s must be read-write: %w", path, err)
	}
	return file.Close()
}

func checkSwap() error {
	content, err := os.ReadFile("/proc/swaps")
	if err != nil {
		return fmt.Errorf("read /proc/swaps: %w", err)
	}
	if len(strings.Fields(string(content))) > 5 {
		return errors.New("host swap must be disabled")
	}
	return nil
}

func smtActive() bool {
	content, err := os.ReadFile("/sys/devices/system/cpu/smt/active")
	return err == nil && strings.TrimSpace(string(content)) == "1"
}

func checkCIDRCollision(rawCIDR string) error {
	_, guestNetwork, err := net.ParseCIDR(rawCIDR)
	if err != nil {
		return fmt.Errorf("invalid guest CIDR %q: %w", rawCIDR, err)
	}
	interfaces, err := net.Interfaces()
	if err != nil {
		return err
	}
	for _, networkInterface := range interfaces {
		addresses, addressErr := networkInterface.Addrs()
		if addressErr != nil {
			return addressErr
		}
		for _, address := range addresses {
			ip, network, parseErr := net.ParseCIDR(address.String())
			if parseErr != nil || ip.IsLoopback() {
				continue
			}
			if guestNetwork.Contains(ip) || network.Contains(guestNetwork.IP) {
				return fmt.Errorf("guest CIDR %s overlaps interface %s route %s", rawCIDR, networkInterface.Name, network)
			}
		}
	}
	return nil
}

func checkStateRoot(root string, requiredBytes uint64) error {
	if root == "" {
		return errors.New("state root is required")
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return fmt.Errorf("create state root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return fmt.Errorf("resolve state root: %w", err)
	}
	if resolved != filepath.Clean(root) {
		return fmt.Errorf("state root must not contain symlinks: %s", root)
	}
	var stats syscall.Statfs_t
	if err := syscall.Statfs(root, &stats); err != nil {
		return fmt.Errorf("stat state root: %w", err)
	}
	available := stats.Bavail * uint64(stats.Bsize)
	if available < requiredBytes {
		return fmt.Errorf("state root has %d bytes available, %d required", available, requiredBytes)
	}
	return nil
}

func verifyArtifacts(root, manifestPath string) (ArtifactManifest, error) {
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		return ArtifactManifest{}, fmt.Errorf("read artifact manifest: %w", err)
	}
	var manifest ArtifactManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return ArtifactManifest{}, fmt.Errorf("decode artifact manifest: %w", err)
	}
	if manifest.SchemaVersion != 1 || manifest.GuestAPIVersion != "v1" || manifest.ArtifactDigest == "" {
		return ArtifactManifest{}, errors.New("artifact manifest version or digest is invalid")
	}
	for _, artifact := range manifest.Files {
		if artifact.Path == "" || len(artifact.SHA256) != 64 {
			return ArtifactManifest{}, errors.New("artifact manifest contains an invalid file entry")
		}
		path, err := artifactpath.Validate(root, artifact.Path)
		if err != nil {
			return ArtifactManifest{}, fmt.Errorf("validate artifact %s: %w", artifact.Path, err)
		}
		if filepath.Base(artifact.Path) == "vmlinux" {
			if err := verifyKernelELF(path); err != nil {
				return ArtifactManifest{}, err
			}
		}
		file, err := os.Open(path)
		if err != nil {
			return ArtifactManifest{}, err
		}
		digest := sha256.New()
		_, copyErr := io.Copy(digest, file)
		closeErr := file.Close()
		if copyErr != nil || closeErr != nil {
			return ArtifactManifest{}, errors.Join(copyErr, closeErr)
		}
		if hex.EncodeToString(digest.Sum(nil)) != artifact.SHA256 {
			return ArtifactManifest{}, fmt.Errorf("artifact checksum mismatch: %s", artifact.Path)
		}
	}
	return manifest, nil
}

func verifyKernelELF(path string) error {
	image, err := elf.Open(path)
	if err != nil {
		return fmt.Errorf("vmlinux is not an ELF image: %w", err)
	}
	defer image.Close()
	if image.Class != elf.ELFCLASS64 || image.Machine != elf.EM_X86_64 {
		return fmt.Errorf(
			"vmlinux has unsupported ELF class or machine: %s/%s",
			image.Class,
			image.Machine,
		)
	}
	return nil
}

func RequiredStateBytesFromEnv() (uint64, error) {
	raw := strings.TrimSpace(os.Getenv("FIRECRACKER_REQUIRED_STATE_BYTES"))
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse FIRECRACKER_REQUIRED_STATE_BYTES: %w", err)
	}
	return value, nil
}
