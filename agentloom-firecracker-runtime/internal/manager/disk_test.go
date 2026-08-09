package manager

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestExt4DiskCheckPreservesMissingFileIdentity(t *testing.T) {
	manager := NewExt4DiskManager(nil)
	missing := filepath.Join(t.TempDir(), "missing.ext4")
	if err := manager.Check(context.Background(), missing); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected os.ErrNotExist, got %v", err)
	}
}
