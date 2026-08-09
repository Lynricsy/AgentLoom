package cutover

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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
