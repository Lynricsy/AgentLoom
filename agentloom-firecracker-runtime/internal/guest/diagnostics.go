package guest

import (
	"bufio"
	"bytes"
	"errors"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	defaultKmsgPath   = "/dev/kmsg"
	defaultVmstatPath = "/proc/vmstat"
	defaultUptimePath = "/proc/uptime"
	// 只保留最近的若干条 OOM 记录，足够定位「哪个进程被内核杀掉」
	maxReportedOOMKills = 10
	// 内核环形缓冲区有界；读取次数上限只是防御性兜底
	maxKmsgReads = 100_000
)

// 内核 OOM killer 日志：「Out of memory: Killed process 715 (npm install) …」
// 与 memcg 版本「Memory cgroup out of memory: Killed process …」格式相同。
var oomKilledProcessPattern = regexp.MustCompile(`Killed process (\d+) \(([^)]*)\)`)

// runtimeDiagnostics 记录 guest 运行时的异常事件，供 server 在会话中断时解释原因：
// node 运行时退出/重启（guestd 进程内计数）与内核 OOM 记录（读 /dev/kmsg，guestd 自身重启后仍可见）。
type runtimeDiagnostics struct {
	mutex         sync.Mutex
	startedAt     time.Time
	restarts      int
	lastExitAt    time.Time
	lastExitError string
	kmsgPath      string
	vmstatPath    string
	uptimePath    string
	now           func() time.Time
}

type runtimeExitReport struct {
	At    string `json:"at"`
	Error string `json:"error"`
}

type oomKillReport struct {
	PID     int    `json:"pid"`
	Command string `json:"command"`
	// 距开机的秒数；与 uptimeSeconds 相减即为距今多久
	SecondsSinceBoot float64 `json:"secondsSinceBoot"`
}

type runtimeDiagnosticsReport struct {
	GuestdStartedAt string             `json:"guestdStartedAt"`
	UptimeSeconds   float64            `json:"uptimeSeconds"`
	RuntimeRestarts int                `json:"runtimeRestarts"`
	LastRuntimeExit *runtimeExitReport `json:"lastRuntimeExit,omitempty"`
	OOMKillCount    int64              `json:"oomKillCount"`
	OOMKills        []oomKillReport    `json:"oomKills"`
}

func newRuntimeDiagnostics() *runtimeDiagnostics {
	return &runtimeDiagnostics{
		startedAt:  time.Now(),
		kmsgPath:   defaultKmsgPath,
		vmstatPath: defaultVmstatPath,
		uptimePath: defaultUptimePath,
		now:        time.Now,
	}
}

// recordRuntimeExit 记录 node 运行时一次非预期退出（随后由 supervisor 重启，内存中的会话随之丢失）。
func (diagnostics *runtimeDiagnostics) recordRuntimeExit(err error) {
	message := "exited"
	if err != nil {
		message = err.Error()
	}
	diagnostics.mutex.Lock()
	defer diagnostics.mutex.Unlock()
	diagnostics.restarts++
	diagnostics.lastExitAt = diagnostics.now()
	diagnostics.lastExitError = message
}

func (diagnostics *runtimeDiagnostics) report() runtimeDiagnosticsReport {
	diagnostics.mutex.Lock()
	report := runtimeDiagnosticsReport{
		GuestdStartedAt: diagnostics.startedAt.UTC().Format(time.RFC3339Nano),
		RuntimeRestarts: diagnostics.restarts,
	}
	if diagnostics.restarts > 0 {
		report.LastRuntimeExit = &runtimeExitReport{
			At:    diagnostics.lastExitAt.UTC().Format(time.RFC3339Nano),
			Error: diagnostics.lastExitError,
		}
	}
	kmsgPath, vmstatPath, uptimePath := diagnostics.kmsgPath, diagnostics.vmstatPath, diagnostics.uptimePath
	diagnostics.mutex.Unlock()

	report.UptimeSeconds = readUptimeSeconds(uptimePath)
	report.OOMKillCount = readVmstatCounter(vmstatPath, "oom_kill")
	report.OOMKills = readOOMKills(kmsgPath)
	return report
}

func (runtimeAPI *RuntimeAPI) diagnosticsReport(response http.ResponseWriter, _ *http.Request) {
	writeRuntimeJSON(response, http.StatusOK, runtimeAPI.diagnostics.report())
}

func readUptimeSeconds(path string) float64 {
	content, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(content))
	if len(fields) == 0 {
		return 0
	}
	value, _ := strconv.ParseFloat(fields[0], 64)
	return value
}

func readVmstatCounter(path, name string) int64 {
	content, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	scanner := bufio.NewScanner(bytes.NewReader(content))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 2 && fields[0] == name {
			value, _ := strconv.ParseInt(fields[1], 10, 64)
			return value
		}
	}
	return 0
}

// readOOMKills 非阻塞读取内核日志中的 OOM kill 记录（最近 maxReportedOOMKills 条）。
// /dev/kmsg 每次 read 返回一条记录，读尽时返回 EAGAIN；记录被覆盖时返回 EPIPE，继续读即可。
// 用裸 fd 读取：os.File 会把字符设备注册进 poller，EAGAIN 会被转换成阻塞等待。
func readOOMKills(path string) []oomKillReport {
	kills := make([]oomKillReport, 0)
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
	if err != nil {
		return kills
	}
	defer syscall.Close(fd)

	buffer := make([]byte, 8192)
	var pending []byte
	for range maxKmsgReads {
		count, err := syscall.Read(fd, buffer)
		if errors.Is(err, syscall.EPIPE) || errors.Is(err, syscall.EINTR) {
			continue
		}
		if err != nil || count <= 0 {
			break
		}
		pending = append(pending, buffer[:count]...)
		for {
			index := bytes.IndexByte(pending, '\n')
			if index < 0 {
				break
			}
			if kill, ok := parseOOMKillRecord(string(pending[:index])); ok {
				kills = append(kills, kill)
				if len(kills) > maxReportedOOMKills {
					kills = kills[1:]
				}
			}
			pending = pending[index+1:]
		}
	}
	return kills
}

// parseOOMKillRecord 解析一条 kmsg 记录：「<prio>,<seq>,<微秒时间戳>,<flags>;<消息>」。
func parseOOMKillRecord(record string) (oomKillReport, bool) {
	header, message, found := strings.Cut(record, ";")
	if !found {
		return oomKillReport{}, false
	}
	match := oomKilledProcessPattern.FindStringSubmatch(message)
	if match == nil {
		return oomKillReport{}, false
	}
	pid, err := strconv.Atoi(match[1])
	if err != nil {
		return oomKillReport{}, false
	}
	kill := oomKillReport{PID: pid, Command: match[2]}
	if fields := strings.Split(header, ","); len(fields) >= 3 {
		if microseconds, err := strconv.ParseInt(fields[2], 10, 64); err == nil {
			kill.SecondsSinceBoot = float64(microseconds) / 1e6
		}
	}
	return kill, true
}
