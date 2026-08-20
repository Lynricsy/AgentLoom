package artifactpath

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Validate 验证清单路径严格指向根目录内现存的普通文件，且路径链不包含符号链接。
func Validate(root, manifestPath string) (string, error) {
	if manifestPath == "" || filepath.IsAbs(manifestPath) {
		return "", errors.New("artifact path must be relative")
	}
	clean := filepath.Clean(manifestPath)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return "", errors.New("artifact path escapes root")
	}
	root = filepath.Clean(root)
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	if resolvedRoot != root {
		return "", errors.New("artifact root must not contain symlinks")
	}
	path := filepath.Join(root, clean)
	current := root
	for _, component := range strings.Split(clean, string(os.PathSeparator)) {
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if err != nil {
			return "", err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("artifact path contains symlink: %s", manifestPath)
		}
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("artifact path is not a regular file: %s", manifestPath)
	}
	return path, nil
}
