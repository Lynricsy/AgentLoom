package cutover

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(ctx context.Context, databaseURL string) (*PostgresRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresRepository{pool: pool}, nil
}

func (repository *PostgresRepository) Close() {
	repository.pool.Close()
}

func (repository *PostgresRepository) ListPersistentSandboxes(ctx context.Context) ([]LegacySandbox, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id::text, tenant_id::text, container_id, config
		FROM sandbox_sessions
		WHERE COALESCE(config->>'lifecycleMode', 'session') = 'persistent'
		  AND container_id IS NOT NULL
		ORDER BY tenant_id, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sandboxes []LegacySandbox
	for rows.Next() {
		var sandbox LegacySandbox
		var rawConfig []byte
		if err := rows.Scan(
			&sandbox.SessionID,
			&sandbox.TenantID,
			&sandbox.ContainerID,
			&rawConfig,
		); err != nil {
			return nil, err
		}
		var config struct {
			RestoreWorkspaceID string `json:"restoreWorkspaceId"`
		}
		if err := json.Unmarshal(rawConfig, &config); err != nil {
			return nil, fmt.Errorf("decode sandbox %s config: %w", sandbox.SessionID, err)
		}
		sandbox.RestoreWorkspaceID = strings.TrimSpace(config.RestoreWorkspaceID)
		if sandbox.RestoreWorkspaceID == "" {
			sandbox.WorkspaceIdentity = "sandbox-" + sandbox.SessionID + "-workspace"
		} else {
			sandbox.WorkspaceIdentity = "workspace-" + sandbox.RestoreWorkspaceID + "-volume"
		}
		sandboxes = append(sandboxes, sandbox)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sandboxes, nil
}

func (repository *PostgresRepository) EnsurePending(ctx context.Context, sandbox LegacySandbox) error {
	_, err := repository.pool.Exec(ctx, `
		INSERT INTO sandbox_runtime_migrations (
			sandbox_session_id,
			tenant_id,
			legacy_container_id,
			source_workspace_identity,
			status,
			created_at,
			updated_at
		) VALUES ($1, $2, $3, $4, 'pending', now(), now())
		ON CONFLICT (sandbox_session_id) DO NOTHING
	`, sandbox.SessionID, sandbox.TenantID, sandbox.ContainerID, sandbox.WorkspaceIdentity)
	return err
}

func (repository *PostgresRepository) SetStatus(
	ctx context.Context,
	sessionIDs []string,
	status MigrationStatus,
	message string,
) error {
	if len(sessionIDs) == 0 {
		return nil
	}
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, sessionID := range sessionIDs {
		command, execErr := tx.Exec(ctx, `
			UPDATE sandbox_runtime_migrations
			SET status = $2,
			    error = NULLIF($3, ''),
			    updated_at = now()
			WHERE sandbox_session_id = $1
		`, sessionID, status, message)
		if execErr != nil {
			return execErr
		}
		if command.RowsAffected() != 1 {
			return fmt.Errorf("migration row %s not found", sessionID)
		}
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) MarkArchived(
	ctx context.Context,
	sessionIDs []string,
	migration ArchivedMigration,
) error {
	if len(sessionIDs) == 0 {
		return errors.New("at least one migration session is required")
	}
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, sessionID := range sessionIDs {
		command, execErr := tx.Exec(ctx, `
			UPDATE sandbox_runtime_migrations
			SET archive_object_key = $2,
			    manifest_object_key = $3,
			    archive_sha256 = $4,
			    manifest_sha256 = $5,
			    file_count = $6,
			    total_bytes = $7,
			    status = 'archived',
			    error = NULL,
			    archived_at = $8,
			    updated_at = now()
			WHERE sandbox_session_id = $1
			  AND status = 'archiving'
		`,
			sessionID,
			migration.ArchiveObjectKey,
			migration.ManifestObjectKey,
			migration.ArchiveSHA256,
			migration.ManifestSHA256,
			migration.FileCount,
			migration.TotalBytes,
			migration.ArchivedAt,
		)
		if execErr != nil {
			return execErr
		}
		if command.RowsAffected() != 1 {
			return fmt.Errorf("migration row %s is not archiving", sessionID)
		}
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) ListMigrations(
	ctx context.Context,
	statuses ...MigrationStatus,
) ([]MigrationRecord, error) {
	if len(statuses) == 0 {
		return nil, errors.New("at least one migration status is required")
	}
	values := make([]string, len(statuses))
	for index, status := range statuses {
		values[index] = string(status)
	}
	rows, err := repository.pool.Query(ctx, `
		SELECT migration.sandbox_session_id::text,
		       migration.tenant_id::text,
		       migration.legacy_container_id,
		       migration.source_workspace_identity,
		       migration.archive_object_key,
		       migration.manifest_object_key,
		       migration.archive_sha256,
		       migration.manifest_sha256,
		       migration.file_count,
		       migration.total_bytes,
		       migration.verified_at,
		       COALESCE((session.config->>'cpu')::double precision, 1),
		       COALESCE((session.config->>'memory')::bigint, 1024),
		       COALESCE((session.config->>'disk')::bigint, 10),
		       COALESCE(NULLIF(session.config->>'restoreWorkspaceId', ''), session.id::text),
		       migration.status::text,
		       COALESCE(
		         lease.sandbox_session_id::text,
		         snapshot.config->'runtimePublication'->>'sessionId',
		         ''
		       ),
		       COALESCE(snapshot.storage_key, ''),
		       COALESCE(snapshot.config->'runtimePublication'->>'archiveSha256', '')
		FROM sandbox_runtime_migrations migration
		JOIN sandbox_sessions session ON session.id = migration.sandbox_session_id
		LEFT JOIN workspace_snapshots snapshot
		  ON snapshot.id::text = NULLIF(session.config->>'restoreWorkspaceId', '')
		 AND snapshot.tenant_id = migration.tenant_id
		LEFT JOIN workspace_runtime_leases lease
		  ON lease.workspace_id = snapshot.id
		 AND lease.tenant_id = migration.tenant_id
		 AND lease.lease_expires_at > now()
		WHERE migration.status::text = ANY($1::text[])
		  AND migration.archive_object_key IS NOT NULL
		  AND migration.manifest_object_key IS NOT NULL
		ORDER BY migration.tenant_id, migration.source_workspace_identity, migration.sandbox_session_id
	`, values)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var migrations []MigrationRecord
	for rows.Next() {
		var migration MigrationRecord
		if err := rows.Scan(
			&migration.SessionID,
			&migration.TenantID,
			&migration.LegacyContainerID,
			&migration.WorkspaceIdentity,
			&migration.ArchiveObjectKey,
			&migration.ManifestObjectKey,
			&migration.ArchiveSHA256,
			&migration.ManifestSHA256,
			&migration.FileCount,
			&migration.TotalBytes,
			&migration.VerifiedAt,
			&migration.CPU,
			&migration.MemoryMiB,
			&migration.DiskGiB,
			&migration.WorkspaceID,
			&migration.Status,
			&migration.RollbackSourceSessionID,
			&migration.SnapshotObjectKey,
			&migration.SnapshotSHA256,
		); err != nil {
			return nil, err
		}
		migrations = append(migrations, migration)
	}
	return migrations, rows.Err()
}

func (repository *PostgresRepository) MarkRestoring(ctx context.Context, sessionIDs []string) error {
	if len(sessionIDs) == 0 {
		return errors.New("at least one migration session is required")
	}
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, sessionID := range sessionIDs {
		command, execErr := tx.Exec(ctx, `
			UPDATE sandbox_runtime_migrations
			SET status = 'restoring',
			    restored_at = NULL,
			    verified_at = NULL,
			    error = NULL,
			    updated_at = now()
			WHERE sandbox_session_id = $1
			  AND status IN ('archived', 'failed')
		`, sessionID)
		if execErr != nil {
			return execErr
		}
		if command.RowsAffected() != 1 {
			return fmt.Errorf("migration row %s is not archived or retryable", sessionID)
		}
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) MarkVerified(
	ctx context.Context,
	sessionIDs []string,
	verifiedAt time.Time,
) error {
	if len(sessionIDs) == 0 {
		return errors.New("at least one migration session is required")
	}
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, sessionID := range sessionIDs {
		command, execErr := tx.Exec(ctx, `
			UPDATE sandbox_runtime_migrations
			SET status = 'verified',
			    restored_at = COALESCE(restored_at, $2),
			    verified_at = $2,
			    error = NULL,
			    updated_at = now()
			WHERE sandbox_session_id = $1
			  AND status = 'restoring'
		`, sessionID, verifiedAt)
		if execErr != nil {
			return execErr
		}
		if command.RowsAffected() != 1 {
			return fmt.Errorf("migration row %s is not restoring", sessionID)
		}
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) AssertDrained(ctx context.Context) error {
	var sessionCount, executionCount, promptCount int64
	if err := repository.pool.QueryRow(ctx, `
		SELECT count(*)
		FROM sandbox_sessions
		WHERE (
		  COALESCE(config->>'lifecycleMode', 'session') = 'persistent'
		  AND status IN ('creating', 'busy', 'stopping')
		) OR (
		  COALESCE(config->>'lifecycleMode', 'session') <> 'persistent'
		  AND status IN ('creating', 'ready', 'busy', 'stopping')
		)
	`).Scan(&sessionCount); err != nil {
		return err
	}
	if err := repository.pool.QueryRow(ctx, `
		SELECT count(*)
		FROM workflow_executions
		WHERE status IN ('pending', 'running', 'paused')
	`).Scan(&executionCount); err != nil {
		return err
	}
	if err := repository.pool.QueryRow(ctx, `
		SELECT count(*)
		FROM agent_conversations
		WHERE metadata->'execution'->>'runningState' = 'running'
	`).Scan(&promptCount); err != nil {
		return err
	}
	if sessionCount != 0 || executionCount != 0 || promptCount != 0 {
		return fmt.Errorf(
			"runtime is not drained: active_sandboxes=%d active_executions=%d active_prompts=%d",
			sessionCount,
			executionCount,
			promptCount,
		)
	}
	return nil
}

func (repository *PostgresRepository) ActivateCutover(ctx context.Context) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var unverified int64
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM sandbox_runtime_migrations WHERE status <> 'verified'
	`).Scan(&unverified); err != nil {
		return err
	}
	if unverified != 0 {
		return fmt.Errorf("cannot activate cutover: %d migrations are not verified", unverified)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE sandbox_sessions session
		SET runtime_handle = session.id::text,
		    status = 'stopped',
		    stopped_at = now(),
		    updated_at = now()
		FROM sandbox_runtime_migrations migration
		WHERE migration.sandbox_session_id = session.id
		  AND migration.status = 'verified'
	`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) MarkRolledBack(
	ctx context.Context,
	sessionID string,
	rolledBackAt time.Time,
) error {
	if !CanTransition(StatusVerified, StatusRolledBack) {
		return errors.New("invalid verified -> rolled_back migration transition")
	}
	command, err := repository.pool.Exec(ctx, `
		WITH migrated AS (
			UPDATE sandbox_runtime_migrations
			SET status = 'rolled_back',
			    rolled_back_at = $2,
			    error = NULL,
			    updated_at = now()
			WHERE sandbox_session_id = $1
			  AND status = 'verified'
			RETURNING sandbox_session_id
		)
		UPDATE sandbox_sessions session
		SET runtime_handle = NULL,
		    updated_at = now()
		FROM migrated
		WHERE session.id = migrated.sandbox_session_id
	`, sessionID, rolledBackAt)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return fmt.Errorf("migration row %s is not verified", sessionID)
	}
	return nil
}

func (repository *PostgresRepository) MarkFinalized(
	ctx context.Context,
	sessionID string,
	finalizedAt time.Time,
) error {
	return repository.transitionOne(ctx, sessionID, StatusVerified, StatusFinalized, "finalized_at", finalizedAt)
}

func (repository *PostgresRepository) FinalizeRuntimeHandleCutover(ctx context.Context) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var unfinished int64
	if err := tx.QueryRow(ctx, `
		SELECT count(*)
		FROM sandbox_runtime_migrations
		WHERE status <> 'finalized'
	`).Scan(&unfinished); err != nil {
		return err
	}
	if unfinished != 0 {
		return fmt.Errorf("cannot drop legacy container_id: %d migrations are not finalized", unfinished)
	}
	if _, err := tx.Exec(ctx, `ALTER TABLE sandbox_sessions DROP COLUMN IF EXISTS container_id`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repository *PostgresRepository) transitionOne(
	ctx context.Context,
	sessionID string,
	from MigrationStatus,
	to MigrationStatus,
	timestampColumn string,
	at time.Time,
) error {
	if !CanTransition(from, to) {
		return fmt.Errorf("invalid migration transition %s -> %s", from, to)
	}
	query := fmt.Sprintf(`
		UPDATE sandbox_runtime_migrations
		SET status = $2, %s = $3, error = NULL, updated_at = now()
		WHERE sandbox_session_id = $1 AND status = $4
	`, timestampColumn)
	command, err := repository.pool.Exec(ctx, query, sessionID, to, at, from)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return fmt.Errorf("migration row %s is not %s", sessionID, from)
	}
	return nil
}
