package cutover

import (
	"archive/tar"
	"io"
	"testing"
)

func TestVerifyWorkspaceArchiveStreamsLargeFile(t *testing.T) {
	const size = int64(16 * 1024 * 1024)
	result, err := BuildWorkspaceArchive(largeWorkspaceTar(size), io.Discard, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	migration := MigrationRecord{
		ManifestSHA256: result.ManifestSHA256,
		FileCount:      result.FileCount,
		TotalBytes:     result.TotalBytes,
	}
	if err := VerifyWorkspaceArchive(largeWorkspaceTar(size), migration); err != nil {
		t.Fatal(err)
	}
}

func largeWorkspaceTar(size int64) io.Reader {
	reader, writer := io.Pipe()
	go func() {
		tarWriter := tar.NewWriter(writer)
		err := tarWriter.WriteHeader(&tar.Header{
			Name:     "workspace/large.bin",
			Mode:     0o600,
			Size:     size,
			Typeflag: tar.TypeReg,
		})
		chunk := make([]byte, 64*1024)
		for remaining := size; err == nil && remaining > 0; {
			current := int64(len(chunk))
			if remaining < current {
				current = remaining
			}
			_, err = tarWriter.Write(chunk[:current])
			remaining -= current
		}
		if closeErr := tarWriter.Close(); err == nil {
			err = closeErr
		}
		_ = writer.CloseWithError(err)
	}()
	return reader
}
