package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareChrootBaseResolvesDanglingVolumeSymlink(t *testing.T) {
	root := t.TempDir()
	stateRoot := filepath.Join(root, "empty-state-volume")
	chrootTarget := filepath.Join(stateRoot, "jailer")
	chrootBase := filepath.Join(root, "fc")
	if err := os.Symlink(chrootTarget, chrootBase); err != nil {
		t.Fatal(err)
	}
	if err := prepareChrootBase(chrootBase); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(chrootBase)
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() {
		t.Fatal("prepared chroot symlink must resolve to a directory")
	}
	if info.Mode().Perm() != 0o711 {
		t.Fatalf("unexpected chroot mode: %o", info.Mode().Perm())
	}
}

func TestSplitNonEmptyCSVTrimsAndDropsEmptyValues(t *testing.T) {
	t.Parallel()
	values := splitNonEmptyCSV(" 10.42.0.0/16, ,192.168.50.0/24 ")
	if len(values) != 2 || values[0] != "10.42.0.0/16" || values[1] != "192.168.50.0/24" {
		t.Fatalf("unexpected CSV values: %v", values)
	}
}
