package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/preflight"
)

func main() {
	requiredBytes, err := preflight.RequiredStateBytesFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	allowUnsupported := os.Getenv("FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL") == "true"
	if allowUnsupported && os.Getenv("FIRECRACKER_ENV") != "test" {
		log.Fatal("unsupported-kernel override is restricted to FIRECRACKER_ENV=test")
	}
	result, err := preflight.Check(preflight.Config{
		StateRoot:              valueOrDefault("FIRECRACKER_STATE_ROOT", "/var/lib/agentloom-firecracker"),
		ArtifactRoot:           valueOrDefault("FIRECRACKER_ARTIFACT_ROOT", "/var/lib/agentloom-firecracker/artifacts"),
		ArtifactManifestPath:   valueOrDefault("FIRECRACKER_ARTIFACT_MANIFEST", "/var/lib/agentloom-firecracker/artifacts/manifest.json"),
		GuestCIDR:              valueOrDefault("FIRECRACKER_GUEST_CIDR", "172.30.0.0/16"),
		RequiredStateBytes:     requiredBytes,
		AllowUnsupportedKernel: allowUnsupported,
		AllowSMT:               os.Getenv("FIRECRACKER_SMT_POLICY") == "allow",
		SkipDeviceChecks:       os.Getenv("FIRECRACKER_PREFLIGHT_SKIP_DEVICES") == "true" && os.Getenv("FIRECRACKER_ENV") == "test",
	})
	if err != nil {
		log.Fatalf("preflight failed: %v", err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		log.Fatal(err)
	}
}

func valueOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
