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

type MigrationRecord struct {
	SessionID               string
	TenantID                string
	LegacyContainerID       string
	WorkspaceIdentity       string
	WorkspaceID             string
	ArchiveObjectKey        string
	ManifestObjectKey       string
	ArchiveSHA256           string
	ManifestSHA256          string
	FileCount               int64
	TotalBytes              int64
	CPU                     float64
	MemoryMiB               int64
	DiskGiB                 int64
	Status                  MigrationStatus
	VerifiedAt              *time.Time
	RollbackSourceSessionID string
	SnapshotObjectKey       string
	SnapshotSHA256          string
}

type LegacyRuntime interface {
	Stop(context.Context, string, time.Duration) error
	WorkspaceArchive(context.Context, string) (io.ReadCloser, error)
}

type CutoverRuntime interface {
	Create(context.Context, MigrationRecord) error
	Start(context.Context, string) error
	Stop(context.Context, string) error
	Delete(context.Context, string, bool) error
	Restore(context.Context, string, io.Reader) error
	WorkspaceArchive(context.Context, string) (io.ReadCloser, error)
	Verify(context.Context, MigrationRecord) error
}

type RollbackLegacyRuntime interface {
	Start(context.Context, string) error
	ClearWorkspace(context.Context, string) error
	PutWorkspaceArchive(context.Context, string, io.Reader) error
	WorkspaceArchive(context.Context, string) (io.ReadCloser, error)
	DeleteContainer(context.Context, string) error
	DeleteVolume(context.Context, string) error
}

type ObjectStore interface {
	Put(context.Context, string, io.Reader, int64, string) (int64, error)
	Remove(context.Context, string) error
}

type MigrationObjectStore interface {
	ObjectStore
	Get(context.Context, string) (io.ReadCloser, error)
}

type MigrationRepository interface {
	ListPersistentSandboxes(context.Context) ([]LegacySandbox, error)
	EnsurePending(context.Context, LegacySandbox) error
	SetStatus(context.Context, []string, MigrationStatus, string) error
	MarkArchived(context.Context, []string, ArchivedMigration) error
}

type CutoverRepository interface {
	MigrationRepository
	ListMigrations(context.Context, ...MigrationStatus) ([]MigrationRecord, error)
	MarkRestoring(context.Context, []string) error
	MarkVerified(context.Context, []string, time.Time) error
	AssertDrained(context.Context) error
	ActivateCutover(context.Context) error
	MarkRolledBack(context.Context, string, time.Time) error
	MarkFinalized(context.Context, string, time.Time) error
}
