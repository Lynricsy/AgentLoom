package network

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"os/exec"
	"sort"
	"strings"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type NFTables struct {
	binary              string
	relayPort           int
	allowedPrivateCIDRs []string
}

func NewNFTables(binary string, relayPort int, allowedPrivateCIDRs []string) (*NFTables, error) {
	if binary == "" {
		binary = "nft"
	}
	if relayPort < 1 || relayPort > 65535 {
		return nil, fmt.Errorf("invalid callback relay port")
	}
	normalizedCIDRs := make([]string, 0, len(allowedPrivateCIDRs))
	seen := make(map[string]struct{}, len(allowedPrivateCIDRs))
	for _, rawCIDR := range allowedPrivateCIDRs {
		trimmed := strings.TrimSpace(rawCIDR)
		if trimmed == "" {
			continue
		}
		ip, network, err := net.ParseCIDR(trimmed)
		if err != nil || ip.To4() == nil {
			return nil, fmt.Errorf("invalid private egress CIDR %q", rawCIDR)
		}
		canonical := network.String()
		if _, exists := seen[canonical]; exists {
			continue
		}
		seen[canonical] = struct{}{}
		normalizedCIDRs = append(normalizedCIDRs, canonical)
	}
	sort.Strings(normalizedCIDRs)
	return &NFTables{
		binary:              binary,
		relayPort:           relayPort,
		allowedPrivateCIDRs: normalizedCIDRs,
	}, nil
}

func (firewall *NFTables) Reconcile(ctx context.Context, allocations []manager.NetworkAllocation) error {
	addresses := make([]string, 0, len(allocations))
	for _, allocation := range allocations {
		ip := net.ParseIP(allocation.GuestIP)
		if ip == nil || ip.To4() == nil {
			return fmt.Errorf("invalid guest IP %q", allocation.GuestIP)
		}
		addresses = append(addresses, ip.String())
	}
	sort.Strings(addresses)
	rules := firewall.ruleset(addresses)
	command := exec.CommandContext(ctx, firewall.binary, "-f", "-")
	command.Stdin = strings.NewReader(rules)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("apply nftables transaction: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

func (firewall *NFTables) ruleset(addresses []string) string {
	elements := ""
	if len(addresses) > 0 {
		elements = " elements = { " + strings.Join(addresses, ", ") + " };"
	}
	allowedPrivateElements := ""
	if len(firewall.allowedPrivateCIDRs) > 0 {
		allowedPrivateElements = " elements = { " + strings.Join(firewall.allowedPrivateCIDRs, ", ") + " };"
	}
	return fmt.Sprintf(`destroy table inet agentloom_firecracker
destroy table ip agentloom_firecracker_nat
add table inet agentloom_firecracker
add set inet agentloom_firecracker guest_ips { type ipv4_addr; flags interval;%s }
add set inet agentloom_firecracker private_ipv4_cidrs { type ipv4_addr; flags interval; elements = { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4 }; }
add set inet agentloom_firecracker allowed_private_ipv4_cidrs { type ipv4_addr; flags interval;%s }
add chain inet agentloom_firecracker input { type filter hook input priority filter; policy accept; }
add rule inet agentloom_firecracker input ip saddr @guest_ips ct state established,related accept
add rule inet agentloom_firecracker input ip saddr @guest_ips tcp dport %d accept
add rule inet agentloom_firecracker input ip saddr @guest_ips drop
add chain inet agentloom_firecracker forward { type filter hook forward priority filter; policy accept; }
add rule inet agentloom_firecracker forward ip daddr @guest_ips ct state established,related accept
add rule inet agentloom_firecracker forward ip saddr @guest_ips ip daddr @guest_ips drop
add rule inet agentloom_firecracker forward ip saddr @guest_ips ip daddr @allowed_private_ipv4_cidrs accept
add rule inet agentloom_firecracker forward ip saddr @guest_ips ip daddr @private_ipv4_cidrs drop
add rule inet agentloom_firecracker forward ip saddr @guest_ips accept
add table ip agentloom_firecracker_nat
add set ip agentloom_firecracker_nat guest_ips { type ipv4_addr; flags interval;%s }
add chain ip agentloom_firecracker_nat postrouting { type nat hook postrouting priority srcnat; policy accept; }
add rule ip agentloom_firecracker_nat postrouting ip saddr @guest_ips masquerade
`, elements, allowedPrivateElements, firewall.relayPort, elements)
}
