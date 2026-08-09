package cutover

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestPutWorkspaceArchiveDoesNotCloseBorrowedReader(t *testing.T) {

	socketPath := filepath.Join(t.TempDir(), "docker.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPut {
			t.Errorf("unexpected method %s", request.Method)
		}
		if _, err := io.Copy(io.Discard, request.Body); err != nil {
			t.Errorf("read request body: %v", err)
		}
		response.WriteHeader(http.StatusOK)
	})}
	go func() {
		_ = server.Serve(listener)
	}()
	t.Cleanup(func() {
		_ = server.Close()
	})

	t.Setenv("DOCKER_HOST", "unix://"+socketPath)
	runtime, err := NewDockerRuntime()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = runtime.Close()
	})

	archive, err := os.CreateTemp(t.TempDir(), "workspace-*.tar")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = archive.Close()
	})
	if _, err := archive.WriteString("workspace archive"); err != nil {
		t.Fatal(err)
	}
	if _, err := archive.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}

	if err := runtime.PutWorkspaceArchive(context.Background(), "legacy-container", archive); err != nil {
		t.Fatal(err)
	}
	if _, err := archive.Seek(0, io.SeekStart); err != nil {
		t.Fatalf("PutWorkspaceArchive closed caller-owned reader: %v", err)
	}
}
