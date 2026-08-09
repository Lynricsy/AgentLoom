package manager

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type State string

const (
	StateCreating State = "creating"
	StateRunning  State = "running"
	StateStopping State = "stopping"
	StateStopped  State = "stopped"
	StateFailed   State = "failed"
)

type LifecycleMode string

const (
	LifecycleSession    LifecycleMode = "session"
	LifecyclePersistent LifecycleMode = "persistent"
)

type Resources struct {
	CPU       float64 `json:"cpu"`
	VCPUs     int64   `json:"vcpus"`
	MemoryMiB int64   `json:"memoryMiB"`
	DiskGiB   int64   `json:"diskGiB"`
}

type CreateRequest struct {
	ID            string        `json:"id"`
	CPU           float64       `json:"cpu"`
	MemoryMiB     int64         `json:"memoryMiB"`
	DiskGiB       int64         `json:"diskGiB"`
	LifecycleMode LifecycleMode `json:"lifecycleMode"`
	WorkspaceID   string        `json:"workspaceId,omitempty"`
}

type Metadata struct {
	SchemaVersion  int           `json:"schemaVersion"`
	SessionID      string        `json:"sessionId"`
	ArtifactDigest string        `json:"artifactDigest"`
	Resources      Resources     `json:"resources"`
	GuestIP        string        `json:"guestIp,omitempty"`
	GuestMAC       string        `json:"guestMac,omitempty"`
	TapName        string        `json:"tapName,omitempty"`
	NetNSPath      string        `json:"netnsPath,omitempty"`
	LifecycleMode  LifecycleMode `json:"lifecycleMode"`
	WorkspaceID    string        `json:"workspaceId"`
	DiskPath       string        `json:"diskPath"`
	APISocketPath  string        `json:"apiSocketPath,omitempty"`
	PID            int           `json:"pid,omitempty"`
	State          State         `json:"state"`
	Failure        string        `json:"failure,omitempty"`
	CreatedAt      time.Time     `json:"createdAt"`
	UpdatedAt      time.Time     `json:"updatedAt"`
}

type ArtifactSet struct {
	Digest        string
	Firecracker   string
	Jailer        string
	Kernel        string
	Initramfs     string
	RootFS        string
	GuestdVersion string
	GuestAPI      string
}

type NetworkAllocation struct {
	GuestIP     string
	Gateway     string
	Netmask     string
	Nameservers []string
	MAC         string
	TapName     string
	NetNSPath   string
}

type LaunchSpec struct {
	Metadata  Metadata
	Artifacts ArtifactSet
	Network   NetworkAllocation
	Token     string
}

type Instance interface {
	PID() int
	APISocketPath() string
	Shutdown(context.Context) error
	Kill(context.Context) error
	Wait(context.Context) error
}

type Launcher interface {
	Launch(context.Context, LaunchSpec) (Instance, error)
	Reattach(context.Context, Metadata, string) (Instance, error)
	Cleanup(context.Context, Metadata) error
}

type NetworkProvisioner interface {
	Provision(context.Context, string) (NetworkAllocation, error)
	Release(context.Context, Metadata) error
}

type DiskManager interface {
	Ensure(context.Context, string, int64) (path string, created bool, err error)
	Check(context.Context, string) error
	Delete(context.Context, string) error
}

type ArtifactRegistry interface {
	Current() ArtifactSet
	Resolve(string) (ArtifactSet, error)
}

type GuestChecker interface {
	WaitReady(context.Context, Metadata, string) error
}

type TokenRecoverer interface {
	Recover(context.Context, Metadata) (string, error)
}

var (
	ErrNotFound       = errors.New("microVM not found")
	ErrConflict       = errors.New("microVM configuration or state conflict")
	ErrCapacity       = errors.New("runtime capacity exhausted")
	ErrInvalid        = errors.New("invalid microVM request")
	ErrUnavailable    = errors.New("runtime unavailable")
	ErrInsufficientFS = errors.New("runtime state volume has insufficient space")
)

type OperationError struct {
	Kind error
	Op   string
	Err  error
}

func (errorValue *OperationError) Error() string {
	return fmt.Sprintf("%s: %v", errorValue.Op, errorValue.Err)
}

func (errorValue *OperationError) Unwrap() error {
	return errors.Join(errorValue.Kind, errorValue.Err)
}
