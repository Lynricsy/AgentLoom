package manager

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"
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
	mutex        sync.Mutex
	path         string
	created      bool
	ensureErr    error
	checkErr     error
	deleted      int
	ensuredIDs   []string
	ensuredSizes []int64
}

func (disk *fakeDisk) Ensure(_ context.Context, id string, sizeGiB int64) (string, bool, error) {
	disk.mutex.Lock()
	defer disk.mutex.Unlock()
	disk.ensuredIDs = append(disk.ensuredIDs, id)
	disk.ensuredSizes = append(disk.ensuredSizes, sizeGiB)
	return disk.path, disk.created, disk.ensureErr
}

func (disk *fakeDisk) Check(context.Context, string) error {
	disk.mutex.Lock()
	defer disk.mutex.Unlock()
	return disk.checkErr
}

func (disk *fakeDisk) Delete(context.Context, string) error {
	disk.mutex.Lock()
	defer disk.mutex.Unlock()
	disk.deleted++
	return nil
}

type fakeNetwork struct {
	mutex        sync.Mutex
	allocation   NetworkAllocation
	provisionErr error
	releaseErr   error
	released     int
}

func (network *fakeNetwork) Provision(context.Context, string) (NetworkAllocation, error) {
	network.mutex.Lock()
	defer network.mutex.Unlock()
	return network.allocation, network.provisionErr
}
func (network *fakeNetwork) Release(context.Context, Metadata) error {
	network.mutex.Lock()
	defer network.mutex.Unlock()
	network.released++
	return network.releaseErr
}

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
	mutex      sync.Mutex
	instance   *fakeInstance
	err        error
	launches   int
	cleanups   int
	cleanupErr error
	launching  chan struct{}
	continueCh chan struct{}
}

func (launcher *fakeLauncher) Launch(context.Context, LaunchSpec) (Instance, error) {
	launcher.mutex.Lock()
	launcher.launches++
	instance, err := launcher.instance, launcher.err
	launching, continueCh := launcher.launching, launcher.continueCh
	launcher.mutex.Unlock()
	if launching != nil {
		close(launching)
	}
	if continueCh != nil {
		<-continueCh
	}
	return instance, err
}
func (launcher *fakeLauncher) Reattach(context.Context, Metadata, string) (Instance, error) {
	return launcher.instance, launcher.err
}
func (launcher *fakeLauncher) Cleanup(context.Context, Metadata) error {
	launcher.cleanups++
	return launcher.cleanupErr
}

type concurrentLauncher struct {
	launched chan string
	gates    map[string]chan struct{}
}

func (launcher *concurrentLauncher) Launch(_ context.Context, spec LaunchSpec) (Instance, error) {
	launcher.launched <- spec.Metadata.SessionID
	<-launcher.gates[spec.Metadata.SessionID]
	return &fakeInstance{}, nil
}

func (launcher *concurrentLauncher) Reattach(context.Context, Metadata, string) (Instance, error) {
	return nil, errors.New("not used")
}

func (launcher *concurrentLauncher) Cleanup(context.Context, Metadata) error {
	return nil
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

func TestConcurrentCreateInspectAndStopUsePerSessionLease(t *testing.T) {
	fixture := newFixture(t, nil)
	fixture.launcher.launching = make(chan struct{})
	fixture.launcher.continueCh = make(chan struct{})
	result := make(chan error, 1)
	go func() {
		_, err := fixture.manager.Create(context.Background(), validRequest())
		result <- err
	}()
	select {
	case <-fixture.launcher.launching:
	case <-time.After(time.Second):
		t.Fatal("create did not reach launcher")
	}
	metadata, err := fixture.manager.Inspect(testID)
	if err != nil || metadata.State != StateCreating {
		t.Fatalf("inspect during create = %#v, %v", metadata, err)
	}
	if _, err := fixture.manager.Create(context.Background(), validRequest()); !errors.Is(err, ErrConflict) {
		t.Fatalf("concurrent create must be rejected, got %v", err)
	}
	if _, err := fixture.manager.Stop(context.Background(), testID); !errors.Is(err, ErrConflict) {
		t.Fatalf("stop during create must be rejected, got %v", err)
	}
	close(fixture.launcher.continueCh)
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}

func TestCreatesForDifferentSessionsRunSlowOperationsConcurrently(t *testing.T) {
	fixture := newFixture(t, nil)
	secondID := "22222222-2222-4222-8222-222222222222"
	launcher := &concurrentLauncher{
		launched: make(chan string, 2),
		gates: map[string]chan struct{}{
			testID:   make(chan struct{}),
			secondID: make(chan struct{}),
		},
	}
	fixture.manager.launcher = launcher
	results := make(chan error, 2)
	for _, id := range []string{testID, secondID} {
		request := validRequest()
		request.ID = id
		go func() {
			_, err := fixture.manager.Create(context.Background(), request)
			results <- err
		}()
	}
	launched := map[string]bool{}
	for range 2 {
		select {
		case id := <-launcher.launched:
			launched[id] = true
		case <-time.After(time.Second):
			t.Fatal("slow create operation remained under the global lock")
		}
	}
	for _, id := range []string{testID, secondID} {
		if !launched[id] {
			t.Fatalf("session %s did not launch concurrently", id)
		}
		metadata, err := fixture.manager.Inspect(id)
		if err != nil || metadata.State != StateCreating {
			t.Fatalf("inspect %s during create = %#v, %v", id, metadata, err)
		}
		close(launcher.gates[id])
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
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

func TestRecoverMovesMissingPersistentVMToRestartableStoppedState(t *testing.T) {
	fixture := newFixture(t, nil)
	now := time.Now().UTC()
	metadata := Metadata{
		SchemaVersion: 1, SessionID: testID,
		ArtifactDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Resources:      Resources{CPU: 1, VCPUs: 1, MemoryMiB: 512, DiskGiB: 2},
		LifecycleMode:  LifecyclePersistent,
		DiskPath:       fixture.disk.path,
		State:          StateRunning,
		PID:            999999999,
		APISocketPath:  "/run/missing-firecracker.socket",
		GuestIP:        "172.30.0.2",
		GuestMAC:       "06:01:02:03:04:05",
		TapName:        "tap0",
		NetNSPath:      "/run/netns/test",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := fixture.store.Write(metadata); err != nil {
		t.Fatal(err)
	}
	if err := fixture.manager.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	recovered, err := fixture.store.Read(testID)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.State != StateStopped || recovered.PID != 0 || recovered.APISocketPath != "" {
		t.Fatalf("unexpected recovered metadata: %#v", recovered)
	}
	if fixture.network.released != 1 {
		t.Fatalf("expected one network release, got %d", fixture.network.released)
	}
	if fixture.launcher.cleanups != 1 {
		t.Fatalf("expected stale launcher artifacts to be cleaned, got %d calls", fixture.launcher.cleanups)
	}
	if _, err := fixture.manager.Start(context.Background(), testID); err != nil {
		t.Fatalf("persistent VM must be restartable after crash recovery: %v", err)
	}
}

func TestRecoverRetainsCleanupHandlesUntilNetworkReleaseCanBeRetried(t *testing.T) {
	fixture := newFixture(t, nil)
	now := time.Now().UTC()
	metadata := Metadata{
		SchemaVersion: 1, SessionID: testID,
		ArtifactDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Resources:      Resources{CPU: 1, VCPUs: 1, MemoryMiB: 512, DiskGiB: 2},
		LifecycleMode:  LifecyclePersistent,
		DiskPath:       fixture.disk.path,
		State:          StateRunning,
		PID:            999999999,
		APISocketPath:  "/run/missing-firecracker.socket",
		GuestIP:        "172.30.0.2",
		GuestMAC:       "06:01:02:03:04:05",
		TapName:        "tap0",
		NetNSPath:      "/run/netns/test",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := fixture.store.Write(metadata); err != nil {
		t.Fatal(err)
	}
	fixture.network.releaseErr = errors.New("transient CNI cleanup failure")
	if err := fixture.manager.Recover(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected fail-closed cleanup error, got %v", err)
	}
	failed, err := fixture.store.Read(testID)
	if err != nil {
		t.Fatal(err)
	}
	if failed.State != StateFailed ||
		failed.PID != metadata.PID ||
		failed.APISocketPath != metadata.APISocketPath ||
		failed.NetNSPath != metadata.NetNSPath {
		t.Fatalf("cleanup handles were lost after release failure: %#v", failed)
	}

	fixture.network.releaseErr = nil
	if err := fixture.manager.Recover(context.Background()); err != nil {
		t.Fatalf("cleanup retry failed: %v", err)
	}
	recovered, err := fixture.store.Read(testID)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.State != StateStopped || hasRuntimeCleanupHandles(recovered) {
		t.Fatalf("cleanup retry did not produce restartable stopped metadata: %#v", recovered)
	}
	if fixture.network.released != 2 || fixture.launcher.cleanups != 2 {
		t.Fatalf(
			"expected both cleanup layers to retry, network=%d launcher=%d",
			fixture.network.released,
			fixture.launcher.cleanups,
		)
	}
}

func TestRecoverKeepsFailedCreateFailedWhenMutableDiskWasDeleted(t *testing.T) {
	fixture := newFixture(t, nil)
	now := time.Now().UTC()
	fixture.disk.checkErr = os.ErrNotExist
	metadata := Metadata{
		SchemaVersion: 1, SessionID: testID,
		ArtifactDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Resources:      Resources{CPU: 1, VCPUs: 1, MemoryMiB: 512, DiskGiB: 2},
		LifecycleMode:  LifecyclePersistent,
		DiskPath:       fixture.disk.path,
		State:          StateFailed,
		Failure:        "guest readiness failed",
		PID:            999999999,
		APISocketPath:  "/run/missing-firecracker.socket",
		GuestIP:        "172.30.0.2",
		GuestMAC:       "06:01:02:03:04:05",
		TapName:        "tap0",
		NetNSPath:      "/run/netns/test",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := fixture.store.Write(metadata); err != nil {
		t.Fatal(err)
	}
	if err := fixture.manager.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	recovered, err := fixture.store.Read(testID)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.State != StateFailed ||
		recovered.DiskPath != "" ||
		hasRuntimeCleanupHandles(recovered) {
		t.Fatalf("failed create was incorrectly promoted to restartable: %#v", recovered)
	}
	if snapshot := fixture.capacity.Snapshot(); snapshot.DiskGiBUsed != 0 {
		t.Fatalf("missing failed-create disk remained reserved: %#v", snapshot)
	}
}

func TestIsExpectedVMProcessAcceptsFirecrackerExecutable(t *testing.T) {
	source, err := os.Open("/bin/sleep")
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	executable := filepath.Join(t.TempDir(), "firecracker-test")
	target, err := os.OpenFile(executable, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(target, source); err != nil {
		_ = target.Close()
		t.Fatal(err)
	}
	if err := target.Close(); err != nil {
		t.Fatal(err)
	}
	process := exec.Command(executable, "30")
	if err := process.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = process.Process.Kill()
		_ = process.Wait()
	}()
	if !isExpectedVMProcess(process.Process.Pid) {
		t.Fatal("Firecracker executable PID must be accepted for manager recovery")
	}
	if isExpectedVMProcess(os.Getpid()) {
		t.Fatal("manager test process must not be accepted as a Firecracker VM")
	}
}
