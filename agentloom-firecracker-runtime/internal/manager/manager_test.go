package manager

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

const testID = "11111111-1111-4111-8111-111111111111"

type fakeArtifacts struct{ set ArtifactSet }

func (value fakeArtifacts) Current() ArtifactSet { return value.set }
func (value fakeArtifacts) Resolve(digest string) (ArtifactSet, error) {
	if digest != value.set.Digest {
		return ArtifactSet{}, errors.New("missing artifact")
	}
	return value.set, nil
}

type fakeDisk struct {
	path         string
	created      bool
	ensureErr    error
	checkErr     error
	deleted      int
	ensuredIDs   []string
	ensuredSizes []int64
}

func (disk *fakeDisk) Ensure(_ context.Context, id string, sizeGiB int64) (string, bool, error) {
	disk.ensuredIDs = append(disk.ensuredIDs, id)
	disk.ensuredSizes = append(disk.ensuredSizes, sizeGiB)
	return disk.path, disk.created, disk.ensureErr
}
func (disk *fakeDisk) Check(context.Context, string) error  { return disk.checkErr }
func (disk *fakeDisk) Delete(context.Context, string) error { disk.deleted++; return nil }

type fakeNetwork struct {
	allocation   NetworkAllocation
	provisionErr error
	released     int
}

func (network *fakeNetwork) Provision(context.Context, string) (NetworkAllocation, error) {
	return network.allocation, network.provisionErr
}
func (network *fakeNetwork) Release(context.Context, Metadata) error { network.released++; return nil }

type fakeInstance struct {
	shutdownErr error
	killed      bool
	stopped     bool
}

func (instance *fakeInstance) PID() int              { return 12345 }
func (instance *fakeInstance) APISocketPath() string { return "/run/firecracker.socket" }
func (instance *fakeInstance) Shutdown(context.Context) error {
	if instance.shutdownErr == nil {
		instance.stopped = true
	}
	return instance.shutdownErr
}
func (instance *fakeInstance) Kill(context.Context) error {
	instance.killed, instance.stopped = true, true
	return nil
}
func (instance *fakeInstance) Wait(ctx context.Context) error {
	if instance.stopped {
		return nil
	}
	return ctx.Err()
}

type fakeLauncher struct {
	instance *fakeInstance
	err      error
	launches int
}

func (launcher *fakeLauncher) Launch(context.Context, LaunchSpec) (Instance, error) {
	launcher.launches++
	return launcher.instance, launcher.err
}
func (launcher *fakeLauncher) Reattach(context.Context, Metadata, string) (Instance, error) {
	return launcher.instance, launcher.err
}

type fakeChecker struct{ err error }

func (checker fakeChecker) WaitReady(context.Context, Metadata, string) error { return checker.err }

type fakeRecoverer struct {
	token string
	err   error
}

func (recoverer fakeRecoverer) Recover(context.Context, Metadata) (string, error) {
	return recoverer.token, recoverer.err
}

type fixture struct {
	manager  *Manager
	store    *MetadataStore
	capacity *Capacity
	disk     *fakeDisk
	network  *fakeNetwork
	launcher *fakeLauncher
}

func newFixture(t *testing.T, checkerError error) fixture {
	t.Helper()
	store, err := NewMetadataStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	capacity, err := NewCapacity(CapacityConfig{MaxVMs: 2, VCPU: 4, MemoryMiB: 4096, DiskGiB: 20})
	if err != nil {
		t.Fatal(err)
	}
	disk := &fakeDisk{path: filepath.Join(t.TempDir(), "mutable.ext4"), created: true}
	network := &fakeNetwork{allocation: NetworkAllocation{GuestIP: "172.30.0.2", Gateway: "172.30.0.1", Netmask: "255.255.255.0", MAC: "06:01:02:03:04:05", TapName: "tap0", NetNSPath: "/run/netns/test"}}
	launcher := &fakeLauncher{instance: &fakeInstance{}}
	value, err := New(Config{Store: store, Capacity: capacity, Disks: disk,
		Artifacts: fakeArtifacts{set: ArtifactSet{Digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", GuestAPI: "v1"}},
		Network:   network, Launcher: launcher, GuestChecker: fakeChecker{err: checkerError}, TokenRecoverer: fakeRecoverer{token: "token"}, Logger: slog.New(slog.NewTextHandler(os.Stderr, nil))})
	if err != nil {
		t.Fatal(err)
	}
	return fixture{manager: value, store: store, capacity: capacity, disk: disk, network: network, launcher: launcher}
}

func validRequest() CreateRequest {
	return CreateRequest{ID: testID, CPU: 1.5, MemoryMiB: 512, DiskGiB: 2, LifecycleMode: LifecyclePersistent}
}

func TestCreateIsIdempotentAndRejectsImmutableDrift(t *testing.T) {
	fixture := newFixture(t, nil)
	first, err := fixture.manager.Create(context.Background(), validRequest())
	if err != nil {
		t.Fatal(err)
	}
	second, err := fixture.manager.Create(context.Background(), validRequest())
	if err != nil {
		t.Fatal(err)
	}
	if first != second || fixture.launcher.launches != 1 {
		t.Fatalf("create was not idempotent: launches=%d", fixture.launcher.launches)
	}
	changed := validRequest()
	changed.MemoryMiB = 1024
	if _, err := fixture.manager.Create(context.Background(), changed); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	content, err := os.ReadFile(filepath.Join(fixture.store.root, "vms", testID, "metadata.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(content) == "" || containsSecret(string(content)) {
		t.Fatal("guest token was persisted")
	}
}

func TestLogicalWorkspaceIsExclusiveButUsesPerSessionDisksAndCapacity(t *testing.T) {
	fixture := newFixture(t, nil)
	workspaceID := "22222222-2222-4222-8222-222222222222"
	first := validRequest()
	first.WorkspaceID = workspaceID
	if _, err := fixture.manager.Create(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	second := validRequest()
	second.ID = "33333333-3333-4333-8333-333333333333"
	second.WorkspaceID = workspaceID
	second.DiskGiB = 3
	if _, err := fixture.manager.Create(context.Background(), second); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected active workspace conflict, got %v", err)
	}
	if _, err := fixture.manager.Stop(context.Background(), first.ID); err != nil {
		t.Fatal(err)
	}
	fixture.launcher.instance = &fakeInstance{}
	if _, err := fixture.manager.Create(context.Background(), second); err != nil {
		t.Fatal(err)
	}
	if len(fixture.disk.ensuredIDs) != 2 ||
		fixture.disk.ensuredIDs[0] != first.ID ||
		fixture.disk.ensuredIDs[1] != second.ID {
		t.Fatalf("per-session disk identities were not used: %v", fixture.disk.ensuredIDs)
	}
	if fixture.disk.ensuredSizes[0] != 2 || fixture.disk.ensuredSizes[1] != 3 {
		t.Fatalf("per-session disk sizes were not preserved: %v", fixture.disk.ensuredSizes)
	}
	if snapshot := fixture.manager.Capacity(); snapshot.DiskGiBUsed != 5 {
		t.Fatalf("disk capacity was not charged per session: %+v", snapshot)
	}
}

func TestDeleteWithoutDiskRetainsTrackedMetadataAndCapacity(t *testing.T) {
	fixture := newFixture(t, nil)
	if _, err := fixture.manager.Create(context.Background(), validRequest()); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.manager.Stop(context.Background(), testID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.manager.Delete(context.Background(), testID, false); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.store.Read(testID); err != nil {
		t.Fatalf("preserved disk lost its metadata: %v", err)
	}
	if fixture.disk.deleted != 0 {
		t.Fatal("preserved disk was deleted")
	}
	if snapshot := fixture.manager.Capacity(); snapshot.DiskGiBUsed != 2 {
		t.Fatalf("preserved disk lost capacity accounting: %+v", snapshot)
	}
}

func containsSecret(content string) bool {
	return len(content) >= 64 && (contains(content, "token") || contains(content, "bearer"))
}

func contains(value, needle string) bool {
	for index := 0; index+len(needle) <= len(value); index++ {
		if value[index:index+len(needle)] == needle {
			return true
		}
	}
	return false
}

func TestCreateFailureRollsBackInReverseAndPersistsFailedState(t *testing.T) {
	fixture := newFixture(t, errors.New("guest unavailable"))
	if _, err := fixture.manager.Create(context.Background(), validRequest()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected unavailable, got %v", err)
	}
	if !fixture.launcher.instance.killed || fixture.network.released != 1 || fixture.disk.deleted != 1 {
		t.Fatalf("rollback incomplete: killed=%v released=%d deleted=%d", fixture.launcher.instance.killed, fixture.network.released, fixture.disk.deleted)
	}
	metadata, err := fixture.store.Read(testID)
	if err != nil {
		t.Fatal(err)
	}
	if metadata.State != StateFailed || fixture.capacity.Snapshot().DiskGiBUsed != 0 {
		t.Fatalf("unexpected rollback state: %+v", metadata)
	}
}

func TestPersistentStopStartRetainsDiskReservationAndPinnedArtifact(t *testing.T) {
	fixture := newFixture(t, nil)
	created, err := fixture.manager.Create(context.Background(), validRequest())
	if err != nil {
		t.Fatal(err)
	}
	stopped, err := fixture.manager.Stop(context.Background(), testID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := fixture.capacity.Snapshot()
	if stopped.State != StateStopped || fixture.disk.deleted != 0 || snapshot.VMsUsed != 0 || snapshot.DiskGiBUsed != 2 {
		t.Fatalf("persistent stop released durable state: metadata=%+v capacity=%+v", stopped, snapshot)
	}
	fixture.launcher.instance = &fakeInstance{}
	started, err := fixture.manager.Start(context.Background(), testID)
	if err != nil {
		t.Fatal(err)
	}
	if started.State != StateRunning || started.ArtifactDigest != created.ArtifactDigest || fixture.launcher.launches != 2 {
		t.Fatalf("persistent start did not reuse pinned runtime: %+v", started)
	}
}

func TestStopFallsBackToKillAndDeleteRemovesDurableState(t *testing.T) {
	fixture := newFixture(t, nil)
	fixture.launcher.instance.shutdownErr = errors.New("ctrl-alt-del failed")
	if _, err := fixture.manager.Create(context.Background(), validRequest()); err != nil {
		t.Fatal(err)
	}
	stopped, err := fixture.manager.Stop(context.Background(), testID)
	if err != nil {
		t.Fatal(err)
	}
	if !fixture.launcher.instance.killed || stopped.State != StateStopped || stopped.Failure == "" {
		t.Fatalf("forced stop was not recorded: %+v", stopped)
	}
	if err := fixture.manager.Delete(context.Background(), testID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.store.Read(testID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("metadata still exists: %v", err)
	}
	if fixture.capacity.Snapshot().DiskGiBUsed != 0 || fixture.disk.deleted != 1 {
		t.Fatal("delete did not release durable capacity")
	}
}

func TestCapacitySeparatesActiveComputeFromDurableDisk(t *testing.T) {
	capacity, err := NewCapacity(CapacityConfig{MaxVMs: 1, VCPU: 1, MemoryMiB: 512, DiskGiB: 4})
	if err != nil {
		t.Fatal(err)
	}
	resources := Resources{CPU: 1, VCPUs: 1, MemoryMiB: 512, DiskGiB: 2}
	if err := capacity.Reserve(testID, resources, true); err != nil {
		t.Fatal(err)
	}
	capacity.Deactivate(testID)
	secondID := "22222222-2222-4222-8222-222222222222"
	if err := capacity.Reserve(secondID, resources, true); err != nil {
		t.Fatal(err)
	}
	snapshot := capacity.Snapshot()
	if snapshot.VMsUsed != 1 || snapshot.DiskGiBUsed != 4 {
		t.Fatalf("unexpected capacity snapshot: %+v", snapshot)
	}
	thirdID := "33333333-3333-4333-8333-333333333333"
	if err := capacity.Reserve(thirdID, Resources{CPU: .5, VCPUs: 1, MemoryMiB: 256, DiskGiB: 1}, false); !errors.Is(err, ErrCapacity) {
		t.Fatalf("expected disk capacity failure, got %v", err)
	}
}

func TestMetadataStoreRejectsTraversalAndWritesAtomically(t *testing.T) {
	store, err := NewMetadataStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.VMDir("../../etc"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected traversal rejection, got %v", err)
	}
	metadata := Metadata{SchemaVersion: 1, SessionID: testID, State: StateStopped}
	if err := store.Write(metadata); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(store.root, "vms", testID, "metadata.json"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("metadata mode is %o", info.Mode().Perm())
	}
}
