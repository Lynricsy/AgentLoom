package network

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

type noopFirewall struct{}

func (noopFirewall) Reconcile(context.Context, []manager.NetworkAllocation) error { return nil }

func TestCNIConfigAssignsTapToJailerIdentity(t *testing.T) {
	root := t.TempDir()
	templatePath := filepath.Join(root, "network.conflist")
	if err := os.WriteFile(templatePath, []byte(`{"cniVersion":"1.0.0","name":"test","plugins":[{"type":"bridge"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	provisioner, err := NewCNIProvisioner(Config{
		TemplatePath: templatePath,
		PluginPaths:  []string{"/opt/cni/bin"},
		NetNSRoot:    filepath.Join(root, "netns"),
		LeaseRoot:    filepath.Join(root, "leases"),
		GuestCIDR:    "172.30.0.0/16",
		Gateway:      "172.30.0.1",
		TapUID:       1234,
		TapGID:       2345,
		Firewall:     noopFirewall{},
	})
	if err != nil {
		t.Fatal(err)
	}
	_, runtimeConfig, err := provisioner.cniConfig("11111111-1111-4111-8111-111111111111", "/run/netns/test")
	if err != nil {
		t.Fatal(err)
	}
	arguments := make(map[string]string, len(runtimeConfig.Args))
	for _, argument := range runtimeConfig.Args {
		arguments[argument[0]] = argument[1]
	}
	if arguments["TC_REDIRECT_TAP_UID"] != "1234" || arguments["TC_REDIRECT_TAP_GID"] != "2345" {
		t.Fatalf("unexpected tap ownership arguments: %#v", arguments)
	}
}
