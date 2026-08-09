package cutover

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"path"
	"strings"

	"github.com/klauspost/compress/zstd"
)

const workspaceArchiveRoot = "workspace"

type countingWriter struct {
	writer io.Writer
	count  int64
}

func (w *countingWriter) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	w.count += int64(n)
	return n, err
}

type hashCountingWriter struct {
	writer io.Writer
	hash   hash.Hash
	count  int64
}

func (w *hashCountingWriter) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	if n > 0 {
		_, _ = w.hash.Write(p[:n])
		w.count += int64(n)
	}
	return n, err
}

func NormalizeWorkspacePath(name string) (string, error) {
	name = strings.ReplaceAll(name, "\\", "/")
	if strings.HasPrefix(name, "/") {
		return "", errors.New("absolute archive path is forbidden")
	}

	clean := path.Clean(name)
	if clean == "." || clean == workspaceArchiveRoot {
		return "", nil
	}
	if clean == ".." || strings.HasPrefix(clean, "../") {
		return "", errors.New("archive path escapes workspace")
	}
	if strings.HasPrefix(clean, workspaceArchiveRoot+"/") {
		clean = strings.TrimPrefix(clean, workspaceArchiveRoot+"/")
	}
	if clean == ".." || strings.HasPrefix(clean, "../") || path.IsAbs(clean) {
		return "", errors.New("archive path escapes workspace")
	}
	return clean, nil
}

func normalizeLinkTarget(entryPath, target string) (string, error) {
	if target == "" {
		return "", errors.New("empty link target")
	}
	if path.IsAbs(target) {
		return "", errors.New("absolute link target is forbidden")
	}
	resolved := path.Clean(path.Join(path.Dir(entryPath), target))
	if resolved == ".." || strings.HasPrefix(resolved, "../") {
		return "", errors.New("link target escapes workspace")
	}
	return target, nil
}

func BuildWorkspaceArchive(source io.Reader, archive io.Writer, manifest io.Writer) (ArchiveResult, error) {
	archiveHash := sha256.New()
	archiveOutput := &hashCountingWriter{
		writer: archive,
		hash:   archiveHash,
	}
	manifestHash := sha256.New()
	manifestOutput := &hashCountingWriter{
		writer: io.MultiWriter(manifest, manifestHash),
		hash:   sha256.New(),
	}

	compressor, err := zstd.NewWriter(archiveOutput, zstd.WithEncoderLevel(zstd.SpeedDefault))
	if err != nil {
		return ArchiveResult{}, fmt.Errorf("create zstd encoder: %w", err)
	}
	tarWriter := tar.NewWriter(compressor)
	tarReader := tar.NewReader(source)
	encoder := json.NewEncoder(manifestOutput)

	var result ArchiveResult
	for {
		header, nextErr := tarReader.Next()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			_ = tarWriter.Close()
			_ = compressor.Close()
			return ArchiveResult{}, fmt.Errorf("read legacy tar: %w", nextErr)
		}

		relativePath, pathErr := NormalizeWorkspacePath(header.Name)
		if pathErr != nil {
			_ = tarWriter.Close()
			_ = compressor.Close()
			return ArchiveResult{}, fmt.Errorf("invalid archive entry %q: %w", header.Name, pathErr)
		}
		if relativePath == "" {
			continue
		}

		entry := ManifestEntry{
			Path: relativePath,
			Mode: header.Mode,
			Size: header.Size,
		}
		cleanHeader := *header
		cleanHeader.Name = relativePath
		cleanHeader.Uid = 0
		cleanHeader.Gid = 0
		cleanHeader.Uname = ""
		cleanHeader.Gname = ""

		switch header.Typeflag {
		case tar.TypeDir:
			entry.Type = "directory"
			cleanHeader.Size = 0
		case tar.TypeReg, tar.TypeRegA:
			entry.Type = "file"
		case tar.TypeSymlink:
			entry.Type = "symlink"
			target, linkErr := normalizeLinkTarget(relativePath, header.Linkname)
			if linkErr != nil {
				_ = tarWriter.Close()
				_ = compressor.Close()
				return ArchiveResult{}, fmt.Errorf("invalid symlink %q: %w", header.Name, linkErr)
			}
			entry.Target = target
			cleanHeader.Linkname = target
			cleanHeader.Size = 0
		case tar.TypeLink:
			entry.Type = "hardlink"
			target, linkErr := NormalizeWorkspacePath(header.Linkname)
			if linkErr != nil || target == "" {
				_ = tarWriter.Close()
				_ = compressor.Close()
				return ArchiveResult{}, fmt.Errorf("invalid hardlink %q", header.Name)
			}
			entry.Target = target
			cleanHeader.Linkname = target
			cleanHeader.Size = 0
		default:
			_ = tarWriter.Close()
			_ = compressor.Close()
			return ArchiveResult{}, fmt.Errorf("unsupported archive entry type %d for %q", header.Typeflag, header.Name)
		}

		if err := tarWriter.WriteHeader(&cleanHeader); err != nil {
			_ = compressor.Close()
			return ArchiveResult{}, fmt.Errorf("write archive header: %w", err)
		}

		if entry.Type == "file" {
			fileHash := sha256.New()
			written, copyErr := io.CopyN(io.MultiWriter(tarWriter, fileHash), tarReader, header.Size)
			if copyErr != nil {
				_ = tarWriter.Close()
				_ = compressor.Close()
				return ArchiveResult{}, fmt.Errorf("copy archive file %q: %w", header.Name, copyErr)
			}
			if written != header.Size {
				_ = tarWriter.Close()
				_ = compressor.Close()
				return ArchiveResult{}, fmt.Errorf("archive file %q size mismatch", header.Name)
			}
			entry.SHA256 = hex.EncodeToString(fileHash.Sum(nil))
			result.TotalBytes += written
		}
		if err := encoder.Encode(entry); err != nil {
			_ = tarWriter.Close()
			_ = compressor.Close()
			return ArchiveResult{}, fmt.Errorf("write manifest: %w", err)
		}
		result.FileCount++
	}

	if err := tarWriter.Close(); err != nil {
		_ = compressor.Close()
		return ArchiveResult{}, fmt.Errorf("close tar archive: %w", err)
	}
	if err := compressor.Close(); err != nil {
		return ArchiveResult{}, fmt.Errorf("close zstd archive: %w", err)
	}

	result.ArchiveSHA256 = hex.EncodeToString(archiveHash.Sum(nil))
	result.ManifestSHA256 = hex.EncodeToString(manifestHash.Sum(nil))
	result.ArchiveBytes = archiveOutput.count
	result.ManifestBytes = manifestOutput.count
	return result, nil
}
