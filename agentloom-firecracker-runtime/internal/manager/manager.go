package manager

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	Store          *MetadataStore
	Capacity       *Capacity
	Disks          DiskManager
	Artifacts      ArtifactRegistry
	Network        NetworkProvisioner
	Launcher       Launcher
	GuestChecker   GuestChecker
	TokenRecoverer TokenRecoverer
	Logger         *slog.Logger
}

type liveVM struct {
	instance Instance
	token    string
}

type Manager struct {
	mutex          sync.Mutex
	store          *MetadataStore
	capacity       *Capacity
	disks          DiskManager
	artifacts      ArtifactRegistry
	network        NetworkProvisioner
	launcher       Launcher
	guestChecker   GuestChecker
	tokenRecoverer TokenRecoverer
	logger         *slog.Logger
	live           map[string]liveVM
	acceptCreates  bool
	now            func() time.Time
}

func New(config Config) (*Manager, error) {
	if config.Store == nil || config.Capacity == nil || config.Disks == nil || config.Artifacts == nil ||
		config.Network == nil || config.Launcher == nil || config.GuestChecker == nil || config.TokenRecoverer == nil {
		return nil, errors.New("all runtime manager dependencies are required")
	}
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	return &Manager{
		store: config.Store, capacity: config.Capacity, disks: config.Disks, artifacts: config.Artifacts,
		network: config.Network, launcher: config.Launcher, guestChecker: config.GuestChecker,
		tokenRecoverer: config.TokenRecoverer, logger: config.Logger, live: make(map[string]liveVM),
		acceptCreates: true, now: time.Now,
	}, nil
}

func resourcesFromRequest(request CreateRequest) (Resources, error) {
	if err := ValidateSessionID(request.ID); err != nil {
		return Resources{}, err
	}
	if request.CPU < 0.5 || request.CPU > 4 || request.MemoryMiB < 256 || request.MemoryMiB > 4096 ||
		request.DiskGiB < 1 || request.DiskGiB > 10 {
		return Resources{}, fmt.Errorf("%w: resources outside supported bounds", ErrInvalid)
	}
	if request.LifecycleMode != LifecycleSession && request.LifecycleMode != LifecyclePersistent {
		return Resources{}, fmt.Errorf("%w: invalid lifecycle mode", ErrInvalid)
	}
	return Resources{CPU: request.CPU, VCPUs: int64(math.Ceil(request.CPU)), MemoryMiB: request.MemoryMiB, DiskGiB: request.DiskGiB}, nil
}

func (manager *Manager) Create(ctx context.Context, request CreateRequest) (Metadata, error) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	if !manager.acceptCreates {
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "create", Err: errors.New("manager is draining")}
	}
	resources, err := resourcesFromRequest(request)
	if err != nil {
		return Metadata{}, err
	}
	if existing, readErr := manager.store.Read(request.ID); readErr == nil {
		if existing.Resources != resources || existing.LifecycleMode != request.LifecycleMode {
			return Metadata{}, &OperationError{Kind: ErrConflict, Op: "create", Err: errors.New("immutable resources differ")}
		}
		return existing, nil
	} else if !errors.Is(readErr, ErrNotFound) {
		return Metadata{}, readErr
	}

	artifacts := manager.artifacts.Current()
	if artifacts.GuestAPI != "v1" {
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "create", Err: errors.New("guest API version mismatch")}
	}
	if err := manager.capacity.Reserve(request.ID, resources, true); err != nil {
		return Metadata{}, &OperationError{Kind: err, Op: "reserve capacity", Err: err}
	}
	now := manager.now().UTC()
	metadata := Metadata{SchemaVersion: 1, SessionID: request.ID, ArtifactDigest: artifacts.Digest, Resources: resources,
		LifecycleMode: request.LifecycleMode, State: StateCreating, CreatedAt: now, UpdatedAt: now}
	if err := manager.store.Write(metadata); err != nil {
		manager.capacity.Delete(request.ID)
		return Metadata{}, err
	}

	diskCreated := false
	var allocation NetworkAllocation
	var instance Instance
	rollback := func(cause error) (Metadata, error) {
		var cleanupErrors []error
		if instance != nil {
			cleanupContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			cleanupErrors = append(cleanupErrors, instance.Kill(cleanupContext))
			cancel()
		}
		if allocation.TapName != "" {
			cleanupErrors = append(cleanupErrors, manager.network.Release(context.Background(), metadata))
		}
		if diskCreated {
			cleanupErrors = append(cleanupErrors, manager.disks.Delete(context.Background(), metadata.DiskPath))
		}
		manager.capacity.Delete(request.ID)
		metadata.State = StateFailed
		metadata.Failure = cause.Error()
		metadata.UpdatedAt = manager.now().UTC()
		cleanupErrors = append(cleanupErrors, manager.store.Write(metadata))
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "create", Err: errors.Join(append([]error{cause}, cleanupErrors...)...)}
	}

	metadata.DiskPath, diskCreated, err = manager.disks.Ensure(ctx, request.ID, resources.DiskGiB)
	if err != nil {
		return rollback(err)
	}
	allocation, err = manager.network.Provision(ctx, request.ID)
	if err != nil {
		return rollback(err)
	}
	metadata.GuestIP, metadata.GuestMAC = allocation.GuestIP, allocation.MAC
	metadata.TapName, metadata.NetNSPath = allocation.TapName, allocation.NetNSPath
	token, err := newGuestToken()
	if err != nil {
		return rollback(err)
	}
	instance, err = manager.launcher.Launch(ctx, LaunchSpec{Metadata: metadata, Artifacts: artifacts, Network: allocation, Token: token})
	if err != nil {
		return rollback(err)
	}
	metadata.PID, metadata.APISocketPath = instance.PID(), instance.APISocketPath()
	if err := manager.guestChecker.WaitReady(ctx, metadata, token); err != nil {
		return rollback(err)
	}
	metadata.State, metadata.UpdatedAt = StateRunning, manager.now().UTC()
	if err := manager.store.Write(metadata); err != nil {
		return rollback(err)
	}
	manager.live[request.ID] = liveVM{instance: instance, token: token}
	return metadata, nil
}

func newGuestToken() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func (manager *Manager) Inspect(id string) (Metadata, error) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	return manager.store.Read(id)
}

func (manager *Manager) Capacity() CapacitySnapshot {
	return manager.capacity.Snapshot()
}

func (manager *Manager) Start(ctx context.Context, id string) (Metadata, error) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	if !manager.acceptCreates {
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "start", Err: errors.New("manager is draining")}
	}
	metadata, err := manager.store.Read(id)
	if err != nil {
		return Metadata{}, err
	}
	if metadata.State == StateRunning {
		return metadata, nil
	}
	if metadata.State != StateStopped {
		return Metadata{}, &OperationError{Kind: ErrConflict, Op: "start", Err: fmt.Errorf("state is %s", metadata.State)}
	}
	if err := manager.capacity.Reserve(id, metadata.Resources, true); err != nil {
		return Metadata{}, &OperationError{Kind: err, Op: "reserve capacity", Err: err}
	}
	artifacts, err := manager.artifacts.Resolve(metadata.ArtifactDigest)
	if err != nil {
		manager.capacity.Deactivate(id)
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "resolve pinned artifacts", Err: err}
	}
	if err := manager.disks.Check(ctx, metadata.DiskPath); err != nil {
		manager.capacity.Deactivate(id)
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "check mutable disk", Err: err}
	}
	allocation, err := manager.network.Provision(ctx, id)
	if err != nil {
		manager.capacity.Deactivate(id)
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "provision network", Err: err}
	}
	metadata.State, metadata.Failure = StateCreating, ""
	metadata.GuestIP, metadata.GuestMAC = allocation.GuestIP, allocation.MAC
	metadata.TapName, metadata.NetNSPath = allocation.TapName, allocation.NetNSPath
	metadata.UpdatedAt = manager.now().UTC()
	if err := manager.store.Write(metadata); err != nil {
		manager.capacity.Deactivate(id)
		_ = manager.network.Release(context.Background(), metadata)
		return Metadata{}, err
	}
	token, err := newGuestToken()
	if err != nil {
		return manager.failStart(metadata, nil, err)
	}
	instance, err := manager.launcher.Launch(ctx, LaunchSpec{Metadata: metadata, Artifacts: artifacts, Network: allocation, Token: token})
	if err != nil {
		return manager.failStart(metadata, nil, err)
	}
	metadata.PID, metadata.APISocketPath = instance.PID(), instance.APISocketPath()
	if err := manager.guestChecker.WaitReady(ctx, metadata, token); err != nil {
		return manager.failStart(metadata, instance, err)
	}
	metadata.State, metadata.UpdatedAt = StateRunning, manager.now().UTC()
	if err := manager.store.Write(metadata); err != nil {
		return manager.failStart(metadata, instance, err)
	}
	manager.live[id] = liveVM{instance: instance, token: token}
	return metadata, nil
}

func (manager *Manager) failStart(metadata Metadata, instance Instance, cause error) (Metadata, error) {
	var cleanupErrors []error
	if instance != nil {
		cleanupContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		cleanupErrors = append(cleanupErrors, instance.Kill(cleanupContext))
		cancel()
	}
	cleanupErrors = append(cleanupErrors, manager.network.Release(context.Background(), metadata))
	manager.capacity.Deactivate(metadata.SessionID)
	metadata.State, metadata.Failure = StateFailed, cause.Error()
	metadata.UpdatedAt = manager.now().UTC()
	cleanupErrors = append(cleanupErrors, manager.store.Write(metadata))
	return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "start", Err: errors.Join(append([]error{cause}, cleanupErrors...)...)}
}

func (manager *Manager) Stop(ctx context.Context, id string) (Metadata, error) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	return manager.stopLocked(ctx, id)
}

func (manager *Manager) stopLocked(ctx context.Context, id string) (Metadata, error) {
	metadata, err := manager.store.Read(id)
	if err != nil {
		return Metadata{}, err
	}
	if metadata.State == StateStopped {
		return metadata, nil
	}
	if metadata.State != StateRunning {
		return Metadata{}, &OperationError{Kind: ErrConflict, Op: "stop", Err: fmt.Errorf("state is %s", metadata.State)}
	}
	live, ok := manager.live[id]
	if !ok {
		return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "stop", Err: errors.New("running instance is not attached")}
	}
	metadata.State, metadata.UpdatedAt = StateStopping, manager.now().UTC()
	if err := manager.store.Write(metadata); err != nil {
		return Metadata{}, err
	}

	gracefulContext, cancelGraceful := context.WithTimeout(ctx, 10*time.Second)
	shutdownErr := live.instance.Shutdown(gracefulContext)
	waitErr := live.instance.Wait(gracefulContext)
	cancelGraceful()
	forced := shutdownErr != nil || waitErr != nil
	if forced {
		killContext, cancelKill := context.WithTimeout(context.Background(), 5*time.Second)
		killErr := live.instance.Kill(killContext)
		waitKillErr := live.instance.Wait(killContext)
		cancelKill()
		if killErr != nil || waitKillErr != nil {
			return Metadata{}, &OperationError{Kind: ErrUnavailable, Op: "stop", Err: errors.Join(shutdownErr, waitErr, killErr, waitKillErr)}
		}
	}
	releaseErr := manager.network.Release(context.Background(), metadata)
	delete(manager.live, id)
	manager.capacity.Deactivate(id)
	metadata.State, metadata.PID, metadata.APISocketPath = StateStopped, 0, ""
	metadata.GuestIP, metadata.GuestMAC, metadata.TapName, metadata.NetNSPath = "", "", "", ""
	if forced {
		metadata.Failure = "graceful shutdown timed out; process was killed"
	} else {
		metadata.Failure = ""
	}
	metadata.UpdatedAt = manager.now().UTC()
	if writeErr := manager.store.Write(metadata); writeErr != nil {
		return Metadata{}, errors.Join(releaseErr, writeErr)
	}
	if releaseErr != nil {
		return metadata, &OperationError{Kind: ErrUnavailable, Op: "release network", Err: releaseErr}
	}
	return metadata, nil
}

func (manager *Manager) Delete(ctx context.Context, id string, deleteDisk bool) error {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	metadata, err := manager.store.Read(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil
		}
		return err
	}
	if metadata.State == StateRunning {
		metadata, err = manager.stopLocked(ctx, id)
		if err != nil {
			return err
		}
	}
	if metadata.State == StateCreating || metadata.State == StateStopping {
		return &OperationError{Kind: ErrConflict, Op: "delete", Err: fmt.Errorf("state is %s", metadata.State)}
	}
	if !deleteDisk {
		return nil
	}
	if metadata.DiskPath != "" {
		if err := manager.disks.Delete(ctx, metadata.DiskPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return &OperationError{Kind: ErrUnavailable, Op: "delete disk", Err: err}
		}
	}
	manager.capacity.Delete(id)
	return manager.store.Remove(id)
}

func (manager *Manager) Recover(ctx context.Context) error {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	all, err := manager.store.ReadAll()
	if err != nil {
		return err
	}
	for _, metadata := range all {
		if metadata.DiskPath != "" {
			if err := manager.capacity.Reserve(metadata.SessionID, metadata.Resources, false); err != nil {
				return fmt.Errorf("reserve recovered disk %s: %w", metadata.SessionID, err)
			}
		}
		switch metadata.State {
		case StateStopped, StateFailed:
		case StateCreating, StateStopping:
			manager.reconcileFailed(metadata, errors.New("manager interrupted a state transition"))
		case StateRunning:
			if err := manager.capacity.Reserve(metadata.SessionID, metadata.Resources, true); err != nil {
				manager.reconcileFailed(metadata, err)
				continue
			}
			if !isExpectedVMProcess(metadata.PID) {
				manager.reconcileFailed(metadata, errors.New("recorded Firecracker process is not alive"))
				continue
			}
			token, err := manager.tokenRecoverer.Recover(ctx, metadata)
			if err != nil {
				manager.reconcileFailed(metadata, fmt.Errorf("recover guest token: %w", err))
				continue
			}
			instance, err := manager.launcher.Reattach(ctx, metadata, token)
			if err != nil {
				manager.reconcileFailed(metadata, fmt.Errorf("reattach Firecracker process: %w", err))
				continue
			}
			manager.live[metadata.SessionID] = liveVM{instance: instance, token: token}
		default:
			return fmt.Errorf("unknown persisted state %q for %s", metadata.State, metadata.SessionID)
		}
	}
	return nil
}

func (manager *Manager) reconcileFailed(metadata Metadata, cause error) {
	if isExpectedVMProcess(metadata.PID) {
		process, err := os.FindProcess(metadata.PID)
		if err == nil {
			_ = process.Signal(syscall.SIGKILL)
		}
	}
	if err := manager.network.Release(context.Background(), metadata); err != nil {
		manager.logger.Error("failed to release network while reconciling", "sessionId", metadata.SessionID, "error", err)
	}
	manager.capacity.Deactivate(metadata.SessionID)
	metadata.State, metadata.Failure = StateFailed, cause.Error()
	metadata.PID, metadata.APISocketPath = 0, ""
	metadata.GuestIP, metadata.GuestMAC, metadata.TapName, metadata.NetNSPath = "", "", "", ""
	metadata.UpdatedAt = manager.now().UTC()
	if err := manager.store.Write(metadata); err != nil {
		manager.logger.Error("failed to persist reconciliation", "sessionId", metadata.SessionID, "error", err)
	}
}

func isExpectedVMProcess(pid int) bool {
	if pid < 2 {
		return false
	}
	target, err := os.Readlink(filepath.Join("/proc", fmt.Sprintf("%d", pid), "exe"))
	if err != nil || !strings.Contains(filepath.Base(target), "firecracker") {
		return false
	}
	process, err := os.FindProcess(pid)
	return err == nil && process.Signal(syscall.Signal(0)) == nil
}

func (manager *Manager) GuestAccess(id string) (Metadata, string, error) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	metadata, err := manager.store.Read(id)
	if err != nil {
		return Metadata{}, "", err
	}
	live, ok := manager.live[id]
	if metadata.State != StateRunning || !ok {
		return Metadata{}, "", &OperationError{Kind: ErrConflict, Op: "guest access", Err: fmt.Errorf("state is %s", metadata.State)}
	}
	return metadata, live.token, nil
}

func (manager *Manager) Shutdown(ctx context.Context) error {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	manager.acceptCreates = false
	var result error
	ids := make([]string, 0, len(manager.live))
	for id := range manager.live {
		ids = append(ids, id)
	}
	for _, id := range ids {
		if _, err := manager.stopLocked(ctx, id); err != nil {
			result = errors.Join(result, err)
		}
	}
	return result
}
