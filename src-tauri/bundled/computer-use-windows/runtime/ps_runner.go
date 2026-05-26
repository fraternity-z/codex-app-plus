package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const powerShellWorkerDisableEnv = "OPEN_COMPUTER_USE_WINDOWS_DISABLE_WORKER"

const (
	powerShellActionTimeout   = 30 * time.Second
	powerShellSnapshotTimeout = 60 * time.Second
)

type powerShellRunner struct {
	mu       sync.Mutex
	tempDir  string
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stdout   *bufio.Reader
	disabled bool
}

func newPowerShellRunner() *powerShellRunner {
	return &powerShellRunner{disabled: envFlagEnabled(powerShellWorkerDisableEnv)}
}

func (r *powerShellRunner) close() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopLocked()
}

func (r *powerShellRunner) run(request psRequest) (*psResponse, error) {
	if r.disabled || runtime.GOOS != "windows" {
		return runPowerShellOnce(request)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if err := r.ensureStarted(); err != nil {
		r.stopLocked()
		return runPowerShellOnce(request)
	}

	response, err := r.callLocked(request)
	if err == nil {
		return response, nil
	}

	r.stopLocked()
	if isReadOnlyPowerShellTool(request.Tool) {
		return runPowerShellOnce(request)
	}
	return nil, err
}

func (r *powerShellRunner) ensureStarted() error {
	if r.cmd != nil && r.stdin != nil && r.stdout != nil {
		return nil
	}
	if runtime.GOOS != "windows" {
		return errors.New("Windows Computer Use runtime requires powershell.exe on Windows")
	}

	tempDir, err := os.MkdirTemp("", "open-computer-use-windows-worker-*")
	if err != nil {
		return err
	}
	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		_ = os.RemoveAll(tempDir)
		return err
	}

	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Worker")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		_ = os.RemoveAll(tempDir)
		return err
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		_ = os.RemoveAll(tempDir)
		return err
	}
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = os.RemoveAll(tempDir)
		return err
	}

	r.tempDir = tempDir
	r.cmd = cmd
	r.stdin = stdin
	r.stdout = bufio.NewReader(stdoutPipe)
	return nil
}

func (r *powerShellRunner) callLocked(request psRequest) (*psResponse, error) {
	operationData, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	if _, err := r.stdin.Write(append(operationData, '\n')); err != nil {
		return nil, fmt.Errorf("Windows runtime worker write failed: %w", err)
	}

	timeout := powerShellToolTimeout(request.Tool)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	type readResult struct {
		line string
		err  error
	}
	resultCh := make(chan readResult, 1)
	go func() {
		line, err := r.stdout.ReadString('\n')
		resultCh <- readResult{line: line, err: err}
	}()

	var line string
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("Windows runtime worker timed out after %s", formatDurationSeconds(timeout))
	case result := <-resultCh:
		if result.err != nil {
			return nil, fmt.Errorf("Windows runtime worker read failed: %w", result.err)
		}
		line = strings.TrimSpace(result.line)
	}

	var response psResponse
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return nil, fmt.Errorf("Windows runtime worker returned invalid JSON: %w: %s", err, line)
	}
	return &response, nil
}

func (r *powerShellRunner) stopLocked() {
	if r.stdin != nil {
		_ = r.stdin.Close()
	}
	if r.cmd != nil && r.cmd.Process != nil {
		_ = r.cmd.Process.Kill()
		_, _ = r.cmd.Process.Wait()
	}
	if r.tempDir != "" {
		_ = os.RemoveAll(r.tempDir)
	}
	r.tempDir = ""
	r.cmd = nil
	r.stdin = nil
	r.stdout = nil
}

func isReadOnlyPowerShellTool(tool string) bool {
	switch tool {
	case "list_apps", "resolve_app", "get_app_state":
		return true
	default:
		return false
	}
}

func powerShellToolTimeout(tool string) time.Duration {
	if tool == "get_app_state" {
		return powerShellSnapshotTimeout
	}
	return powerShellActionTimeout
}

func formatDurationSeconds(duration time.Duration) string {
	seconds := int(duration / time.Second)
	return fmt.Sprintf("%ds", seconds)
}
