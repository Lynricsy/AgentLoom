package preflight

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVerifyArtifacts(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	content := []byte("artifact")
	if err := os.WriteFile(filepath.Join(root, "kernel"), content, 0o600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(content)
	manifest := ArtifactManifest{
		SchemaVersion:   1,
		GuestAPIVersion: "v1",
		ArtifactDigest:  "digest",
		Files:           []ArtifactFile{{Path: "kernel", SHA256: hex.EncodeToString(digest[:])}},
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	if err := os.WriteFile(manifestPath, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	verified, err := verifyArtifacts(root, manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if verified.ArtifactDigest != "digest" {
		t.Fatalf("unexpected manifest: %+v", verified)
	}
}

func TestVerifyArtifactsRejectsChecksumMismatch(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "kernel"), []byte("artifact"), 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := ArtifactManifest{
		SchemaVersion:   1,
		GuestAPIVersion: "v1",
		ArtifactDigest:  "digest",
		Files:           []ArtifactFile{{Path: "kernel", SHA256: string(make([]byte, 64))}},
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	if err := os.WriteFile(manifestPath, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyArtifacts(root, manifestPath); err == nil {
		t.Fatal("expected checksum mismatch")
	}
}

func TestVerifyArtifactsRejectsNonELFVmlinuxWithValidChecksum(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	content := []byte("valid-checksum-but-not-an-elf-kernel")
	if err := os.WriteFile(filepath.Join(root, "vmlinux"), content, 0o600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(content)
	manifest := ArtifactManifest{
		SchemaVersion:   1,
		GuestAPIVersion: "v1",
		ArtifactDigest:  "digest",
		Files: []ArtifactFile{{
			Path:   "vmlinux",
			SHA256: hex.EncodeToString(digest[:]),
		}},
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	if err := os.WriteFile(manifestPath, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyArtifacts(root, manifestPath); err == nil ||
		!strings.Contains(err.Error(), "not an ELF") {
		t.Fatalf("expected ELF validation failure, got %v", err)
	}
}

func TestVerifyArtifactsRejectsTraversalSymlinkAndNonRegularFiles(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		setUp func(*testing.T, string)
	}{
		{name: "traversal", path: "../outside", setUp: func(t *testing.T, root string) {
			if err := os.WriteFile(filepath.Join(filepath.Dir(root), "outside"), []byte("artifact"), 0o600); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "symlink", path: "link", setUp: func(t *testing.T, root string) {
			target := filepath.Join(t.TempDir(), "target")
			if err := os.WriteFile(target, []byte("artifact"), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, filepath.Join(root, "link")); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "directory", path: "directory", setUp: func(t *testing.T, root string) {
			if err := os.Mkdir(filepath.Join(root, "directory"), 0o700); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			test.setUp(t, root)
			manifest := ArtifactManifest{
				SchemaVersion: 1, GuestAPIVersion: "v1", ArtifactDigest: "digest",
				Files: []ArtifactFile{{Path: test.path, SHA256: strings.Repeat("0", 64)}},
			}
			encoded, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			manifestPath := filepath.Join(root, "manifest.json")
			if err := os.WriteFile(manifestPath, encoded, 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := verifyArtifacts(root, manifestPath); err == nil {
				t.Fatalf("expected %s rejection", test.name)
			}
		})
	}
}

func TestCIDRCollisionValidation(t *testing.T) {
	t.Parallel()
	if err := checkCIDRCollision("not-a-cidr"); err == nil {
		t.Fatal("expected invalid CIDR to fail")
	}
}
