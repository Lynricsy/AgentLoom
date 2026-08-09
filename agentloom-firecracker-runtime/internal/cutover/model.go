package cutover

import (
	"context"
	"io"
	"time"
)

type MigrationStatus string

const (
	StatusPending    MigrationStatus = "pending"
	StatusArchiving  MigrationStatus = "archiving"
	StatusArchived   MigrationStatus = "archived"
	StatusRestoring  MigrationStatus = "restoring"
	StatusVerified   MigrationStatus = "verified"
	StatusFinalized  MigrationStatus = "finalized"
	StatusFailed     MigrationStatus = "failed"
	StatusRolledBack MigrationStatus = "rolled_back"
)

var allowedTransitions = map[MigrationStatus]map[MigrationStatus]struct{}{
	StatusPending:    {StatusArchiving: {}, StatusFailed: {}},
	StatusArchiving:  {StatusArchived: {}, StatusFailed: {}},
	StatusArchived:   {StatusRestoring: {}, StatusFailed: {}},
	StatusRestoring:  {StatusVerified: {}, StatusFailed: {}},
	StatusVerified:   {StatusFinalized: {}, StatusRolledBack: {}, StatusFailed: {}},
	StatusFailed:     {StatusPending: {}, StatusArchiving: {}, StatusRestoring: {}},
	StatusRolledBack: {StatusArchiving: {}},
	StatusFinalized:  {},
}

func CanTransition(from, to MigrationStatus) bool {
	_, ok := allowedTransitions[from][to]
	return ok
}

type LegacySandbox struct {
	SessionID          string
	TenantID           string
	ContainerID        string
	WorkspaceIdentity  string
	RestoreWorkspaceID string
}

type ManifestEntry struct {
	Path   string `json:"path"`
	Type   string `json:"type"`
	Mode   int64  `json:"mode"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256,omitempty"`
	Target string `json:"target,omitempty"`
}

type ArchiveResult struct {
	ArchiveSHA256  string
	ManifestSHA256 string
	FileCount      int64
	TotalBytes     int64
	ArchiveBytes   int64
	ManifestBytes  int64
}

type ArchivedMigration struct {
	ArchiveObjectKey  string
	ManifestObjectKey string
	ArchiveSHA256     string
	ManifestSHA256    string
	FileCount         int64
	TotalBytes        int64
	ArchivedAt        time.Time
}

type LegacyRuntime interface {
	Stop(context.Context, string, time.Duration) error
	WorkspaceArchive(context.Context, string) (io.ReadCloser, error)
}

type ObjectStore interface {
	Put(context.Context, string, io.Reader, int64, string) (int64, error)
	Remove(context.Context, string) error
}

type MigrationRepository interface {
	ListPersistentSandboxes(context.Context) ([]LegacySandbox, error)
	EnsurePending(context.Context, LegacySandbox) error
	SetStatus(context.Context, []string, MigrationStatus, string) error
	MarkArchived(context.Context, []string, ArchivedMigration) error
}
