package manager

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func writeArtifactManifestForTest(t *testing.T, root, artifactPath string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(root, artifactPath))
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(content)
	manifest := artifactManifest{
		SchemaVersion: 1, GuestAPIVersion: "v1",
		ArtifactDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	manifest.Files = append(manifest.Files, struct {
		Path   string `json:"path"`
		SHA256 string `json:"sha256"`
		Size   int64  `json:"size"`
	}{Path: artifactPath, SHA256: hex.EncodeToString(digest[:]), Size: int64(len(content))})
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "manifest.json"), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestMaterializeArtifactsRejectsTraversalBeforeCreatingState(t *testing.T) {
	parent := t.TempDir()
	bundle := filepath.Join(parent, "bundle")
	if err := os.Mkdir(bundle, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(parent, "outside"), []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	writeArtifactManifestForTest(t, bundle, "../outside")
	state := filepath.Join(parent, "state")
	if _, err := MaterializeArtifacts(bundle, state); err == nil {
		t.Fatal("expected traversal rejection")
	}
	if _, err := os.Stat(filepath.Join(state, "artifacts")); !os.IsNotExist(err) {
		t.Fatalf("state was mutated before path validation: %v", err)
	}
}

func TestMaterializeArtifactsRejectsSymlink(t *testing.T) {
	bundle := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(bundle, "firecracker")); err != nil {
		t.Fatal(err)
	}
	writeArtifactManifestForTest(t, bundle, "firecracker")
	if _, err := MaterializeArtifacts(bundle, t.TempDir()); err == nil {
		t.Fatal("expected symlink rejection")
	}
}
