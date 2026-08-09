package network

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	libcni "github.com/containernetworking/cni/libcni"
	current "github.com/containernetworking/cni/pkg/types/100"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type Firewall interface {
	Reconcile(context.Context, []manager.NetworkAllocation) error
}

type Config struct {
	TemplatePath string
	PluginPaths  []string
	NetNSRoot    string
	LeaseRoot    string
	GuestCIDR    string
	Gateway      string
	Nameservers  []string
	TapName      string
	Firewall     Firewall
}

type CNIProvisioner struct {
	config Config
	cni    *libcni.CNIConfig
}

type lease struct {
	SessionID  string                    `json:"sessionId"`
	Allocation manager.NetworkAllocation `json:"allocation"`
}

func NewCNIProvisioner(config Config) (*CNIProvisioner, error) {
	if !filepath.IsAbs(config.TemplatePath) || !filepath.IsAbs(config.NetNSRoot) || !filepath.IsAbs(config.LeaseRoot) ||
		len(config.PluginPaths) == 0 || config.Firewall == nil {
		return nil, errors.New("CNI template, plugin paths, netns/lease roots, and firewall are required")
	}
	if config.TapName == "" {
		config.TapName = "tap0"
	}
	if len(config.Nameservers) == 0 {
		config.Nameservers = []string{"1.1.1.1"}
	}
	if err := os.MkdirAll(config.NetNSRoot, 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(config.LeaseRoot, 0o700); err != nil {
		return nil, err
	}
	return &CNIProvisioner{config: config, cni: libcni.NewCNIConfig(config.PluginPaths, nil)}, nil
}

func (provisioner *CNIProvisioner) Provision(ctx context.Context, id string) (manager.NetworkAllocation, error) {
	if err := manager.ValidateSessionID(id); err != nil {
		return manager.NetworkAllocation{}, err
	}
	namespaceName := "al-" + strings.ReplaceAll(id[:18], "-", "")
	namespacePath := filepath.Join(provisioner.config.NetNSRoot, namespaceName)
	if _, err := os.Stat(namespacePath); err == nil {
		return manager.NetworkAllocation{}, fmt.Errorf("%w: network namespace already exists", manager.ErrConflict)
	}
	if output, err := exec.CommandContext(ctx, "ip", "netns", "add", namespaceName).CombinedOutput(); err != nil {
		return manager.NetworkAllocation{}, fmt.Errorf("create network namespace: %w: %s", err, output)
	}
	rollbackNamespace := true
	defer func() {
		if rollbackNamespace {
			_ = exec.Command("ip", "netns", "delete", namespaceName).Run()
		}
	}()

	list, runtimeConfig, err := provisioner.cniConfig(id, namespacePath)
	if err != nil {
		return manager.NetworkAllocation{}, err
	}
	result, err := provisioner.cni.AddNetworkList(ctx, list, runtimeConfig)
	if err != nil {
		return manager.NetworkAllocation{}, fmt.Errorf("CNI ADD: %w", err)
	}
	rollbackCNI := true
	defer func() {
		if rollbackCNI {
			_ = provisioner.cni.DelNetworkList(context.Background(), list, runtimeConfig)
		}
	}()
	converted, err := current.NewResultFromResult(result)
	if err != nil {
		return manager.NetworkAllocation{}, err
	}
	var selected *current.IPConfig
	for _, configuration := range converted.IPs {
		if configuration.Address.IP.To4() != nil {
			selected = configuration
			break
		}
	}
	if selected == nil || selected.Gateway == nil {
		return manager.NetworkAllocation{}, errors.New("CNI did not return an IPv4 address and gateway")
	}
	allocation := manager.NetworkAllocation{
		GuestIP: selected.Address.IP.String(), Gateway: selected.Gateway.String(), Netmask: net.IP(selected.Address.Mask).String(),
		Nameservers: append([]string(nil), provisioner.config.Nameservers...), MAC: deterministicMAC(id), TapName: provisioner.config.TapName, NetNSPath: namespacePath,
	}
	if err := provisioner.writeLease(lease{SessionID: id, Allocation: allocation}); err != nil {
		return manager.NetworkAllocation{}, err
	}
	active, err := provisioner.readAllocations()
	if err != nil {
		_ = os.Remove(provisioner.leasePath(id))
		return manager.NetworkAllocation{}, err
	}
	if err := provisioner.config.Firewall.Reconcile(ctx, active); err != nil {
		_ = os.Remove(provisioner.leasePath(id))
		return manager.NetworkAllocation{}, err
	}
	rollbackCNI, rollbackNamespace = false, false
	return allocation, nil
}

func (provisioner *CNIProvisioner) Release(ctx context.Context, metadata manager.Metadata) error {
	if metadata.SessionID == "" {
		return nil
	}
	var result error
	if metadata.NetNSPath != "" {
		list, runtimeConfig, err := provisioner.cniConfig(metadata.SessionID, metadata.NetNSPath)
		if err == nil {
			result = errors.Join(result, provisioner.cni.DelNetworkList(ctx, list, runtimeConfig))
		} else {
			result = errors.Join(result, err)
		}
		namespaceName := filepath.Base(metadata.NetNSPath)
		if output, err := exec.CommandContext(ctx, "ip", "netns", "delete", namespaceName).CombinedOutput(); err != nil && !strings.Contains(string(output), "No such file") {
			result = errors.Join(result, fmt.Errorf("delete network namespace: %w: %s", err, output))
		}
	}
	if err := os.Remove(provisioner.leasePath(metadata.SessionID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		result = errors.Join(result, err)
	}
	active, err := provisioner.readAllocations()
	if err != nil {
		return errors.Join(result, err)
	}
	return errors.Join(result, provisioner.config.Firewall.Reconcile(ctx, active))
}

func deterministicMAC(id string) string {
	digest := sha256.Sum256([]byte(id))
	return fmt.Sprintf("06:%02x:%02x:%02x:%02x:%02x", digest[0], digest[1], digest[2], digest[3], digest[4])
}

func (provisioner *CNIProvisioner) cniConfig(id, namespacePath string) (*libcni.NetworkConfigList, *libcni.RuntimeConf, error) {
	content, err := os.ReadFile(provisioner.config.TemplatePath)
	if err != nil {
		return nil, nil, err
	}
	rendered := strings.NewReplacer(
		"${FIRECRACKER_GUEST_CIDR}", provisioner.config.GuestCIDR,
		"${FIRECRACKER_GATEWAY}", provisioner.config.Gateway,
		"${FIRECRACKER_TAP_NAME}", provisioner.config.TapName,
	).Replace(string(content))
	list, err := libcni.ConfListFromBytes([]byte(rendered))
	if err != nil {
		return nil, nil, err
	}
	return list, &libcni.RuntimeConf{ContainerID: id, NetNS: namespacePath, IfName: "eth0"}, nil
}

func (provisioner *CNIProvisioner) leasePath(id string) string {
	return filepath.Join(provisioner.config.LeaseRoot, id+".json")
}

func (provisioner *CNIProvisioner) writeLease(value lease) error {
	content, err := json.Marshal(value)
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(provisioner.config.LeaseRoot, ".lease-*.tmp")
	if err != nil {
		return err
	}
	path := temporary.Name()
	defer os.Remove(path)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(path, provisioner.leasePath(value.SessionID))
}

func (provisioner *CNIProvisioner) readAllocations() ([]manager.NetworkAllocation, error) {
	entries, err := os.ReadDir(provisioner.config.LeaseRoot)
	if err != nil {
		return nil, err
	}
	result := make([]manager.NetworkAllocation, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		content, err := os.ReadFile(filepath.Join(provisioner.config.LeaseRoot, entry.Name()))
		if err != nil {
			return nil, err
		}
		var value lease
		if err := json.Unmarshal(content, &value); err != nil {
			return nil, err
		}
		if err := manager.ValidateSessionID(value.SessionID); err != nil {
			return nil, err
		}
		result = append(result, value.Allocation)
	}
	return result, nil
}
