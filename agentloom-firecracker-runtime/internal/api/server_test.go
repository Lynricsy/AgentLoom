package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agentloom/agentloom-firecracker-runtime/internal/manager"
)

// 以下 stub 仅用于满足 manager.New 的依赖校验；容量端点不触达它们。
type stubDisks struct{}

func (stubDisks) Ensure(context.Context, string, int64) (string, bool, error) { return "", false, nil }
func (stubDisks) Check(context.Context, string) error                        { return nil }
func (stubDisks) Delete(context.Context, string) error                       { return nil }

type stubArtifacts struct{}

func (stubArtifacts) Current() manager.ArtifactSet { return manager.ArtifactSet{} }
func (stubArtifacts) Resolve(string) (manager.ArtifactSet, error) {
	return manager.ArtifactSet{}, errors.New("not implemented")
}

type stubNetwork struct{}

func (stubNetwork) Provision(context.Context, string) (manager.NetworkAllocation, error) {
	return manager.NetworkAllocation{}, errors.New("not implemented")
}
func (stubNetwork) Release(context.Context, manager.Metadata) error { return nil }

type stubLauncher struct{}

func (stubLauncher) Launch(context.Context, manager.LaunchSpec) (manager.Instance, error) {
	return nil, errors.New("not implemented")
}
func (stubLauncher) Reattach(context.Context, manager.Metadata, string) (manager.Instance, error) {
	return nil, errors.New("not implemented")
}
func (stubLauncher) Cleanup(context.Context, manager.Metadata) error { return nil }

type stubChecker struct{}

func (stubChecker) WaitReady(context.Context, manager.Metadata, string) error { return nil }

type stubRecoverer struct{}

func (stubRecoverer) Recover(context.Context, manager.Metadata) (string, error) { return "", nil }

func TestNewServerRegistersActionRoutesWithoutPanic(t *testing.T) {
	server, err := NewServer(
		&manager.Manager{},
		ServerConfig{
			GuestClient:          http.DefaultClient,
			CallbackAllowedHosts: []string{"server"},
			CallbackGateway:      "127.0.0.1:18080",
		},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/vms/runtime:unknown", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unexpected status: %d", response.Code)
	}
}

func TestCapacityEndpointReportsManagerSnapshot(t *testing.T) {
	store, err := manager.NewMetadataStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	capacityConfig := manager.CapacityConfig{MaxVMs: 4, VCPU: 8, MemoryMiB: 16384, DiskGiB: 200}
	capacity, err := manager.NewCapacity(capacityConfig)
	if err != nil {
		t.Fatal(err)
	}
	runtimeManager, err := manager.New(manager.Config{
		Store: store, Capacity: capacity, Disks: stubDisks{}, Artifacts: stubArtifacts{},
		Network: stubNetwork{}, Launcher: stubLauncher{}, GuestChecker: stubChecker{},
		TokenRecoverer: stubRecoverer{}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatal(err)
	}
	server, err := NewServer(
		runtimeManager,
		ServerConfig{
			GuestClient:          http.DefaultClient,
			CallbackAllowedHosts: []string{"server"},
			CallbackGateway:      "127.0.0.1:18080",
		},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/v1/capacity", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.Code)
	}
	var snapshot manager.CapacitySnapshot
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.VMsLimit != capacityConfig.MaxVMs || snapshot.VCPULimit != capacityConfig.VCPU ||
		snapshot.MemoryMiBLimit != capacityConfig.MemoryMiB || snapshot.DiskGiBLimit != capacityConfig.DiskGiB {
		t.Fatalf("limits mismatch: %+v", snapshot)
	}
	if snapshot.VMsUsed != 0 || snapshot.VCPUUsed != 0 || snapshot.MemoryMiBUsed != 0 || snapshot.DiskGiBUsed != 0 {
		t.Fatalf("expected empty usage: %+v", snapshot)
	}
}
