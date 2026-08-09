package manager

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type artifactManifest struct {
	SchemaVersion   int    `json:"schemaVersion"`
	GuestAPIVersion string `json:"guestApiVersion"`
	ArtifactDigest  string `json:"artifactDigest"`
	GuestdVersion   string `json:"guestdVersion"`
	Files           []struct {
		Path   string `json:"path"`
		SHA256 string `json:"sha256"`
		Size   int64  `json:"size"`
	} `json:"files"`
}

type FilesystemArtifactRegistry struct {
	mutex     sync.Mutex
	stateRoot string
	current   ArtifactSet
	verified  map[string]bool
}

func MaterializeArtifacts(bundleRoot, stateRoot string) (*FilesystemArtifactRegistry, error) {
	manifest, err := readArtifactManifest(filepath.Join(bundleRoot, "manifest.json"))
	if err != nil {
		return nil, err
	}
	artifactBase := filepath.Join(stateRoot, "artifacts")
	if err := os.MkdirAll(artifactBase, 0o700); err != nil {
		return nil, err
	}
	target := filepath.Join(artifactBase, manifest.ArtifactDigest)
	if _, err := os.Stat(target); errors.Is(err, os.ErrNotExist) {
		temporary, err := os.MkdirTemp(artifactBase, ".artifact-*.tmp")
		if err != nil {
			return nil, err
		}
		defer os.RemoveAll(temporary)
		for _, artifact := range manifest.Files {
			if err := copyVerifiedArtifact(
				filepath.Join(bundleRoot, artifact.Path),
				filepath.Join(temporary, artifact.Path),
				artifact.SHA256,
				artifact.Size,
			); err != nil {
				return nil, err
			}
		}
		manifestContent, err := os.ReadFile(filepath.Join(bundleRoot, "manifest.json"))
		if err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(temporary, "manifest.json"), manifestContent, 0o600); err != nil {
			return nil, err
		}
		if err := os.Rename(temporary, target); err != nil {
			if _, statErr := os.Stat(target); statErr != nil {
				return nil, err
			}
		}
	} else if err != nil {
		return nil, err
	}
	registry := &FilesystemArtifactRegistry{stateRoot: artifactBase, verified: make(map[string]bool)}
	current, err := registry.Resolve(manifest.ArtifactDigest)
	if err != nil {
		return nil, err
	}
	registry.current = current
	return registry, nil
}

func (registry *FilesystemArtifactRegistry) Current() ArtifactSet {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	return registry.current
}

func (registry *FilesystemArtifactRegistry) Resolve(digest string) (ArtifactSet, error) {
	if len(digest) != 64 || strings.ContainsAny(digest, `/\\`) {
		return ArtifactSet{}, fmt.Errorf("invalid artifact digest")
	}
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	root := filepath.Join(registry.stateRoot, digest)
	manifest, err := readArtifactManifest(filepath.Join(root, "manifest.json"))
	if err != nil {
		return ArtifactSet{}, err
	}
	if manifest.ArtifactDigest != digest {
		return ArtifactSet{}, fmt.Errorf("artifact digest directory mismatch")
	}
	if !registry.verified[digest] {
		for _, artifact := range manifest.Files {
			if filepath.Base(artifact.Path) != artifact.Path {
				return ArtifactSet{}, fmt.Errorf("artifact manifest path is unsafe")
			}
			if err := verifyArtifact(filepath.Join(root, artifact.Path), artifact.SHA256, artifact.Size); err != nil {
				return ArtifactSet{}, err
			}
		}
		registry.verified[digest] = true
	}
	set := ArtifactSet{
		Digest:        digest,
		Firecracker:   filepath.Join(root, "firecracker"),
		Jailer:        filepath.Join(root, "jailer"),
		Kernel:        filepath.Join(root, "vmlinux"),
		Initramfs:     filepath.Join(root, "initramfs.cpio.gz"),
		RootFS:        filepath.Join(root, "rootfs.ext4"),
		GuestdVersion: manifest.GuestdVersion,
		GuestAPI:      manifest.GuestAPIVersion,
	}
	for _, path := range []string{set.Firecracker, set.Jailer, set.Kernel, set.Initramfs, set.RootFS} {
		if _, err := os.Stat(path); err != nil {
			return ArtifactSet{}, err
		}
	}
	return set, nil
}

func readArtifactManifest(path string) (artifactManifest, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return artifactManifest{}, err
	}
	var manifest artifactManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return artifactManifest{}, err
	}
	if manifest.SchemaVersion != 1 || manifest.GuestAPIVersion != "v1" || len(manifest.ArtifactDigest) != 64 {
		return artifactManifest{}, fmt.Errorf("invalid artifact manifest")
	}
	return manifest, nil
}

func copyVerifiedArtifact(source, target, expectedDigest string, expectedSize int64) error {
	sourceFile, err := os.Open(source)
	if err != nil {
		return err
	}
	defer sourceFile.Close()
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return err
	}
	targetFile, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	digest := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(targetFile, digest), sourceFile)
	syncErr := targetFile.Sync()
	closeErr := targetFile.Close()
	if copyErr != nil || syncErr != nil || closeErr != nil {
		return errors.Join(copyErr, syncErr, closeErr)
	}
	if size != expectedSize || hex.EncodeToString(digest.Sum(nil)) != expectedDigest {
		return fmt.Errorf("artifact checksum mismatch: %s", filepath.Base(source))
	}
	if filepath.Base(source) == "firecracker" || filepath.Base(source) == "jailer" {
		return os.Chmod(target, 0o755)
	}
	return os.Chmod(target, 0o644)
}

func verifyArtifact(path, expectedDigest string, expectedSize int64) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	digest := sha256.New()
	size, err := io.Copy(digest, file)
	if err != nil {
		return err
	}
	if size != expectedSize || hex.EncodeToString(digest.Sum(nil)) != expectedDigest {
		return fmt.Errorf("materialized artifact checksum mismatch: %s", filepath.Base(path))
	}
	return nil
}
