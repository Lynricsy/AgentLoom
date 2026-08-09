package cutover

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"time"
)

type Orchestrator struct {
	Repository CutoverRepository
	Store      MigrationObjectStore
	Runtime    CutoverRuntime
	Legacy     RollbackLegacyRuntime
	Now        func() time.Time
}

func (orchestrator *Orchestrator) RestoreAll(ctx context.Context) error {
	if err := orchestrator.validate(false); err != nil {
		return err
	}
	migrations, err := orchestrator.Repository.ListMigrations(ctx, StatusArchived, StatusFailed)
	if err != nil {
		return fmt.Errorf("list archived migrations: %w", err)
	}
	for _, group := range groupMigrations(migrations) {
		if err := orchestrator.restoreGroup(ctx, group); err != nil {
			return err
		}
	}
	return nil
}

func (orchestrator *Orchestrator) restoreGroup(ctx context.Context, migrations []MigrationRecord) error {
	ids := migrationIDs(migrations)
	fail := func(cause error) error {
		if statusErr := orchestrator.Repository.SetStatus(ctx, ids, StatusFailed, cause.Error()); statusErr != nil {
			return errors.Join(cause, fmt.Errorf("record failed restore: %w", statusErr))
		}
		return cause
	}
	if err := orchestrator.Repository.MarkRestoring(ctx, ids); err != nil {
		return fmt.Errorf("mark migrations restoring: %w", err)
	}
	primary := migrations[0]
	archive, cleanup, err := orchestrator.stageObject(ctx, primary.ArchiveObjectKey, primary.ArchiveSHA256)
	if err != nil {
		return fail(fmt.Errorf("stage migration archive: %w", err))
	}
	defer cleanup()

	for _, migration := range migrations {
		if err := orchestrator.Runtime.Create(ctx, migration); err != nil {
			return fail(fmt.Errorf("create Firecracker runtime %s: %w", migration.SessionID, err))
		}
		if _, err := archive.Seek(0, io.SeekStart); err != nil {
			return fail(err)
		}
		if err := orchestrator.Runtime.Restore(ctx, migration.SessionID, archive); err != nil {
			_ = orchestrator.Runtime.Stop(context.Background(), migration.SessionID)
			return fail(fmt.Errorf("restore workspace %s: %w", migration.WorkspaceIdentity, err))
		}
		if err := orchestrator.Runtime.Verify(ctx, migration); err != nil {
			_ = orchestrator.Runtime.Stop(context.Background(), migration.SessionID)
			return fail(fmt.Errorf("verify Firecracker workspace %s: %w", migration.SessionID, err))
		}
		if err := orchestrator.Runtime.Stop(ctx, migration.SessionID); err != nil {
			return fail(fmt.Errorf("stop verified Firecracker runtime %s: %w", migration.SessionID, err))
		}
	}
	if err := orchestrator.Repository.MarkVerified(ctx, ids, orchestrator.now()); err != nil {
		return fail(fmt.Errorf("mark migrations verified: %w", err))
	}
	return nil
}

func (orchestrator *Orchestrator) RollbackAll(ctx context.Context) error {
	if err := orchestrator.validate(true); err != nil {
		return err
	}
	migrations, err := orchestrator.Repository.ListMigrations(ctx, StatusVerified)
	if err != nil {
		return err
	}
	for _, group := range groupMigrations(migrations) {
		if err := orchestrator.rollbackGroup(ctx, group); err != nil {
			return err
		}
	}
	return nil
}

func (orchestrator *Orchestrator) rollbackGroup(ctx context.Context, migrations []MigrationRecord) error {
	primary := migrations[0]
	sourceSessionID := primary.RollbackSourceSessionID
	if sourceSessionID == "" {
		sourceSessionID = primary.SessionID
	}
	found := false
	for _, migration := range migrations {
		if migration.SessionID == sourceSessionID {
			primary = migration
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("rollback source runtime %s is not part of workspace group", sourceSessionID)
	}
	if err := orchestrator.Runtime.Start(ctx, primary.SessionID); err != nil {
		return fmt.Errorf("start Firecracker runtime for rollback %s: %w", primary.SessionID, err)
	}
	source, err := orchestrator.Runtime.WorkspaceArchive(ctx, primary.SessionID)
	if err != nil {
		return err
	}
	archive, err := os.CreateTemp("", "agentloom-rollback-workspace-*.tar")
	if err != nil {
		source.Close()
		return err
	}
	archivePath := archive.Name()
	defer func() {
		archive.Close()
		os.Remove(archivePath)
	}()
	result, buildErr := BuildWorkspaceArchive(io.TeeReader(source, archive), io.Discard, io.Discard)
	closeErr := source.Close()
	if buildErr != nil || closeErr != nil {
		return errors.Join(buildErr, closeErr)
	}
	if err := archive.Sync(); err != nil {
		return err
	}
	if err := orchestrator.Runtime.Stop(ctx, primary.SessionID); err != nil {
		return err
	}

	for _, migration := range migrations {
		if err := orchestrator.Legacy.Start(ctx, migration.LegacyContainerID); err != nil {
			return err
		}
		if err := orchestrator.Legacy.ClearWorkspace(ctx, migration.LegacyContainerID); err != nil {
			return err
		}
		if _, err := archive.Seek(0, io.SeekStart); err != nil {
			return err
		}
		if err := orchestrator.Legacy.PutWorkspaceArchive(ctx, migration.LegacyContainerID, archive); err != nil {
			return err
		}
		legacyArchive, err := orchestrator.Legacy.WorkspaceArchive(ctx, migration.LegacyContainerID)
		if err != nil {
			return err
		}
		verified, verifyErr := BuildWorkspaceArchive(legacyArchive, io.Discard, io.Discard)
		closeErr := legacyArchive.Close()
		if verifyErr != nil || closeErr != nil {
			return errors.Join(verifyErr, closeErr)
		}
		if verified.ManifestSHA256 != result.ManifestSHA256 ||
			verified.FileCount != result.FileCount ||
			verified.TotalBytes != result.TotalBytes {
			return fmt.Errorf("legacy rollback manifest mismatch for %s", migration.SessionID)
		}
		if err := orchestrator.Repository.MarkRolledBack(ctx, migration.SessionID, orchestrator.now()); err != nil {
			return err
		}
	}
	return nil
}

func (orchestrator *Orchestrator) FinalizeAll(ctx context.Context, rollbackWindow time.Duration) error {
	if err := orchestrator.validate(true); err != nil {
		return err
	}
	migrations, err := orchestrator.Repository.ListMigrations(ctx, StatusVerified)
	if err != nil {
		return err
	}
	if len(migrations) == 0 {
		return nil
	}
	now := orchestrator.now()
	for _, migration := range migrations {
		if migration.VerifiedAt == nil {
			return fmt.Errorf("migration %s has no verified timestamp", migration.SessionID)
		}
		if now.Before(migration.VerifiedAt.Add(rollbackWindow)) {
			return fmt.Errorf("migration %s is still inside rollback window", migration.SessionID)
		}
	}
	for _, group := range groupMigrations(migrations) {
		for _, migration := range group {
			if err := orchestrator.Legacy.DeleteContainer(ctx, migration.LegacyContainerID); err != nil {
				return err
			}
		}
		if err := orchestrator.Legacy.DeleteVolume(ctx, group[0].WorkspaceIdentity); err != nil {
			return err
		}
		if err := orchestrator.Store.Remove(ctx, group[0].ArchiveObjectKey); err != nil {
			return err
		}
		if err := orchestrator.Store.Remove(ctx, group[0].ManifestObjectKey); err != nil {
			return err
		}
		for _, migration := range group {
			if err := orchestrator.Repository.MarkFinalized(ctx, migration.SessionID, now); err != nil {
				return err
			}
		}
	}
	return nil
}

func (orchestrator *Orchestrator) stageObject(
	ctx context.Context,
	key string,
	expectedSHA256 string,
) (*os.File, func(), error) {
	source, err := orchestrator.Store.Get(ctx, key)
	if err != nil {
		return nil, func() {}, err
	}
	defer source.Close()
	staged, err := os.CreateTemp("", "agentloom-cutover-archive-*.tar.zst")
	if err != nil {
		return nil, func() {}, err
	}
	cleanup := func() {
		staged.Close()
		os.Remove(staged.Name())
	}
	hash := sha256.New()
	if _, err := io.Copy(io.MultiWriter(staged, hash), source); err != nil {
		cleanup()
		return nil, func() {}, err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expectedSHA256 {
		cleanup()
		return nil, func() {}, fmt.Errorf(
			"archive checksum mismatch: expected=%s actual=%s",
			expectedSHA256,
			actual,
		)
	}
	if err := staged.Sync(); err != nil {
		cleanup()
		return nil, func() {}, err
	}
	return staged, cleanup, nil
}

func (orchestrator *Orchestrator) validate(legacy bool) error {
	if orchestrator.Repository == nil || orchestrator.Store == nil || orchestrator.Runtime == nil || (legacy && orchestrator.Legacy == nil) {
		return errors.New("cutover orchestrator dependencies are required")
	}
	return nil
}

func (orchestrator *Orchestrator) now() time.Time {
	if orchestrator.Now != nil {
		return orchestrator.Now().UTC()
	}
	return time.Now().UTC()
}

func groupMigrations(migrations []MigrationRecord) [][]MigrationRecord {
	groups := make(map[string][]MigrationRecord)
	for _, migration := range migrations {
		key := migration.TenantID + ":" + migration.WorkspaceIdentity
		groups[key] = append(groups[key], migration)
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([][]MigrationRecord, 0, len(keys))
	for _, key := range keys {
		sort.Slice(groups[key], func(i, j int) bool { return groups[key][i].SessionID < groups[key][j].SessionID })
		result = append(result, groups[key])
	}
	return result
}

func migrationIDs(migrations []MigrationRecord) []string {
	ids := make([]string, len(migrations))
	for index, migration := range migrations {
		ids[index] = migration.SessionID
	}
	return ids
}
