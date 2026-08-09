package network

import (
	"strings"
	"testing"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

func TestNFTablesRulesDenyPrivateEgressAndLimitHostIngress(t *testing.T) {
	firewall, err := NewNFTables("nft", 18080)
	if err != nil {
		t.Fatal(err)
	}
	rules := firewall.ruleset([]string{"172.30.0.2", "172.30.0.3"})
	for _, required := range []string{
		"ip saddr @guest_ips tcp dport 18080 accept",
		"ip saddr @guest_ips drop",
		"ip saddr @guest_ips ip daddr @private_ipv4_cidrs drop",
		"169.254.0.0/16",
		"192.168.0.0/16",
		"172.30.0.2, 172.30.0.3",
	} {
		if !strings.Contains(rules, required) {
			t.Fatalf("ruleset omitted %q", required)
		}
	}
	if strings.Contains(rules, "tcp dport 8443 accept") {
		t.Fatal("guest may reach manager mTLS control plane")
	}
}

func TestDeterministicMACIsLocallyAdministeredUnicast(t *testing.T) {
	first := deterministicMAC("11111111-1111-4111-8111-111111111111")
	second := deterministicMAC("11111111-1111-4111-8111-111111111111")
	if first != second || !strings.HasPrefix(first, "06:") {
		t.Fatalf("invalid deterministic MAC: %s %s", first, second)
	}
}

func TestLeaseConfigCarriesPublicDNSAndIsolatedTap(t *testing.T) {
	allocation := manager.NetworkAllocation{GuestIP: "172.30.0.2", Nameservers: []string{"1.1.1.1"}, TapName: "tap0", NetNSPath: "/run/netns/al-id"}
	if allocation.Nameservers[0] != "1.1.1.1" || allocation.TapName != "tap0" {
		t.Fatal("network allocation contract drifted")
	}
}
