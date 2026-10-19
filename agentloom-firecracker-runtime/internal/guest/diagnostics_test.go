package guest

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReadOOMKillsParsesKernelLogRecords(t *testing.T) {
	t.Parallel()

	kmsg := filepath.Join(t.TempDir(), "kmsg")
	records := strings.Join([]string{
		"6,100,1000000,-;systemd[1]: Started agentloom-guestd.service.",
		"4,101,95500000,-;node invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0",
		"3,102,95600000,-;Out of memory: Killed process 715 (npm install) total-vm:1234kB, anon-rss:456kB",
		" SUBSYSTEM=memory",
		"3,103,120250000,-;Memory cgroup out of memory: Killed process 802 (node) total-vm:1kB",
	}, "\n") + "\n"
	if err := os.WriteFile(kmsg, []byte(records), 0o600); err != nil {
		t.Fatal(err)
	}

	kills := readOOMKills(kmsg)
	if len(kills) != 2 {
		t.Fatalf("expected 2 oom kills, got %+v", kills)
	}
	if kills[0].PID != 715 || kills[0].Command != "npm install" || kills[0].SecondsSinceBoot != 95.6 {
		t.Fatalf("unexpected first kill: %+v", kills[0])
	}
	if kills[1].PID != 802 || kills[1].Command != "node" {
		t.Fatalf("unexpected second kill: %+v", kills[1])
	}
	if missing := readOOMKills(filepath.Join(t.TempDir(), "absent")); len(missing) != 0 {
		t.Fatalf("missing kmsg should yield no kills, got %+v", missing)
	}
}

func TestRuntimeDiagnosticsEndpointReportsRestartsAndOOM(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	kmsg := filepath.Join(directory, "kmsg")
	vmstat := filepath.Join(directory, "vmstat")
	uptime := filepath.Join(directory, "uptime")
	writeFile(t, kmsg, "3,7,95600000,-;Out of memory: Killed process 715 (npm install) total-vm:1kB\n")
	writeFile(t, vmstat, "pgfault 10\noom_kill 1\n")
	writeFile(t, uptime, "100.25 80.00\n")

	runtimeAPI := NewRuntimeAPI()
	runtimeAPI.diagnostics.kmsgPath = kmsg
	runtimeAPI.diagnostics.vmstatPath = vmstat
	runtimeAPI.diagnostics.uptimePath = uptime
	runtimeAPI.diagnostics.recordRuntimeExit(errors.New("signal: killed"))

	recorder := httptest.NewRecorder()
	runtimeAPI.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/runtime/diagnostics", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var report runtimeDiagnosticsReport
	if err := json.Unmarshal(recorder.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.RuntimeRestarts != 1 || report.LastRuntimeExit == nil || report.LastRuntimeExit.Error != "signal: killed" {
		t.Fatalf("unexpected restart report: %+v", report)
	}
	if report.OOMKillCount != 1 || len(report.OOMKills) != 1 || report.OOMKills[0].Command != "npm install" {
		t.Fatalf("unexpected oom report: %+v", report)
	}
	if report.UptimeSeconds != 100.25 {
		t.Fatalf("unexpected uptime: %v", report.UptimeSeconds)
	}
}

func TestSuperviseNodeRuntimeRecordsUnexpectedExit(t *testing.T) {
	binDirectory := t.TempDir()
	writeFile(t, filepath.Join(binDirectory, "node"), "#!/bin/sh\nexit 3\n")
	if err := os.Chmod(filepath.Join(binDirectory, "node"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDirectory+string(os.PathListSeparator)+os.Getenv("PATH"))

	diagnostics := newRuntimeDiagnostics()
	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()
	config := Config{NodeSocket: "/tmp/agentloom-test.sock", NodeEntry: "/nonexistent.js", Logger: slog.New(slog.DiscardHandler)}
	if err := superviseNodeRuntime(ctx, config, diagnostics); err != nil {
		t.Fatal(err)
	}

	report := diagnostics.report()
	if report.RuntimeRestarts < 1 || report.LastRuntimeExit == nil || report.LastRuntimeExit.Error != "exit status 3" {
		t.Fatalf("expected recorded runtime exit, got %+v", report)
	}
}

// guest 单元的 OOM 与 HOME 约定：OOM 只杀进程、不停整个单元；agent 命令有可写 HOME。
func TestGuestdUnitKeepsRuntimeAliveOnOOMAndProvidesWritableHome(t *testing.T) {
	t.Parallel()

	content, err := os.ReadFile(filepath.Join("..", "..", "..", "agentloom-deploy", "firecracker", "systemd", "agentloom-guestd.service"))
	if err != nil {
		t.Fatal(err)
	}
	directives := make(map[string][]string)
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "[") {
			continue
		}
		key, value, _ := strings.Cut(line, "=")
		directives[key] = append(directives[key], value)
	}
	if got := directives["OOMPolicy"]; len(got) != 1 || got[0] != "continue" {
		t.Fatalf("OOMPolicy must be continue, got %v", got)
	}
	if got := directives["ProtectHome"]; len(got) != 0 && got[len(got)-1] != "no" {
		t.Fatalf("ProtectHome makes HOME unwritable for agent commands, got %v", got)
	}
	foundHome := false
	for _, value := range directives["Environment"] {
		if value == "HOME=/root" {
			foundHome = true
		}
	}
	if !foundHome {
		t.Fatalf("Environment=HOME=/root is required, got %v", directives["Environment"])
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}
