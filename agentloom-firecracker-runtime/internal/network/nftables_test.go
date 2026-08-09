package network

import (
	"strings"
	"testing"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
	current "github.com/containernetworking/cni/pkg/types/100"
)

func TestNFTablesRulesDenyPrivateEgressAndLimitHostIngress(t *testing.T) {
	firewall, err := NewNFTables("nft", 18080, []string{"10.42.0.0/16"})
	if err != nil {
		t.Fatal(err)
	}
	rules := firewall.ruleset([]string{"172.30.0.2", "172.30.0.3"})
	for _, required := range []string{
		"ip saddr @guest_ips ct state established,related accept",
		"ip saddr @guest_ips tcp dport 18080 accept",
		"ip saddr @guest_ips drop",
		"ip saddr @guest_ips ip daddr @guest_ips drop",
		"ip saddr @guest_ips ip daddr @allowed_private_ipv4_cidrs accept",
		"ip saddr @guest_ips ip daddr @private_ipv4_cidrs drop",
		"10.42.0.0/16",
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

func TestNFTablesRejectsInvalidPrivateEgressCIDR(t *testing.T) {
	t.Parallel()
	if _, err := NewNFTables("nft", 18080, []string{"not-a-cidr"}); err == nil {
		t.Fatal("expected invalid private egress CIDR to fail")
	}
}

func TestGuestMACUsesCNIPseudoVMInterface(t *testing.T) {
	mac, err := guestMAC(&current.Result{Interfaces: []*current.Interface{
		{Name: "eth0", Sandbox: "/run/netns/test", Mac: "06:00:00:00:00:01"},
		{Name: "tap0", Sandbox: "11111111-1111-4111-8111-111111111111", Mac: "ca:31:56:9b:b9:96"},
	}}, "11111111-1111-4111-8111-111111111111")
	if err != nil {
		t.Fatal(err)
	}
	if mac != "ca:31:56:9b:b9:96" {
		t.Fatalf("unexpected guest MAC: %s", mac)
	}
}

func TestLeaseConfigCarriesPublicDNSAndIsolatedTap(t *testing.T) {
	allocation := manager.NetworkAllocation{GuestIP: "172.30.0.2", Nameservers: []string{"1.1.1.1"}, TapName: "tap0", NetNSPath: "/run/netns/al-id"}
	if allocation.Nameservers[0] != "1.1.1.1" || allocation.TapName != "tap0" {
		t.Fatal("network allocation contract drifted")
	}
}
