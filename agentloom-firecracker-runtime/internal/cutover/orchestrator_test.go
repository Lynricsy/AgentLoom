package cutover

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
	"time"
)

type orchestratorRepository struct {
	migrations []MigrationRecord
	rolledBack []string
}

func (repository *orchestratorRepository) ListPersistentSandboxes(context.Context) ([]LegacySandbox, error) {
	return nil, nil
}
func (repository *orchestratorRepository) EnsurePending(context.Context, LegacySandbox) error {
	return nil
}
func (repository *orchestratorRepository) SetStatus(context.Context, []string, MigrationStatus, string) error {
	return nil
}
func (repository *orchestratorRepository) MarkArchived(context.Context, []string, ArchivedMigration) error {
	return nil
}
func (repository *orchestratorRepository) ListMigrations(context.Context, ...MigrationStatus) ([]MigrationRecord, error) {
	return repository.migrations, nil
}
func (repository *orchestratorRepository) MarkRestoring(context.Context, []string) error { return nil }
func (repository *orchestratorRepository) MarkVerified(context.Context, []string, time.Time) error {
	return nil
}
func (repository *orchestratorRepository) AssertDrained(context.Context) error   { return nil }
func (repository *orchestratorRepository) ActivateCutover(context.Context) error { return nil }
func (repository *orchestratorRepository) MarkRolledBack(_ context.Context, sessionID string, _ time.Time) error {
	repository.rolledBack = append(repository.rolledBack, sessionID)
	return nil
}
func (repository *orchestratorRepository) MarkFinalized(context.Context, string, time.Time) error {
	return nil
}

type orchestratorStore struct{}

func (orchestratorStore) Put(context.Context, string, io.Reader, int64, string) (int64, error) {
	return 0, nil
}
func (orchestratorStore) Remove(context.Context, string) error { return nil }
func (orchestratorStore) Get(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(nil)), nil
}

type orchestratorRuntime struct {
	archive    []byte
	started    []string
	stopped    []string
	archiveErr error
}

func (*orchestratorRuntime) Create(context.Context, MigrationRecord) error { return nil }
func (runtime *orchestratorRuntime) Start(_ context.Context, id string) error {
	runtime.started = append(runtime.started, id)
	return nil
}
func (runtime *orchestratorRuntime) Stop(_ context.Context, id string) error {
	runtime.stopped = append(runtime.stopped, id)
	return nil
}
func (*orchestratorRuntime) Delete(context.Context, string, bool) error       { return nil }
func (*orchestratorRuntime) Restore(context.Context, string, io.Reader) error { return nil }
func (runtime *orchestratorRuntime) WorkspaceArchive(_ context.Context, id string) (io.ReadCloser, error) {
	if runtime.archiveErr != nil {
		return nil, runtime.archiveErr
	}
	if len(runtime.started) == 0 || runtime.started[len(runtime.started)-1] != id {
		panic("archive requested from runtime that was not started")
	}
	return io.NopCloser(bytes.NewReader(runtime.archive)), nil
}
func (*orchestratorRuntime) Verify(context.Context, MigrationRecord) error { return nil }

type orchestratorLegacy struct{ archive []byte }

func (*orchestratorLegacy) Start(context.Context, string) error          { return nil }
func (*orchestratorLegacy) ClearWorkspace(context.Context, string) error { return nil }
func (legacy *orchestratorLegacy) PutWorkspaceArchive(_ context.Context, _ string, archive io.Reader) error {
	content, err := io.ReadAll(archive)
	if err == nil {
		legacy.archive = content
	}
	return err
}
func (legacy *orchestratorLegacy) WorkspaceArchive(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(legacy.archive)), nil
}
func (*orchestratorLegacy) DeleteContainer(context.Context, string) error { return nil }
func (*orchestratorLegacy) DeleteVolume(context.Context, string) error    { return nil }

func TestRollbackUsesLastPublishedNonFirstWorkspaceSession(t *testing.T) {
	first := "11111111-1111-4111-8111-111111111111"
	second := "22222222-2222-4222-8222-222222222222"
	archive := testWorkspaceTar(t, "workspace/new-from-second.txt", []byte("latest"))
	repository := &orchestratorRepository{migrations: []MigrationRecord{
		{SessionID: first, TenantID: "tenant", WorkspaceIdentity: "workspace-shared", LegacyContainerID: "legacy-1", RollbackSourceSessionID: second},
		{SessionID: second, TenantID: "tenant", WorkspaceIdentity: "workspace-shared", LegacyContainerID: "legacy-2", RollbackSourceSessionID: second},
	}}
	runtime := &orchestratorRuntime{archive: archive}
	orchestrator := Orchestrator{Repository: repository, Store: orchestratorStore{}, Runtime: runtime, Legacy: &orchestratorLegacy{}}
	if err := orchestrator.RollbackAll(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(runtime.started) != 1 || runtime.started[0] != second {
		t.Fatalf("rollback used stale first session: %v", runtime.started)
	}
	if len(repository.rolledBack) != 2 {
		t.Fatalf("rollback did not verify every legacy container: %v", repository.rolledBack)
	}
}

func TestRollbackStopsRuntimeWhenArchiveFails(t *testing.T) {
	sessionID := "11111111-1111-4111-8111-111111111111"
	repository := &orchestratorRepository{migrations: []MigrationRecord{
		{
			SessionID:               sessionID,
			TenantID:                "tenant",
			WorkspaceIdentity:       "workspace",
			LegacyContainerID:       "legacy",
			RollbackSourceSessionID: sessionID,
		},
	}}
	runtime := &orchestratorRuntime{archiveErr: errors.New("archive failed")}
	orchestrator := Orchestrator{
		Repository: repository,
		Store:      orchestratorStore{},
		Runtime:    runtime,
		Legacy:     &orchestratorLegacy{},
	}
	if err := orchestrator.RollbackAll(context.Background()); err == nil {
		t.Fatal("expected rollback failure")
	}
	if len(runtime.stopped) != 1 || runtime.stopped[0] != sessionID {
		t.Fatalf("runtime was not stopped after rollback failure: %v", runtime.stopped)
	}
}

func testWorkspaceTar(t *testing.T, name string, content []byte) []byte {
	t.Helper()
	var output bytes.Buffer
	writer := tar.NewWriter(&output)
	if err := writer.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(content)), Typeflag: tar.TypeReg}); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}
