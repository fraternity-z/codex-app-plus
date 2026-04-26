package main

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestToolDefinitionCount(t *testing.T) {
	if got := len(toolDefinitions()); got != 9 {
		t.Fatalf("toolDefinitions() count = %d, want 9", got)
	}
}

func TestCallSequenceStopsAfterFirstToolError(t *testing.T) {
	output, hasError, err := runCallCommand([]string{
		"--calls",
		`[{"tool":"not_a_tool"},{"tool":"list_apps"}]`,
	}, newService())
	if err != nil {
		t.Fatal(err)
	}
	if !hasError {
		t.Fatal("expected hasError")
	}
	items, ok := output.([]map[string]any)
	if !ok {
		t.Fatalf("output type = %T", output)
	}
	if len(items) != 1 {
		t.Fatalf("sequence output count = %d, want 1", len(items))
	}
}

func TestReadArgumentsAcceptsJSONObject(t *testing.T) {
	args, err := readArguments(`{"app":"Notepad","pages":2}`, "")
	if err != nil {
		t.Fatal(err)
	}
	if args["app"] != "Notepad" {
		t.Fatalf("app = %v", args["app"])
	}
	if args["pages"].(json.Number).String() != "2" {
		t.Fatalf("pages = %v", args["pages"])
	}
}

func TestMCPInitializeResponseContainsToolsCapability(t *testing.T) {
	request := map[string]any{
		"jsonrpc": "2.0",
		"id":      float64(1),
		"method":  "initialize",
		"params":  map[string]any{},
	}
	response := handleMCPRequest(request, newService())
	result, ok := response["result"].(map[string]any)
	if !ok {
		t.Fatalf("missing result: %#v", response)
	}
	capabilities := result["capabilities"].(map[string]any)
	if _, ok := capabilities["tools"]; !ok {
		t.Fatalf("missing tools capability: %#v", capabilities)
	}
}

func TestCLIHelpMentionsWindowsRuntime(t *testing.T) {
	var out bytes.Buffer
	if err := runCLI([]string{"--help"}, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Open Computer Use for Windows") {
		t.Fatalf("help text did not mention Windows runtime:\n%s", out.String())
	}
}

func TestWindowsRuntimeForegroundActionsRequireOptIn(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH") {
		t.Fatal("Windows app launch fallback must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS") {
		t.Fatal("Windows SetFocus action must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK") {
		t.Fatal("Windows UIA text fallback must remain opt-in")
	}
	if !strings.Contains(serverInstructions, "does not auto-launch apps, perform SetFocus, or use UIA text fallback by default") {
		t.Fatal("MCP instructions must document the Windows background-focus policy")
	}
}

func TestWindowsRuntimeModifierShortcutsUseForegroundInput(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "SendKeyboardChord") {
		t.Fatal("modifier shortcuts must use SendInput instead of posted window messages")
	}
	if !strings.Contains(windowsRuntimeScript, "Modifier key combinations require the target app to be foreground") {
		t.Fatal("modifier shortcuts must fail clearly instead of posting the bare key in the background")
	}
}

func TestWindowsRuntimeModifierAliasesIncludeXdotoolLeftRightNames(t *testing.T) {
	for _, alias := range []string{
		`"ctrl_l"`,
		`"ctrl_r"`,
		`"control_l"`,
		`"control_r"`,
		`"shift_l"`,
		`"shift_r"`,
		`"alt_l"`,
		`"alt_r"`,
		`"super_l"`,
		`"super_r"`,
		`"win_l"`,
		`"win_r"`,
	} {
		if !strings.Contains(windowsRuntimeScript, alias) {
			t.Fatalf("Windows runtime key parser must support xdotool modifier alias %s", alias)
		}
	}
}

func TestWindowsRuntimeKeyChordParsesCtrlShortcutAliases(t *testing.T) {
	for _, tc := range []struct {
		key           string
		wantModifier  int
		wantMain      int
		wantMainLabel string
	}{
		{key: "ctrl+v", wantModifier: 0x11, wantMain: 0x56, wantMainLabel: "V"},
		{key: "Control_L+v", wantModifier: 0x11, wantMain: 0x56, wantMainLabel: "V"},
	} {
		t.Run(tc.key, func(t *testing.T) {
			chord := parseKeyChordWithPowerShell(t, tc.key)
			if len(chord.modifiers) != 1 || chord.modifiers[0] != tc.wantModifier {
				t.Fatalf("modifiers for %q = %#v, want Ctrl", tc.key, chord.modifiers)
			}
			if chord.main != tc.wantMain {
				t.Fatalf("main key for %q = %#x, want %s", tc.key, chord.main, tc.wantMainLabel)
			}
		})
	}
}

func TestPressKeyDescriptionDocumentsModifierShortcutBehavior(t *testing.T) {
	for _, tool := range toolDefinitions() {
		if tool.Name != "press_key" {
			continue
		}
		if !strings.Contains(tool.Description, "Modifier combinations") {
			t.Fatalf("press_key description must document modifier behavior:\n%s", tool.Description)
		}
		if !strings.Contains(tool.Description, `"ctrl+v"`) {
			t.Fatalf("press_key description must include a ctrl shortcut example:\n%s", tool.Description)
		}
		if !strings.Contains(tool.Description, `"Control_L+v"`) {
			t.Fatalf("press_key description must include an xdotool left-control shortcut example:\n%s", tool.Description)
		}
		return
	}
	t.Fatal("press_key tool definition not found")
}

func TestPressKeyCtrlVPastesIntoNotepad(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows-only integration test")
	}
	if os.Getenv("OPEN_COMPUTER_USE_WINDOWS_RUN_INTEGRATION_TESTS") != "1" {
		t.Skip("set OPEN_COMPUTER_USE_WINDOWS_RUN_INTEGRATION_TESTS=1 to run the desktop integration test")
	}
	if _, err := exec.LookPath("notepad.exe"); err != nil {
		t.Skip("notepad.exe is not available")
	}
	if _, err := exec.LookPath("powershell.exe"); err != nil {
		t.Skip("powershell.exe is not available")
	}

	const pasteText = "paste-shortcut-test"
	setClipboard(t, pasteText)

	cmd := exec.Command("notepad.exe")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	}()

	app := strconv.Itoa(cmd.Process.Pid)
	waitForRuntimeApp(t, app, 10*time.Second)
	t.Setenv("OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS", "1")

	response, err := runPowerShell(psRequest{Tool: "press_key", App: app, Key: "ctrl+v"})
	if err != nil {
		t.Fatal(err)
	}
	if !response.OK {
		t.Fatal(response.Error)
	}
	if response.Snapshot != nil && snapshotContainsText(response.Snapshot, pasteText) {
		return
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		response, err = runPowerShell(psRequest{Tool: "get_app_state", App: app})
		if err == nil && response.OK && snapshotContainsText(response.Snapshot, pasteText) {
			return
		}
		time.Sleep(150 * time.Millisecond)
	}
	if response != nil && response.Snapshot != nil {
		t.Fatalf("Notepad snapshot did not contain pasted text %q:\n%s", pasteText, response.Snapshot.renderedText())
	}
	t.Fatalf("Notepad snapshot did not contain pasted text %q", pasteText)
}

type parsedKeyChord struct {
	modifiers []int
	main      int
}

func parseKeyChordWithPowerShell(t *testing.T, key string) parsedKeyChord {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell runtime parsing test")
	}
	if _, err := exec.LookPath("powershell.exe"); err != nil {
		t.Skip("powershell.exe is not available")
	}

	marker := "$operation = Get-Content"
	index := strings.Index(windowsRuntimeScript, marker)
	if index < 0 {
		t.Fatalf("could not find runtime operation marker %q", marker)
	}

	script := windowsRuntimeScript[:index] + `
$chord = ConvertTo-KeyChord ` + powerShellSingleQuoted(key) + `
(@($chord.modifiers | ForEach-Object { [int]$_ }) -join ',') + '|' + [string][int]$chord.main
`
	path := filepath.Join(t.TempDir(), "key-chord-test.ps1")
	if err := os.WriteFile(path, []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}

	output, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path, "unused").CombinedOutput()
	if err != nil {
		t.Fatalf("PowerShell key chord parse failed: %v\n%s", err, string(output))
	}

	fields := strings.Split(strings.TrimSpace(string(output)), "|")
	if len(fields) != 2 {
		t.Fatalf("unexpected key chord parse output %q", string(output))
	}

	chord := parsedKeyChord{}
	if fields[0] != "" {
		for _, part := range strings.Split(fields[0], ",") {
			modifier, err := strconv.Atoi(strings.TrimSpace(part))
			if err != nil {
				t.Fatalf("invalid modifier %q in output %q", part, string(output))
			}
			chord.modifiers = append(chord.modifiers, modifier)
		}
	}
	main, err := strconv.Atoi(strings.TrimSpace(fields[1]))
	if err != nil {
		t.Fatalf("invalid main key in output %q", string(output))
	}
	chord.main = main
	return chord
}

func powerShellSingleQuoted(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func setClipboard(t *testing.T, value string) {
	t.Helper()
	output, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value "+powerShellSingleQuoted(value)).CombinedOutput()
	if err != nil {
		t.Fatalf("failed to set clipboard: %v\n%s", err, string(output))
	}
}

func waitForRuntimeApp(t *testing.T, app string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var lastError string
	for time.Now().Before(deadline) {
		response, err := runPowerShell(psRequest{Tool: "get_app_state", App: app})
		if err == nil && response.OK {
			return
		}
		if err != nil {
			lastError = err.Error()
		} else {
			lastError = response.Error
		}
		time.Sleep(150 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for app %s to become visible: %s", app, lastError)
}

func snapshotContainsText(snapshot *appSnapshot, text string) bool {
	if snapshot == nil {
		return false
	}
	if strings.Contains(snapshot.renderedText(), text) {
		return true
	}
	for _, element := range snapshot.Elements {
		if strings.Contains(element.Name, text) || strings.Contains(element.Value, text) {
			return true
		}
	}
	return false
}
