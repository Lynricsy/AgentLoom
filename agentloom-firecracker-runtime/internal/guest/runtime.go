package guest

import (
	"archive/tar"
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	execOutputLimit      = 1024 * 1024
	defaultExecTTL       = 5 * time.Minute
	defaultActiveExecMax = 64
	defaultCompletedMax  = 256
)

type RuntimeAPI struct {
	// 锁序：需要同时持锁时始终先 mutex（注册表），再 execRecord.mutex。
	// output/wait 只在释放注册表锁后获取记录锁，reaper 不得反向取锁。
	mutex        sync.Mutex
	execs        map[string]*execRecord
	mux          *http.ServeMux
	execTTL      time.Duration
	activeMax    int
	completedMax int
	pending      int
	now          func() time.Time
	schedule     func(time.Duration, func())
}

type execRecord struct {
	mutex    sync.Mutex
	command  *exec.Cmd
	started  time.Time
	finished time.Time
	done     chan struct{}
	exitCode int
	pid      int
	output   []execOutput
}

type execOutput struct {
	Level string `json:"level"`
	Data  string `json:"data"`
}

type execRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	CWD     string   `json:"cwd,omitempty"`
	Env     []string `json:"env,omitempty"`
}

func NewRuntimeAPI() *RuntimeAPI {
	return newRuntimeAPI(defaultExecTTL, defaultActiveExecMax, defaultCompletedMax)
}

func newRuntimeAPI(ttl time.Duration, activeMax, completedMax int) *RuntimeAPI {
	runtimeAPI := &RuntimeAPI{
		execs: make(map[string]*execRecord), mux: http.NewServeMux(),
		execTTL: ttl, activeMax: activeMax, completedMax: completedMax, now: time.Now,
		schedule: func(delay time.Duration, callback func()) { time.AfterFunc(delay, callback) },
	}
	runtimeAPI.mux.HandleFunc("GET /v1/runtime/archive", runtimeAPI.getArchive)
	runtimeAPI.mux.HandleFunc("PUT /v1/runtime/archive", runtimeAPI.putArchive)
	runtimeAPI.mux.HandleFunc("GET /v1/runtime/files", runtimeAPI.readTextFile)
	runtimeAPI.mux.HandleFunc("HEAD /v1/runtime/files", runtimeAPI.validateWriteFile)
	runtimeAPI.mux.HandleFunc("PUT /v1/runtime/files", runtimeAPI.writeTextFile)
	runtimeAPI.mux.HandleFunc("POST /v1/runtime/exec", runtimeAPI.createExec)
	runtimeAPI.mux.HandleFunc("GET /v1/runtime/exec/{id}/output", runtimeAPI.execOutput)
	runtimeAPI.mux.HandleFunc("GET /v1/runtime/exec/{id}/wait", runtimeAPI.waitExec)
	runtimeAPI.mux.HandleFunc("POST /v1/runtime/exec/{id}/kill", runtimeAPI.killExec)
	runtimeAPI.mux.HandleFunc("GET /v1/runtime/stats", runtimeAPI.stats)
	runtimeAPI.mux.HandleFunc("GET /v1/runtime/processes", runtimeAPI.processes)
	return runtimeAPI
}

func (runtimeAPI *RuntimeAPI) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	runtimeAPI.mux.ServeHTTP(response, request)
}

func (runtimeAPI *RuntimeAPI) readTextFile(response http.ResponseWriter, request *http.Request) {
	maxBytes, err := textFileLimit(request)
	if err != nil {
		http.Error(response, "invalid file size limit", http.StatusBadRequest)
		return
	}
	path, err := resolveRuntimePath(request.URL.Query().Get("path"), false)
	if err != nil {
		http.Error(response, "file path is unavailable", http.StatusNotFound)
		return
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		http.Error(response, "path is not a regular file", http.StatusBadRequest)
		return
	}
	if info.Size() > maxBytes {
		http.Error(response, "file exceeds size limit", http.StatusRequestEntityTooLarge)
		return
	}
	response.Header().Set("Content-Type", "application/octet-stream")
	response.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	http.ServeFile(response, request, path)
}

func (runtimeAPI *RuntimeAPI) validateWriteFile(response http.ResponseWriter, request *http.Request) {
	if _, err := textFileLimit(request); err != nil {
		http.Error(response, "invalid file size limit", http.StatusBadRequest)
		return
	}
	if _, err := resolveWriteFilePath(request.URL.Query().Get("path")); err != nil {
		http.Error(response, "file write target is invalid", http.StatusBadRequest)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (runtimeAPI *RuntimeAPI) writeTextFile(response http.ResponseWriter, request *http.Request) {
	maxBytes, err := textFileLimit(request)
	if err != nil {
		http.Error(response, "invalid file size limit", http.StatusBadRequest)
		return
	}
	path, err := resolveWriteFilePath(request.URL.Query().Get("path"))
	if err != nil {
		http.Error(response, "file write target is invalid", http.StatusBadRequest)
		return
	}
	content, err := io.ReadAll(io.LimitReader(request.Body, maxBytes+1))
	if err != nil || int64(len(content)) > maxBytes {
		http.Error(response, "file content exceeds size limit", http.StatusRequestEntityTooLarge)
		return
	}
	if strings.ContainsRune(string(content), '\x00') {
		http.Error(response, "binary content is forbidden", http.StatusBadRequest)
		return
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".agentloom-write-*.tmp")
	if err != nil {
		http.Error(response, "unable to stage file", http.StatusInternalServerError)
		return
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		http.Error(response, "unable to secure staged file", http.StatusInternalServerError)
		return
	}
	_, writeErr := temporary.Write(content)
	syncErr := temporary.Sync()
	closeErr := temporary.Close()
	if err := errors.Join(writeErr, syncErr, closeErr); err != nil {
		http.Error(response, "unable to stage file", http.StatusInternalServerError)
		return
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		http.Error(response, "unable to commit file", http.StatusInternalServerError)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (runtimeAPI *RuntimeAPI) createExec(response http.ResponseWriter, request *http.Request) {
	var input execRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 256*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(response, "invalid exec request", http.StatusBadRequest)
		return
	}
	if err := validateExecRequest(input); err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}
	identifier, err := randomIdentifier()
	if err != nil {
		http.Error(response, "unable to allocate exec", http.StatusInternalServerError)
		return
	}
	command := exec.Command(input.Command, input.Args...)
	command.Dir = input.CWD
	if command.Dir == "" {
		command.Dir = "/workspace"
	}
	command.Env = append(os.Environ(), input.Env...)
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, err := command.StdoutPipe()
	if err != nil {
		http.Error(response, "unable to attach stdout", http.StatusInternalServerError)
		return
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		http.Error(response, "unable to attach stderr", http.StatusInternalServerError)
		return
	}
	record := &execRecord{command: command, started: runtimeAPI.now(), done: make(chan struct{}), exitCode: -1}
	runtimeAPI.mutex.Lock()
	runtimeAPI.reapExecsLocked(runtimeAPI.now())
	if runtimeAPI.activeExecCountLocked()+runtimeAPI.pending >= runtimeAPI.activeMax {
		runtimeAPI.mutex.Unlock()
		http.Error(response, "active exec capacity exhausted", http.StatusTooManyRequests)
		return
	}
	runtimeAPI.pending++
	runtimeAPI.mutex.Unlock()
	if err := command.Start(); err != nil {
		runtimeAPI.mutex.Lock()
		runtimeAPI.pending--
		runtimeAPI.mutex.Unlock()
		http.Error(response, "unable to start process", http.StatusBadGateway)
		return
	}
	record.pid = command.Process.Pid
	runtimeAPI.mutex.Lock()
	runtimeAPI.pending--
	runtimeAPI.execs[identifier] = record
	runtimeAPI.mutex.Unlock()
	var readers sync.WaitGroup
	readers.Add(2)
	go record.capture("stdout", stdout, &readers)
	go record.capture("stderr", stderr, &readers)
	go func() {
		err := command.Wait()
		readers.Wait()
		record.mutex.Lock()
		if err == nil {
			record.exitCode = 0
		} else if exitError, ok := err.(*exec.ExitError); ok {
			record.exitCode = exitError.ExitCode()
		} else {
			record.exitCode = 255
		}
		record.finished = runtimeAPI.now()
		record.mutex.Unlock()
		close(record.done)
		runtimeAPI.mutex.Lock()
		runtimeAPI.reapExecsLocked(runtimeAPI.now())
		runtimeAPI.mutex.Unlock()
		runtimeAPI.scheduleReap()
	}()
	writeRuntimeJSON(response, http.StatusCreated, map[string]string{"execId": identifier})
}

func (record *execRecord) capture(level string, reader io.Reader, waitGroup *sync.WaitGroup) {
	defer waitGroup.Done()
	buffer := make([]byte, 32*1024)
	for {
		count, err := reader.Read(buffer)
		if count > 0 {
			record.mutex.Lock()
			currentSize := 0
			for _, value := range record.output {
				currentSize += len(value.Data)
			}
			if currentSize < execOutputLimit {
				remaining := execOutputLimit - currentSize
				if count > remaining {
					count = remaining
				}
				record.output = append(record.output, execOutput{Level: level, Data: base64.StdEncoding.EncodeToString(buffer[:count])})
			}
			record.mutex.Unlock()
		}
		if err != nil {
			return
		}
	}
}

func validateExecRequest(input execRequest) error {
	if input.Command == "" || len(input.Command) > 256 || len(input.Args) > 256 || len(input.Env) > 128 {
		return errors.New("command exceeds supported bounds")
	}
	if strings.ContainsAny(input.Command, "\x00\r\n") {
		return errors.New("command contains invalid characters")
	}
	if strings.Contains(input.Command, "/") {
		clean := filepath.Clean(input.Command)
		if !strings.HasPrefix(clean, "/bin/") && !strings.HasPrefix(clean, "/usr/bin/") && !strings.HasPrefix(clean, "/usr/local/bin/") {
			return errors.New("absolute command is outside runtime binary roots")
		}
	}
	cwd := input.CWD
	if cwd == "" {
		cwd = "/workspace"
	}
	if _, err := resolveRuntimePath(cwd, true); err != nil {
		return fmt.Errorf("invalid cwd: %w", err)
	}
	for _, value := range input.Args {
		if len(value) > 64*1024 || strings.ContainsRune(value, '\x00') {
			return errors.New("argument exceeds supported bounds")
		}
	}
	for _, value := range input.Env {
		name, _, ok := strings.Cut(value, "=")
		if !ok || name == "" || strings.ContainsAny(name, "\x00\r\n") {
			return errors.New("environment entry is invalid")
		}
		switch name {
		case "LD_PRELOAD", "LD_LIBRARY_PATH", "NODE_OPTIONS":
			return fmt.Errorf("environment variable %s is forbidden", name)
		}
	}
	return nil
}

func (runtimeAPI *RuntimeAPI) scheduleReap() {
	if runtimeAPI.execTTL <= 0 {
		return
	}
	runtimeAPI.schedule(runtimeAPI.execTTL, func() {
		runtimeAPI.reapExecs(runtimeAPI.now())
	})
}

func (runtimeAPI *RuntimeAPI) activeExecCountLocked() int {
	active := 0
	for _, record := range runtimeAPI.execs {
		record.mutex.Lock()
		if record.finished.IsZero() {
			active++
		}
		record.mutex.Unlock()
	}
	return active
}

func (runtimeAPI *RuntimeAPI) reapExecs(now time.Time) {
	runtimeAPI.mutex.Lock()
	defer runtimeAPI.mutex.Unlock()
	runtimeAPI.reapExecsLocked(now)
}

func (runtimeAPI *RuntimeAPI) reapExecsLocked(now time.Time) {
	type completedExec struct {
		id       string
		finished time.Time
	}
	completed := make([]completedExec, 0)
	for id, record := range runtimeAPI.execs {
		record.mutex.Lock()
		finished := record.finished
		record.mutex.Unlock()
		if finished.IsZero() {
			continue
		}
		if runtimeAPI.execTTL <= 0 || !now.Before(finished.Add(runtimeAPI.execTTL)) {
			delete(runtimeAPI.execs, id)
			continue
		}
		completed = append(completed, completedExec{id: id, finished: finished})
	}
	for len(completed) > runtimeAPI.completedMax {
		oldest := 0
		for index := 1; index < len(completed); index++ {
			if completed[index].finished.Before(completed[oldest].finished) {
				oldest = index
			}
		}
		delete(runtimeAPI.execs, completed[oldest].id)
		completed = append(completed[:oldest], completed[oldest+1:]...)
	}
}

func (runtimeAPI *RuntimeAPI) getExec(id string) (*execRecord, bool) {
	runtimeAPI.mutex.Lock()
	defer runtimeAPI.mutex.Unlock()
	record, ok := runtimeAPI.execs[id]
	return record, ok
}

func (runtimeAPI *RuntimeAPI) execOutput(response http.ResponseWriter, request *http.Request) {
	record, ok := runtimeAPI.getExec(request.PathValue("id"))
	if !ok {
		http.Error(response, "exec not found", http.StatusNotFound)
		return
	}
	select {
	case <-record.done:
	case <-request.Context().Done():
		return
	}
	record.mutex.Lock()
	output := append([]execOutput(nil), record.output...)
	record.mutex.Unlock()
	response.Header().Set("Content-Type", "application/x-ndjson")
	encoder := json.NewEncoder(response)
	for _, value := range output {
		if err := encoder.Encode(value); err != nil {
			return
		}
	}
}

func (runtimeAPI *RuntimeAPI) waitExec(response http.ResponseWriter, request *http.Request) {
	record, ok := runtimeAPI.getExec(request.PathValue("id"))
	if !ok {
		http.Error(response, "exec not found", http.StatusNotFound)
		return
	}
	select {
	case <-record.done:
	case <-request.Context().Done():
		return
	}
	record.mutex.Lock()
	exitCode, pid := record.exitCode, record.pid
	record.mutex.Unlock()
	writeRuntimeJSON(response, http.StatusOK, map[string]any{"running": false, "exitCode": exitCode, "pid": pid})
}

func (runtimeAPI *RuntimeAPI) killExec(response http.ResponseWriter, request *http.Request) {
	record, ok := runtimeAPI.getExec(request.PathValue("id"))
	if !ok {
		http.Error(response, "exec not found", http.StatusNotFound)
		return
	}
	var input struct {
		Signal string `json:"signal"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(response, request.Body, 4096)).Decode(&input)
	signal := syscall.SIGTERM
	switch strings.ToUpper(input.Signal) {
	case "", "TERM", "SIGTERM":
	case "INT", "SIGINT":
		signal = syscall.SIGINT
	case "KILL", "SIGKILL":
		signal = syscall.SIGKILL
	default:
		http.Error(response, "unsupported signal", http.StatusBadRequest)
		return
	}
	if err := syscall.Kill(-record.pid, signal); err != nil && !errors.Is(err, os.ErrProcessDone) {
		http.Error(response, "unable to signal exec", http.StatusConflict)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (runtimeAPI *RuntimeAPI) stats(response http.ResponseWriter, _ *http.Request) {
	memoryUsage, memoryLimit := readMemoryStats()
	writeRuntimeJSON(response, http.StatusOK, map[string]any{
		"cpuPercent": 0, "memoryUsageMb": memoryUsage, "memoryLimitMb": memoryLimit,
	})
}

func readMemoryStats() (float64, float64) {
	content, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	values := make(map[string]float64)
	scanner := bufio.NewScanner(strings.NewReader(string(content)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 2 {
			value, _ := strconv.ParseFloat(fields[1], 64)
			values[strings.TrimSuffix(fields[0], ":")] = value / 1024
		}
	}
	total, available := values["MemTotal"], values["MemAvailable"]
	return total - available, total
}

func (runtimeAPI *RuntimeAPI) processes(response http.ResponseWriter, _ *http.Request) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		http.Error(response, "process list unavailable", http.StatusServiceUnavailable)
		return
	}
	processes := make([]map[string]any, 0)
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid < 1 {
			continue
		}
		executable, _ := os.Readlink(filepath.Join("/proc", entry.Name(), "exe"))
		commandContent, _ := os.ReadFile(filepath.Join("/proc", entry.Name(), "cmdline"))
		command := strings.TrimSpace(strings.ReplaceAll(string(commandContent), "\x00", " "))
		statContent, _ := os.ReadFile(filepath.Join("/proc", entry.Name(), "stat"))
		state := ""
		if fields := strings.Fields(string(statContent)); len(fields) > 2 {
			state = fields[2]
		}
		processes = append(processes, map[string]any{
			"pid": pid, "cpuPercent": 0, "memoryPercent": 0, "state": state,
			"elapsed": "", "executable": executable, "command": command,
		})
	}
	writeRuntimeJSON(response, http.StatusOK, processes)
}

func (runtimeAPI *RuntimeAPI) getArchive(response http.ResponseWriter, request *http.Request) {
	path, err := resolveRuntimePath(request.URL.Query().Get("path"), false)
	if err != nil {
		http.Error(response, "archive path is invalid", http.StatusBadRequest)
		return
	}
	response.Header().Set("Content-Type", "application/x-tar")
	writer := tar.NewWriter(response)
	defer writer.Close()
	parent := filepath.Dir(path)
	err = filepath.Walk(path, func(current string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(parent, current)
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(relative)
		if info.Mode()&os.ModeSymlink != 0 {
			target, err := os.Readlink(current)
			if err != nil {
				return err
			}
			header.Linkname = target
		}
		if err := writer.WriteHeader(header); err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		file, err := os.Open(current)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(writer, file)
		closeErr := file.Close()
		return errors.Join(copyErr, closeErr)
	})
	if err != nil {
		return
	}
}

func (runtimeAPI *RuntimeAPI) putArchive(response http.ResponseWriter, request *http.Request) {
	destination, err := resolveRuntimePath(request.URL.Query().Get("path"), false)
	if err != nil {
		http.Error(response, "archive destination is invalid", http.StatusBadRequest)
		return
	}
	reader := tar.NewReader(request.Body)
	var total int64
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			http.Error(response, "invalid tar archive", http.StatusBadRequest)
			return
		}
		if header.Size < 0 || header.Size > 10*1024*1024*1024 || total+header.Size > 10*1024*1024*1024 {
			http.Error(response, "tar archive exceeds runtime limit", http.StatusRequestEntityTooLarge)
			return
		}
		total += header.Size
		target, err := safeArchiveTarget(destination, header.Name)
		if err != nil {
			http.Error(response, "tar entry escapes destination", http.StatusBadRequest)
			return
		}
		if err := rejectSymlinkParents(destination, target); err != nil {
			http.Error(response, "tar entry traverses a symlink", http.StatusBadRequest)
			return
		}
		mode := os.FileMode(header.Mode) & (os.ModePerm | os.ModeSticky)
		switch header.Typeflag {
		case tar.TypeDir:
			err = os.MkdirAll(target, mode)
		case tar.TypeReg, tar.TypeRegA:
			if err = os.MkdirAll(filepath.Dir(target), 0o755); err == nil {
				var file *os.File
				file, err = os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
				if err == nil {
					_, copyErr := io.CopyN(file, reader, header.Size)
					err = errors.Join(copyErr, file.Close())
				}
			}
		case tar.TypeSymlink:
			var linkTarget string
			linkTarget, err = safeArchiveLink(destination, target, header.Linkname)
			if err == nil {
				err = os.MkdirAll(filepath.Dir(target), 0o755)
			}
			if err == nil {
				_ = os.Remove(target)
				err = os.Symlink(linkTarget, target)
			}
		case tar.TypeLink:
			var linkTarget string
			linkTarget, err = safeArchiveTarget(destination, header.Linkname)
			if err == nil {
				err = os.Link(linkTarget, target)
			}
		default:
			err = fmt.Errorf("unsupported tar entry type %d", header.Typeflag)
		}
		if err != nil {
			http.Error(response, "unable to extract tar archive", http.StatusBadRequest)
			return
		}
	}
	response.WriteHeader(http.StatusNoContent)
}

func resolveRuntimePath(raw string, mustBeDirectory bool) (string, error) {
	if raw == "" || strings.ContainsRune(raw, '\x00') {
		return "", errors.New("path is required")
	}
	clean := filepath.Clean(raw)
	if !filepath.IsAbs(clean) || !withinRuntimeRoot(clean) {
		return "", errors.New("path is outside mutable runtime roots")
	}
	resolved, err := filepath.EvalSymlinks(clean)
	if err != nil {
		return "", err
	}
	if !withinRuntimeRoot(resolved) {
		return "", errors.New("path resolves outside mutable runtime roots")
	}
	if mustBeDirectory {
		info, err := os.Stat(resolved)
		if err != nil || !info.IsDir() {
			return "", errors.New("path is not a directory")
		}
	}
	return resolved, nil
}

func textFileLimit(request *http.Request) (int64, error) {
	raw := request.URL.Query().Get("maxBytes")
	if raw == "" {
		return 10 * 1024 * 1024, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 1 || value > 10*1024*1024 {
		return 0, errors.New("invalid maxBytes")
	}
	return value, nil
}

func resolveWriteFilePath(raw string) (string, error) {
	if raw == "" || strings.ContainsRune(raw, '\x00') {
		return "", errors.New("path is required")
	}
	clean := filepath.Clean(raw)
	if !filepath.IsAbs(clean) || !withinRuntimeRoot(clean) || clean == "/workspace" || clean == "/tmp" {
		return "", errors.New("path is outside writable file roots")
	}
	if info, err := os.Lstat(clean); err == nil {
		if !info.Mode().IsRegular() {
			return "", errors.New("target is not a regular file")
		}
		resolved, err := filepath.EvalSymlinks(clean)
		if err != nil || !withinRuntimeRoot(resolved) {
			return "", errors.New("target resolves outside writable roots")
		}
		return resolved, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(clean))
	if err != nil {
		return "", err
	}
	info, err := os.Stat(parent)
	if err != nil || !info.IsDir() || !withinRuntimeRoot(parent) {
		return "", errors.New("parent is outside writable roots")
	}
	return clean, nil
}

func withinRuntimeRoot(path string) bool {
	for _, root := range []string{"/workspace", "/tmp"} {
		if path == root || strings.HasPrefix(path, root+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func safeArchiveTarget(destination, name string) (string, error) {
	if name == "" || filepath.IsAbs(name) || strings.ContainsRune(name, '\x00') {
		return "", errors.New("unsafe tar entry")
	}
	target := filepath.Clean(filepath.Join(destination, filepath.FromSlash(name)))
	if target != destination && !strings.HasPrefix(target, destination+string(os.PathSeparator)) {
		return "", errors.New("tar entry escapes destination")
	}
	return target, nil
}

func rejectSymlinkParents(destination, target string) error {
	relative, err := filepath.Rel(destination, filepath.Dir(target))
	if err != nil {
		return err
	}
	current := destination
	for _, component := range strings.Split(relative, string(os.PathSeparator)) {
		if component == "." || component == "" {
			continue
		}
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return errors.New("archive parent is a symlink")
		}
	}
	return nil
}

func safeArchiveLink(destination, target, linkname string) (string, error) {
	if linkname == "" || filepath.IsAbs(linkname) || strings.ContainsRune(linkname, '\x00') {
		return "", errors.New("unsafe symlink")
	}
	resolved := filepath.Clean(filepath.Join(filepath.Dir(target), filepath.FromSlash(linkname)))
	if resolved != destination && !strings.HasPrefix(resolved, destination+string(os.PathSeparator)) {
		return "", errors.New("symlink escapes destination")
	}
	return linkname, nil
}

func randomIdentifier() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func writeRuntimeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
