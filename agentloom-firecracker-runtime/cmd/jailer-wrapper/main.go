package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

func main() {
	if err := armParentDeathSignal(); err != nil {
		log.Fatalf("arm parent death signal: %v", err)
	}
	arguments := os.Args[1:]
	executable, parentCgroup, sessionID := "", "", ""
	cgroupValues := make(map[string]string)
	filtered := make([]string, 0, len(arguments))
	for index := 0; index < len(arguments); index++ {
		argument := arguments[index]
		if index+1 < len(arguments) && argument == "--exec-file" {
			executable = arguments[index+1]
		}
		if index+1 < len(arguments) && argument == "--id" {
			sessionID = arguments[index+1]
		}
		if index+1 < len(arguments) && argument == "--parent-cgroup" {
			parentCgroup = arguments[index+1]
			index++
			continue
		}
		if index+1 < len(arguments) && argument == "--cgroup-version" {
			index++
			continue
		}
		if index+1 < len(arguments) && argument == "--cgroup" {
			parts := strings.SplitN(arguments[index+1], "=", 2)
			if len(parts) != 2 || parts[0] == "" {
				log.Fatalf("invalid cgroup argument %q", arguments[index+1])
			}
			cgroupValues[parts[0]] = parts[1]
			index++
			continue
		}
		filtered = append(filtered, argument)
	}
	if executable == "" {
		log.Fatal("jailer wrapper requires --exec-file")
	}
	if sessionID == "" || filepath.Base(sessionID) != sessionID || strings.Contains(sessionID, "..") {
		log.Fatalf("invalid jailer id %q", sessionID)
	}
	cgroupDirectory, err := prepareCgroup(parentCgroup, cgroupValues)
	if err != nil {
		log.Fatalf("prepare cgroup: %v", err)
	}
	jailer := filepath.Join(filepath.Dir(executable), "jailer")
	command := exec.Command(jailer, filtered...)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.Env = os.Environ()
	command.SysProcAttr = &syscall.SysProcAttr{
		Cloneflags: syscall.CLONE_NEWPID,
		Pdeathsig:  syscall.SIGKILL,
	}
	if err := command.Start(); err != nil {
		log.Fatalf("start jailer: %v", err)
	}
	if err := moveProcessToCgroup(cgroupDirectory, command.Process.Pid); err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		log.Fatalf("move jailer to cgroup: %v", err)
	}
	pidPath, err := writePIDFile(sessionID, command.Process.Pid)
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		log.Fatalf("write jailer pidfile: %v", err)
	}
	err = command.Wait()
	_ = os.Remove(pidPath)
	if err != nil {
		log.Fatalf("wait for jailer: %v", err)
	}
}

func armParentDeathSignal() error {
	parent := os.Getppid()
	if err := unix.Prctl(unix.PR_SET_PDEATHSIG, uintptr(syscall.SIGKILL), 0, 0, 0); err != nil {
		return err
	}
	if os.Getppid() != parent {
		return errors.New("runtime manager exited while arming parent death signal")
	}
	return nil
}

func writePIDFile(sessionID string, pid int) (string, error) {
	root := os.Getenv("FIRECRACKER_PID_ROOT")
	if root == "" {
		root = "/run/firecracker-pids"
	}
	if !filepath.IsAbs(root) {
		return "", fmt.Errorf("PID root must be absolute")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(root, sessionID+".pid")
	temporary := path + "." + strconv.Itoa(os.Getpid()) + ".tmp"
	if err := os.WriteFile(temporary, []byte(strconv.Itoa(pid)), 0o600); err != nil {
		return "", err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return "", err
	}
	return path, nil
}

func prepareCgroup(parent string, values map[string]string) (string, error) {
	clean := filepath.Clean(parent)
	if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("invalid parent cgroup %q", parent)
	}
	directory := filepath.Join("/sys/fs/cgroup", clean)
	parentDirectory := filepath.Dir(directory)
	if err := os.MkdirAll(parentDirectory, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(
		filepath.Join(parentDirectory, "cgroup.subtree_control"),
		[]byte("+cpu +memory +pids"),
		0o644,
	); err != nil {
		return "", err
	}
	if err := os.Mkdir(directory, 0o755); err != nil && !os.IsExist(err) {
		return "", err
	}
	for name, value := range values {
		if strings.Contains(name, "/") || strings.Contains(name, "..") {
			return "", fmt.Errorf("invalid cgroup property %q", name)
		}
		if err := os.WriteFile(filepath.Join(directory, name), []byte(value), 0o644); err != nil {
			return "", err
		}
	}
	return directory, nil
}

func moveProcessToCgroup(directory string, pid int) error {
	log.Printf("moving jailer pid=%d into %s", pid, directory)
	return os.WriteFile(
		filepath.Join(directory, "cgroup.procs"),
		[]byte(strconv.Itoa(pid)),
		0o644,
	)
}
