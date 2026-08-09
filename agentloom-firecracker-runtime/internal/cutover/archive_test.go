package cutover

import (
	"archive/tar"
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildWorkspaceArchiveProducesChecksummedManifest(t *testing.T) {
	t.Parallel()

	var source bytes.Buffer
	writer := tar.NewWriter(&source)
	entries := []struct {
		header tar.Header
		body   string
	}{
		{header: tar.Header{Name: "workspace/empty", Typeflag: tar.TypeDir, Mode: 0o755}},
		{header: tar.Header{Name: "workspace/你好.txt", Typeflag: tar.TypeReg, Mode: 0o640, Size: 5}, body: "hello"},
		{header: tar.Header{Name: "workspace/link", Typeflag: tar.TypeSymlink, Mode: 0o777, Linkname: "你好.txt"}},
	}
	for _, entry := range entries {
		if err := writer.WriteHeader(&entry.header); err != nil {
			t.Fatal(err)
		}
		if entry.body != "" {
			if _, err := writer.Write([]byte(entry.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	var archive bytes.Buffer
	var manifest bytes.Buffer
	result, err := BuildWorkspaceArchive(&source, &archive, &manifest)
	if err != nil {
		t.Fatal(err)
	}
	if result.FileCount != 3 || result.TotalBytes != 5 {
		t.Fatalf("unexpected archive totals: %+v", result)
	}
	if len(result.ArchiveSHA256) != 64 || len(result.ManifestSHA256) != 64 {
		t.Fatalf("missing sha256 digests: %+v", result)
	}

	decoder := json.NewDecoder(&manifest)
	var decoded []ManifestEntry
	for decoder.More() {
		var entry ManifestEntry
		if err := decoder.Decode(&entry); err != nil {
			t.Fatal(err)
		}
		decoded = append(decoded, entry)
	}
	if decoded[1].Path != "你好.txt" || decoded[1].SHA256 == "" {
		t.Fatalf("regular file checksum missing: %+v", decoded[1])
	}
	if decoded[2].Type != "symlink" || decoded[2].Target != "你好.txt" {
		t.Fatalf("symlink metadata missing: %+v", decoded[2])
	}
}

func TestBuildWorkspaceArchiveRejectsEscapesAndDevices(t *testing.T) {
	t.Parallel()

	for name, header := range map[string]tar.Header{
		"traversal": {Name: "workspace/../../host", Typeflag: tar.TypeReg, Size: 0},
		"symlink":   {Name: "workspace/link", Typeflag: tar.TypeSymlink, Linkname: "../../host"},
		"device":    {Name: "workspace/device", Typeflag: tar.TypeChar},
	} {
		t.Run(name, func(t *testing.T) {
			var source bytes.Buffer
			writer := tar.NewWriter(&source)
			if err := writer.WriteHeader(&header); err != nil {
				t.Fatal(err)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			_, err := BuildWorkspaceArchive(&source, &bytes.Buffer{}, &bytes.Buffer{})
			if err == nil {
				t.Fatal("expected malicious archive to be rejected")
			}
		})
	}
}

func TestNormalizeWorkspacePath(t *testing.T) {
	t.Parallel()

	path, err := NormalizeWorkspacePath("workspace/nested/file.txt")
	if err != nil || path != "nested/file.txt" {
		t.Fatalf("unexpected normalization: path=%q err=%v", path, err)
	}
	for _, invalid := range []string{"/workspace/file", "../host", "workspace/../../host"} {
		if _, err := NormalizeWorkspacePath(invalid); err == nil || !strings.Contains(err.Error(), "forbidden") && !strings.Contains(err.Error(), "escapes") {
			t.Fatalf("expected %q to be rejected, got %v", invalid, err)
		}
	}
}
