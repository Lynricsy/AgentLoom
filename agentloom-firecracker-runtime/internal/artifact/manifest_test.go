package artifact

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildManifestIsDeterministic(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, name := range requiredArtifacts {
		if err := os.WriteFile(filepath.Join(root, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	lock := SourceLock{SchemaVersion: 1, GuestAPIVersion: "v1"}
	lockContent, err := json.Marshal(lock)
	if err != nil {
		t.Fatal(err)
	}
	lockPath := filepath.Join(root, "lock.json")
	if err := os.WriteFile(lockPath, lockContent, 0o600); err != nil {
		t.Fatal(err)
	}
	builtAt := time.Unix(1, 0)
	first, err := Build(root, lockPath, "test", builtAt)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Build(root, lockPath, "test", builtAt)
	if err != nil {
		t.Fatal(err)
	}
	if first.ArtifactDigest != second.ArtifactDigest {
		t.Fatalf("artifact digest changed: %s != %s", first.ArtifactDigest, second.ArtifactDigest)
	}
	if len(first.Files) != len(requiredArtifacts) {
		t.Fatalf("unexpected files: %+v", first.Files)
	}
}
