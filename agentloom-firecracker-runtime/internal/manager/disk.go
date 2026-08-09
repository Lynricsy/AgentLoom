package manager

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

type Ext4DiskManager struct {
	store *MetadataStore
}

func NewExt4DiskManager(store *MetadataStore) *Ext4DiskManager {
	return &Ext4DiskManager{store: store}
}

func (manager *Ext4DiskManager) Ensure(ctx context.Context, id string, sizeGiB int64) (string, bool, error) {
	directory, err := manager.store.VMDir(id)
	if err != nil {
		return "", false, err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", false, err
	}
	path := filepath.Join(directory, "mutable.ext4")
	info, err := os.Stat(path)
	if err == nil {
		expected := sizeGiB * 1024 * 1024 * 1024
		if info.Size() != expected {
			return "", false, fmt.Errorf("%w: existing disk size differs", ErrConflict)
		}
		return path, false, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", false, err
	}

	temporary, err := os.CreateTemp(directory, ".mutable-*.ext4")
	if err != nil {
		return "", false, err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return "", false, err
	}
	if err := temporary.Truncate(sizeGiB * 1024 * 1024 * 1024); err != nil {
		temporary.Close()
		return "", false, err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return "", false, err
	}
	if err := temporary.Close(); err != nil {
		return "", false, err
	}
	command := exec.CommandContext(ctx, "mke2fs", "-q", "-t", "ext4", "-F", temporaryPath)
	if output, err := command.CombinedOutput(); err != nil {
		return "", false, fmt.Errorf("format %s GiB mutable disk: %w: %s", strconv.FormatInt(sizeGiB, 10), err, output)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return "", false, err
	}
	return path, true, nil
}

func (manager *Ext4DiskManager) Check(ctx context.Context, path string) error {
	if _, err := os.Stat(path); err != nil {
		return err
	}
	command := exec.CommandContext(ctx, "e2fsck", "-fn", path)
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("mutable ext4 check failed: %w: %s", err, output)
	}
	return nil
}

func (manager *Ext4DiskManager) Delete(_ context.Context, path string) error {
	return os.Remove(path)
}
