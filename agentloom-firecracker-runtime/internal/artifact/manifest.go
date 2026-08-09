package artifact

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type SourceLock struct {
	SchemaVersion   int    `json:"schemaVersion"`
	GuestAPIVersion string `json:"guestApiVersion"`
	Firecracker     struct {
		Version     string `json:"version"`
		Commit      string `json:"commit"`
		GoSDKCommit string `json:"goSdkCommit"`
	} `json:"firecracker"`
	Kernel struct {
		SourceTag    string `json:"sourceTag"`
		SourceCommit string `json:"sourceCommit"`
		ConfigCommit string `json:"configCommit"`
	} `json:"kernel"`
	RootFS struct {
		ArchOCIDigest string `json:"archOciDigest"`
		ArchSnapshot  string `json:"archSnapshot"`
	} `json:"rootfs"`
}

type File struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type Manifest struct {
	SchemaVersion   int       `json:"schemaVersion"`
	GuestAPIVersion string    `json:"guestApiVersion"`
	ArtifactDigest  string    `json:"artifactDigest"`
	BuiltAt         time.Time `json:"builtAt"`
	Firecracker     any       `json:"firecracker"`
	Kernel          any       `json:"kernel"`
	RootFS          any       `json:"rootfs"`
	GuestdVersion   string    `json:"guestdVersion"`
	Files           []File    `json:"files"`
}

var requiredArtifacts = []string{
	"firecracker",
	"jailer",
	"vmlinux",
	"initramfs.cpio.gz",
	"rootfs.ext4",
	"agentloom-guestd",
}

func Build(root, lockPath, guestdVersion string, builtAt time.Time) (Manifest, error) {
	lockContent, err := os.ReadFile(lockPath)
	if err != nil {
		return Manifest{}, fmt.Errorf("read artifact lock: %w", err)
	}
	var lock SourceLock
	if err := json.Unmarshal(lockContent, &lock); err != nil {
		return Manifest{}, fmt.Errorf("decode artifact lock: %w", err)
	}
	if lock.SchemaVersion != 1 || lock.GuestAPIVersion != "v1" {
		return Manifest{}, errors.New("unsupported artifact lock schema")
	}

	files := make([]File, 0, len(requiredArtifacts))
	for _, name := range requiredArtifacts {
		filePath := filepath.Join(root, name)
		file, err := os.Open(filePath)
		if err != nil {
			return Manifest{}, fmt.Errorf("open artifact %s: %w", name, err)
		}
		digest := sha256.New()
		size, copyErr := io.Copy(digest, file)
		closeErr := file.Close()
		if copyErr != nil || closeErr != nil {
			return Manifest{}, errors.Join(copyErr, closeErr)
		}
		files = append(files, File{
			Path:   name,
			SHA256: hex.EncodeToString(digest.Sum(nil)),
			Size:   size,
		})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	identity := sha256.New()
	for _, file := range files {
		_, _ = fmt.Fprintf(identity, "%s:%s:%d\n", file.Path, file.SHA256, file.Size)
	}

	return Manifest{
		SchemaVersion:   lock.SchemaVersion,
		GuestAPIVersion: lock.GuestAPIVersion,
		ArtifactDigest:  hex.EncodeToString(identity.Sum(nil)),
		BuiltAt:         builtAt.UTC(),
		Firecracker:     lock.Firecracker,
		Kernel:          lock.Kernel,
		RootFS:          lock.RootFS,
		GuestdVersion:   strings.TrimSpace(guestdVersion),
		Files:           files,
	}, nil
}

func WriteAtomic(path string, manifest Manifest) error {
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".manifest-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}
