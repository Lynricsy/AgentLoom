package guest

import (
	"archive/tar"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRuntimeExecCapturesOutputAndExit(t *testing.T) {
	runtimeAPI := NewRuntimeAPI()
	create := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/runtime/exec", strings.NewReader(`{"command":"/bin/sh","args":["-c","printf out; printf err >&2"],"cwd":"/tmp"}`))
	runtimeAPI.ServeHTTP(create, request)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", create.Code, create.Body.String())
	}
	var created map[string]string
	if err := json.Unmarshal(create.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	execID := created["execId"]
	output := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(output, httptest.NewRequest(http.MethodGet, "/v1/runtime/exec/"+execID+"/output", nil))
	if output.Code != http.StatusOK {
		t.Fatalf("output status=%d", output.Code)
	}
	decoded := ""
	for _, line := range strings.Split(strings.TrimSpace(output.Body.String()), "\n") {
		var event execOutput
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		value, err := base64.StdEncoding.DecodeString(event.Data)
		if err != nil {
			t.Fatal(err)
		}
		decoded += event.Level + ":" + string(value) + ";"
	}
	if !strings.Contains(decoded, "stdout:out") || !strings.Contains(decoded, "stderr:err") {
		t.Fatalf("unexpected output %q", decoded)
	}
	wait := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(wait, httptest.NewRequest(http.MethodGet, "/v1/runtime/exec/"+execID+"/wait", nil))
	if !strings.Contains(wait.Body.String(), `"exitCode":0`) {
		t.Fatalf("unexpected wait response: %s", wait.Body.String())
	}
}

func TestExecRegistrySchedulesTTLReaping(t *testing.T) {
	finished := time.Now()
	runtimeAPI := newRuntimeAPI(time.Second, 2, 2)
	runtimeAPI.now = func() time.Time { return finished.Add(time.Second) }
	scheduled := make(chan func(), 1)
	runtimeAPI.schedule = func(delay time.Duration, callback func()) {
		if delay != time.Second {
			t.Errorf("unexpected reaper delay %s", delay)
		}
		scheduled <- callback
	}
	done := make(chan struct{})
	close(done)
	runtimeAPI.execs["finished"] = &execRecord{finished: finished, done: done}
	runtimeAPI.scheduleReap()
	callback := <-scheduled
	callback()
	response := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/runtime/exec/finished/wait", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("TTL reaper left expired exec: status=%d", response.Code)
	}
}

func TestExecRegistryReapsExpiredRecordsDuringConcurrentReads(t *testing.T) {
	runtimeAPI := newRuntimeAPI(time.Second, 2, 2)
	done := make(chan struct{})
	close(done)
	finished := time.Now()
	runtimeAPI.execs["expired"] = &execRecord{
		started: finished.Add(-time.Second), finished: finished,
		done: done, exitCode: 0, pid: 42,
		output: []execOutput{{Level: "stdout", Data: base64.StdEncoding.EncodeToString([]byte("done"))}},
	}
	var readers sync.WaitGroup
	for range 20 {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for range 20 {
				output := httptest.NewRecorder()
				runtimeAPI.ServeHTTP(output, httptest.NewRequest(http.MethodGet, "/v1/runtime/exec/expired/output", nil))
				if output.Code != http.StatusOK && output.Code != http.StatusNotFound {
					t.Errorf("unexpected concurrent output status %d", output.Code)
				}
				wait := httptest.NewRecorder()
				runtimeAPI.ServeHTTP(wait, httptest.NewRequest(http.MethodGet, "/v1/runtime/exec/expired/wait", nil))
				if wait.Code != http.StatusOK && wait.Code != http.StatusNotFound {
					t.Errorf("unexpected concurrent wait status %d", wait.Code)
				}
			}
		}()
	}
	runtimeAPI.reapExecs(finished.Add(time.Second))
	readers.Wait()
	response := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/runtime/exec/expired/wait", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("expired exec was not reaped: status=%d", response.Code)
	}
}

func TestExecRegistryEnforcesActiveAndCompletedLimits(t *testing.T) {
	runtimeAPI := newRuntimeAPI(time.Hour, 1, 1)
	activeDone := make(chan struct{})
	runtimeAPI.execs["active"] = &execRecord{done: activeDone, exitCode: -1}
	response := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/runtime/exec", strings.NewReader(`{"command":"/bin/sh","args":["-c","true"],"cwd":"/tmp"}`)))
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("active limit status=%d body=%s", response.Code, response.Body.String())
	}
	delete(runtimeAPI.execs, "active")
	now := time.Now()
	for index, id := range []string{"old", "new"} {
		done := make(chan struct{})
		close(done)
		runtimeAPI.execs[id] = &execRecord{done: done, finished: now.Add(time.Duration(index) * time.Second)}
	}
	runtimeAPI.reapExecs(now.Add(2 * time.Second))
	if _, ok := runtimeAPI.execs["old"]; ok {
		t.Fatal("oldest completed exec was not evicted")
	}
	if _, ok := runtimeAPI.execs["new"]; !ok {
		t.Fatal("newest completed exec was evicted")
	}
}

func TestRuntimeArchiveRoundTripPreservesBinaryEmptyDirectoryUnicodeAndSymlink(t *testing.T) {
	source := t.TempDir()
	if !strings.HasPrefix(source, "/tmp/") {
		t.Skip("test temp directory is outside guest mutable roots")
	}
	binary := []byte{0, 1, 2, 0xff}
	if err := os.WriteFile(filepath.Join(source, "数据.bin"), binary, 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(source, "empty"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("数据.bin", filepath.Join(source, "link")); err != nil {
		t.Fatal(err)
	}
	runtimeAPI := NewRuntimeAPI()
	archive := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(archive, httptest.NewRequest(http.MethodGet, "/v1/runtime/archive?path="+source, nil))
	if archive.Code != http.StatusOK {
		t.Fatalf("archive status=%d body=%s", archive.Code, archive.Body.String())
	}
	destination := t.TempDir()
	restore := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(restore, httptest.NewRequest(http.MethodPut, "/v1/runtime/archive?path="+destination, bytes.NewReader(archive.Body.Bytes())))
	if restore.Code != http.StatusNoContent {
		t.Fatalf("restore status=%d body=%s", restore.Code, restore.Body.String())
	}
	restoredRoot := filepath.Join(destination, filepath.Base(source))
	actual, err := os.ReadFile(filepath.Join(restoredRoot, "数据.bin"))
	if err != nil || !bytes.Equal(actual, binary) {
		t.Fatalf("binary mismatch: %v %v", actual, err)
	}
	if info, err := os.Stat(filepath.Join(restoredRoot, "empty")); err != nil || !info.IsDir() {
		t.Fatalf("empty directory missing: %v", err)
	}
	if target, err := os.Readlink(filepath.Join(restoredRoot, "link")); err != nil || target != "数据.bin" {
		t.Fatalf("symlink mismatch: %q %v", target, err)
	}
}

func TestRuntimeArchiveRejectsTraversal(t *testing.T) {
	destination := t.TempDir()
	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	if err := writer.WriteHeader(&tar.Header{Name: "../escape", Mode: 0o600, Size: 1, Typeflag: tar.TypeReg}); err != nil {
		t.Fatal(err)
	}
	_, _ = writer.Write([]byte("x"))
	_ = writer.Close()
	response := httptest.NewRecorder()
	NewRuntimeAPI().ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/v1/runtime/archive?path="+destination, &archive))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected traversal rejection, got %d", response.Code)
	}
}

func TestRuntimeTextFileAPIFailsClosedOnSymlinkAndSizeBoundaries(t *testing.T) {
	root := t.TempDir()
	if !strings.HasPrefix(root, "/tmp/") {
		t.Skip("test temp directory is outside guest mutable roots")
	}
	runtimeAPI := NewRuntimeAPI()
	target := filepath.Join(root, "note.txt")
	validate := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(validate, httptest.NewRequest(http.MethodHead, "/v1/runtime/files?maxBytes=32&path="+target, nil))
	if validate.Code != http.StatusNoContent {
		t.Fatalf("validate status=%d body=%s", validate.Code, validate.Body.String())
	}
	write := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(write, httptest.NewRequest(http.MethodPut, "/v1/runtime/files?maxBytes=32&path="+target, strings.NewReader("hello")))
	if write.Code != http.StatusNoContent {
		t.Fatalf("write status=%d body=%s", write.Code, write.Body.String())
	}
	read := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(read, httptest.NewRequest(http.MethodGet, "/v1/runtime/files?maxBytes=32&path="+target, nil))
	if read.Code != http.StatusOK || read.Body.String() != "hello" {
		t.Fatalf("read status=%d body=%q", read.Code, read.Body.String())
	}
	if err := os.Symlink("/etc", filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	escaped := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(escaped, httptest.NewRequest(http.MethodHead, "/v1/runtime/files?maxBytes=32&path="+filepath.Join(root, "escape", "passwd"), nil))
	if escaped.Code != http.StatusBadRequest {
		t.Fatalf("expected symlink escape rejection, got %d", escaped.Code)
	}
	oversized := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(oversized, httptest.NewRequest(http.MethodPut, "/v1/runtime/files?maxBytes=4&path="+target, strings.NewReader("12345")))
	if oversized.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected size rejection, got %d", oversized.Code)
	}
}
