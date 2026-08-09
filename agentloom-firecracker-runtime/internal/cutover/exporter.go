package cutover

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"time"
)

const (
	archiveContentType  = "application/zstd"
	manifestContentType = "application/x-ndjson"
)

type Exporter struct {
	Runtime     LegacyRuntime
	Store       ObjectStore
	Repository  MigrationRepository
	StopTimeout time.Duration
}

func (e *Exporter) ExportAll(ctx context.Context) error {
	if e.Runtime == nil || e.Store == nil || e.Repository == nil {
		return errors.New("cutover exporter dependencies are required")
	}
	if e.StopTimeout <= 0 {
		e.StopTimeout = 10 * time.Second
	}

	sandboxes, err := e.Repository.ListPersistentSandboxes(ctx)
	if err != nil {
		return fmt.Errorf("list persistent sandboxes: %w", err)
	}
	for _, sandbox := range sandboxes {
		if err := e.Repository.EnsurePending(ctx, sandbox); err != nil {
			return fmt.Errorf("ensure pending migration for %s: %w", sandbox.SessionID, err)
		}
	}

	groups := groupSandboxes(sandboxes)
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if err := e.exportGroup(ctx, groups[key]); err != nil {
			return err
		}
	}
	return nil
}

func groupSandboxes(sandboxes []LegacySandbox) map[string][]LegacySandbox {
	groups := make(map[string][]LegacySandbox)
	for _, sandbox := range sandboxes {
		key := sandbox.TenantID + ":" + sandbox.WorkspaceIdentity
		groups[key] = append(groups[key], sandbox)
	}
	for key := range groups {
		sort.Slice(groups[key], func(i, j int) bool {
			return groups[key][i].SessionID < groups[key][j].SessionID
		})
	}
	return groups
}

func (e *Exporter) exportGroup(ctx context.Context, sandboxes []LegacySandbox) error {
	if len(sandboxes) == 0 {
		return nil
	}
	sessionIDs := make([]string, 0, len(sandboxes))
	for _, sandbox := range sandboxes {
		sessionIDs = append(sessionIDs, sandbox.SessionID)
	}
	fail := func(cause error) error {
		message := cause.Error()
		if statusErr := e.Repository.SetStatus(ctx, sessionIDs, StatusFailed, message); statusErr != nil {
			return errors.Join(cause, fmt.Errorf("record failed migration status: %w", statusErr))
		}
		return cause
	}

	for _, sandbox := range sandboxes {
		if err := e.Runtime.Stop(ctx, sandbox.ContainerID, e.StopTimeout); err != nil {
			return fail(fmt.Errorf("stop legacy container %s: %w", sandbox.ContainerID, err))
		}
	}
	if err := e.Repository.SetStatus(ctx, sessionIDs, StatusArchiving, ""); err != nil {
		return fmt.Errorf("mark migrations archiving: %w", err)
	}

	primary := sandboxes[0]
	archiveKey := fmt.Sprintf(
		"tenants/%s/sandbox-runtime-migrations/%s/workspace.tar.zst",
		primary.TenantID,
		primary.SessionID,
	)
	manifestKey := fmt.Sprintf(
		"tenants/%s/sandbox-runtime-migrations/%s/workspace.manifest.jsonl",
		primary.TenantID,
		primary.SessionID,
	)

	source, err := e.Runtime.WorkspaceArchive(ctx, primary.ContainerID)
	if err != nil {
		return fail(fmt.Errorf("open legacy workspace archive: %w", err))
	}
	defer source.Close()

	manifestFile, err := os.CreateTemp("", "agentloom-cutover-manifest-*.jsonl")
	if err != nil {
		return fail(fmt.Errorf("create manifest staging file: %w", err))
	}
	manifestPath := manifestFile.Name()
	defer os.Remove(manifestPath)
	defer manifestFile.Close()

	archiveReader, archiveWriter := io.Pipe()
	type uploadResult struct {
		size int64
		err  error
	}
	uploadDone := make(chan uploadResult, 1)
	go func() {
		size, uploadErr := e.Store.Put(
			ctx,
			archiveKey,
			archiveReader,
			-1,
			archiveContentType,
		)
		uploadDone <- uploadResult{size: size, err: uploadErr}
	}()

	archiveResult, buildErr := BuildWorkspaceArchive(source, archiveWriter, manifestFile)
	if buildErr != nil {
		_ = archiveWriter.CloseWithError(buildErr)
	} else {
		buildErr = archiveWriter.Close()
	}
	upload := <-uploadDone
	if buildErr != nil {
		_ = e.Store.Remove(ctx, archiveKey)
		return fail(fmt.Errorf("build workspace archive: %w", buildErr))
	}
	if upload.err != nil {
		_ = e.Store.Remove(ctx, archiveKey)
		return fail(fmt.Errorf("upload workspace archive: %w", upload.err))
	}
	if upload.size != archiveResult.ArchiveBytes {
		_ = e.Store.Remove(ctx, archiveKey)
		return fail(fmt.Errorf(
			"archive upload size mismatch: uploaded=%d generated=%d",
			upload.size,
			archiveResult.ArchiveBytes,
		))
	}

	if err := manifestFile.Sync(); err != nil {
		_ = e.Store.Remove(ctx, archiveKey)
		return fail(fmt.Errorf("sync workspace manifest: %w", err))
	}
	if _, err := manifestFile.Seek(0, io.SeekStart); err != nil {
		_ = e.Store.Remove(ctx, archiveKey)
		return fail(fmt.Errorf("rewind workspace manifest: %w", err))
	}
	manifestSize, err := e.Store.Put(
		ctx,
		manifestKey,
		manifestFile,
		archiveResult.ManifestBytes,
		manifestContentType,
	)
	if err != nil {
		_ = e.Store.Remove(ctx, archiveKey)
		_ = e.Store.Remove(ctx, manifestKey)
		return fail(fmt.Errorf("upload workspace manifest: %w", err))
	}
	if manifestSize != archiveResult.ManifestBytes {
		_ = e.Store.Remove(ctx, archiveKey)
		_ = e.Store.Remove(ctx, manifestKey)
		return fail(fmt.Errorf(
			"manifest upload size mismatch: uploaded=%d generated=%d",
			manifestSize,
			archiveResult.ManifestBytes,
		))
	}

	if err := e.Repository.MarkArchived(ctx, sessionIDs, ArchivedMigration{
		ArchiveObjectKey:  archiveKey,
		ManifestObjectKey: manifestKey,
		ArchiveSHA256:     archiveResult.ArchiveSHA256,
		ManifestSHA256:    archiveResult.ManifestSHA256,
		FileCount:         archiveResult.FileCount,
		TotalBytes:        archiveResult.TotalBytes,
		ArchivedAt:        time.Now().UTC(),
	}); err != nil {
		return fail(fmt.Errorf("mark migrations archived: %w", err))
	}
	return nil
}
