package manager

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var sessionIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type MetadataStore struct {
	root string
}

func NewMetadataStore(root string) (*MetadataStore, error) {
	clean := filepath.Clean(root)
	if !filepath.IsAbs(clean) {
		return nil, errors.New("metadata state root must be absolute")
	}
	if err := os.MkdirAll(filepath.Join(clean, "vms"), 0o700); err != nil {
		return nil, err
	}
	resolved, err := filepath.EvalSymlinks(clean)
	if err != nil {
		return nil, err
	}
	if resolved != clean {
		return nil, errors.New("metadata state root must not contain symlinks")
	}
	return &MetadataStore{root: clean}, nil
}

func ValidateSessionID(id string) error {
	if !sessionIDPattern.MatchString(strings.ToLower(id)) || id != strings.ToLower(id) {
		return fmt.Errorf("%w: session id must be a lowercase UUID", ErrInvalid)
	}
	return nil
}

func (store *MetadataStore) VMDir(id string) (string, error) {
	if err := ValidateSessionID(id); err != nil {
		return "", err
	}
	path := filepath.Join(store.root, "vms", id)
	if !strings.HasPrefix(path, filepath.Join(store.root, "vms")+string(os.PathSeparator)) {
		return "", ErrInvalid
	}
	return path, nil
}

func (store *MetadataStore) Write(metadata Metadata) error {
	directory, err := store.VMDir(metadata.SessionID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	content, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	temporary, err := os.CreateTemp(directory, ".metadata-*.tmp")
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
	if err := os.Rename(temporaryPath, filepath.Join(directory, "metadata.json")); err != nil {
		return err
	}
	directoryHandle, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer directoryHandle.Close()
	return directoryHandle.Sync()
}

func (store *MetadataStore) Read(id string) (Metadata, error) {
	directory, err := store.VMDir(id)
	if err != nil {
		return Metadata{}, err
	}
	content, err := os.ReadFile(filepath.Join(directory, "metadata.json"))
	if errors.Is(err, fs.ErrNotExist) {
		return Metadata{}, ErrNotFound
	}
	if err != nil {
		return Metadata{}, err
	}
	var metadata Metadata
	if err := json.Unmarshal(content, &metadata); err != nil {
		return Metadata{}, err
	}
	if metadata.SchemaVersion != 1 || metadata.SessionID != id {
		return Metadata{}, fmt.Errorf("metadata identity mismatch for %s", id)
	}
	if metadata.WorkspaceID == "" {
		metadata.WorkspaceID = metadata.SessionID
	}
	return metadata, nil
}

func (store *MetadataStore) ReadAll() ([]Metadata, error) {
	entries, err := os.ReadDir(filepath.Join(store.root, "vms"))
	if err != nil {
		return nil, err
	}
	result := make([]Metadata, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || ValidateSessionID(entry.Name()) != nil {
			continue
		}
		metadata, err := store.Read(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read metadata %s: %w", entry.Name(), err)
		}
		result = append(result, metadata)
	}
	return result, nil
}

func (store *MetadataStore) Remove(id string) error {
	directory, err := store.VMDir(id)
	if err != nil {
		return err
	}
	return os.RemoveAll(directory)
}
