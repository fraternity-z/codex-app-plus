package main

import (
	"bytes"
	"encoding/base64"
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
	if got := len(toolDefinitions()); got != 13 {
		t.Fatalf("toolDefinitions() count = %d, want 13", got)
	}
}

func TestCrossPlatformToolAliases(t *testing.T) {
	for alias, canonical := range map[string]string{
		"list_mac_apps":                "list_apps",
		"get_state":                    "get_app_state",
		"perform_accessibility_action": "perform_secondary_action",
	} {
		if got := canonicalToolName(alias); got != canonical {
			t.Fatalf("canonicalToolName(%q) = %q, want %q", alias, got, canonical)
		}
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
	result, ok := items[0]["result"].(toolCallResult)
	if !ok {
		t.Fatalf("result type = %T", items[0]["result"])
	}
	if result.ErrorCode != "unsupported_tool" {
		t.Fatalf("errorCode = %q, want unsupported_tool", result.ErrorCode)
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

func TestLiteralStringArgumentsPreserveWhitespace(t *testing.T) {
	args := map[string]any{
		"app":   "  Notepad  ",
		"text":  "  leading and trailing text  \n",
		"value": "\t literal value \r\n",
	}

	if got := requiredString(args, "app"); got != "Notepad" {
		t.Fatalf("requiredString(app) = %q", got)
	}
	if got := requiredLiteralString(args, "text"); got != "  leading and trailing text  \n" {
		t.Fatalf("requiredLiteralString(text) = %q", got)
	}
	if got := requiredLiteralString(args, "value"); got != "\t literal value \r\n" {
		t.Fatalf("requiredLiteralString(value) = %q", got)
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

func TestErrorResultsIncludeMachineReadableCodes(t *testing.T) {
	for _, tc := range []struct {
		name string
		text string
		want string
	}{
		{
			name: "app not found",
			text: `appNotFound("notepad")`,
			want: "app_not_found",
		},
		{
			name: "missing state",
			text: "No app state is available for notepad. Run get_app_state before action tools.",
			want: "missing_app_state",
		},
		{
			name: "action blocked",
			text: "Computer Use blocked click for explorer (pid 42) because it may delete local or cloud data.",
			want: "action_blocked",
		},
		{
			name: "policy blocked",
			text: "Computer Use is denied for powershell (pid 42). Remove it from [apps].denied.",
			want: "app_policy_blocked",
		},
		{
			name: "desktop locked",
			text: "Computer Use blocked desktop access because the active input desktop is 'Winlogon', not 'Default'.",
			want: "desktop_locked",
		},
		{
			name: "unknown element",
			text: `unknown element_index "9"`,
			want: "unknown_element",
		},
		{
			name: "invalid args",
			text: "Missing required argument: app",
			want: "invalid_arguments",
		},
		{
			name: "runtime",
			text: "Windows runtime worker timed out after 30s",
			want: "windows_runtime_error",
		},
		{
			name: "activate",
			text: "Could not activate notepad. Windows may have refused the foreground change.",
			want: "windows_runtime_error",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := textResult(tc.text, true)
			if result.ErrorCode != tc.want {
				t.Fatalf("errorCode = %q, want %q", result.ErrorCode, tc.want)
			}
		})
	}

	if code := textResult("ok", false).ErrorCode; code != "" {
		t.Fatalf("successful result errorCode = %q, want empty", code)
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
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_RAW_TEXT_FALLBACK") {
		t.Fatal("Windows raw text fallback must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "Raw text fallback is disabled") {
		t.Fatal("Windows runtime must reject ambiguous raw text fallback by default")
	}
	if !strings.Contains(serverInstructions, "does not auto-launch apps, perform implicit SetFocus, use UIA text fallback, or use raw text fallback by default") {
		t.Fatal("MCP instructions must document the Windows background-focus policy")
	}
	if !strings.Contains(serverInstructions, "config.toml") {
		t.Fatal("MCP instructions must document the app access policy")
	}
	if !strings.Contains(serverInstructions, "Protected shells, disk-management tools") {
		t.Fatal("MCP instructions must document protected app blocking")
	}
	if !strings.Contains(serverInstructions, "reuses a PowerShell UI Automation worker") {
		t.Fatal("MCP instructions must document the persistent worker")
	}
}

func TestWindowsRuntimeBlocksNonDefaultDesktop(t *testing.T) {
	for _, snippet := range []string{
		"OpenInputDesktop",
		"GetUserObjectInformation",
		"Assert-InteractiveDesktop",
		"OPEN_COMPUTER_USE_WINDOWS_ALLOW_NON_DEFAULT_DESKTOP",
		"active input desktop is",
	} {
		if !strings.Contains(windowsRuntimeScript, snippet) {
			t.Fatalf("Windows runtime desktop guard missing snippet %q", snippet)
		}
	}
	if !strings.Contains(serverInstructions, "Windows is locked or a secure non-Default input desktop is active") {
		t.Fatal("MCP instructions must document locked/secure desktop blocking")
	}
	if !strings.Contains(serverInstructions, "desktop_locked") {
		t.Fatal("MCP instructions must document desktop_locked errorCode")
	}
}

func TestWindowsRuntimeSupportsActivateApp(t *testing.T) {
	for _, snippet := range []string{
		`"activate_app"`,
		"Activate-AppWindow",
		"ExplicitlyActivatedPids",
		"AttachThreadInput",
		"SetForegroundWindow",
		"Send-PasteShortcutFallback",
		"Send-PostedKey $hwnd $chord",
		"ShowWindow",
	} {
		if !strings.Contains(windowsRuntimeScript, snippet) {
			t.Fatalf("Windows runtime activate_app support missing snippet %q", snippet)
		}
	}
	if !strings.Contains(serverInstructions, "activate_app before modifier shortcuts") {
		t.Fatal("MCP instructions must document explicit activation before modifier shortcuts")
	}
}

func TestWindowsRuntimeSupportsWorkerMode(t *testing.T) {
	for _, snippet := range []string{
		"[switch]$Worker",
		"Invoke-ComputerUseOperation",
		"[Console]::In.ReadLine()",
		"[Console]::Out.WriteLine",
	} {
		if !strings.Contains(windowsRuntimeScript, snippet) {
			t.Fatalf("Windows runtime worker mode missing snippet %q", snippet)
		}
	}
}

func TestPowerShellRunnerReadOnlyFallbackClassification(t *testing.T) {
	for _, tool := range []string{"list_apps", "resolve_app", "get_app_state"} {
		if !isReadOnlyPowerShellTool(tool) {
			t.Fatalf("%s should be classified as safe for fallback retry", tool)
		}
	}
	for _, tool := range []string{"activate_app", "click", "type_text", "press_key", "set_value"} {
		if isReadOnlyPowerShellTool(tool) {
			t.Fatalf("%s must not be retried after worker write/read failures", tool)
		}
	}
}

func TestPowerShellToolTimeoutsGiveSnapshotsMoreTime(t *testing.T) {
	if got := powerShellToolTimeout("get_app_state"); got != powerShellSnapshotTimeout {
		t.Fatalf("get_app_state timeout = %s, want %s", got, powerShellSnapshotTimeout)
	}
	for _, tool := range []string{"activate_app", "click", "type_text", "press_key", "set_value", "list_apps", "resolve_app"} {
		if got := powerShellToolTimeout(tool); got != powerShellActionTimeout {
			t.Fatalf("%s timeout = %s, want %s", tool, got, powerShellActionTimeout)
		}
	}
	if got := formatDurationSeconds(powerShellSnapshotTimeout); got != "60s" {
		t.Fatalf("formatDurationSeconds(snapshot) = %q", got)
	}
}

func TestServiceCloseCleansRunnerTempDir(t *testing.T) {
	tempDir := t.TempDir()
	runnerTempDir := filepath.Join(tempDir, "worker")
	if err := os.Mkdir(runnerTempDir, 0o700); err != nil {
		t.Fatal(err)
	}
	svc := &service{runner: &powerShellRunner{tempDir: runnerTempDir}}

	svc.close()
	svc.close()

	if _, err := os.Stat(runnerTempDir); !os.IsNotExist(err) {
		t.Fatalf("service.close should remove runner temp dir, stat error = %v", err)
	}
	if svc.runner.tempDir != "" || svc.runner.cmd != nil || svc.runner.stdin != nil || svc.runner.stdout != nil {
		t.Fatalf("runner state was not reset after close: %#v", svc.runner)
	}
}

func TestCurrentSnapshotForRejectsRestartedAppPID(t *testing.T) {
	svc := &service{snapshots: map[string]*appSnapshot{}}
	snapshot := &appSnapshot{
		App: appDescriptor{Name: "notepad", BundleIdentifier: "notepad", PID: 100},
	}
	svc.rememberSnapshot("notepad", snapshot)

	restarted := &appDescriptor{Name: "notepad", BundleIdentifier: "notepad", PID: 200}
	if got := svc.currentSnapshotFor("notepad", restarted); got != nil {
		t.Fatalf("currentSnapshotFor returned stale snapshot for restarted app: %#v", got.App)
	}

	original := &appDescriptor{Name: "notepad", BundleIdentifier: "notepad", PID: 100}
	if got := svc.currentSnapshotFor("notepad", original); got != snapshot {
		t.Fatalf("currentSnapshotFor did not return matching PID snapshot: %#v", got)
	}
}

func TestValidateCoordinateBoundsRejectsOutsideScreenshot(t *testing.T) {
	snapshot := &appSnapshot{WindowBounds: &frame{Width: 100, Height: 80}}

	for _, point := range []coordinatePoint{
		{x: -1, y: 10},
		{x: 10, y: -1},
		{x: 100, y: 10},
		{x: 10, y: 80},
	} {
		if err := validateCoordinateBounds("click", snapshot, point); err == nil {
			t.Fatalf("validateCoordinateBounds(%#v) succeeded, want error", point)
		}
	}

	if err := validateCoordinateBounds("click", snapshot, coordinatePoint{x: 99, y: 79}); err != nil {
		t.Fatalf("validateCoordinateBounds rejected in-bounds coordinate: %v", err)
	}
}

func TestValidateCoordinateBoundsRequiresWindowBounds(t *testing.T) {
	if err := validateCoordinateBounds("drag", &appSnapshot{}, coordinatePoint{x: 1, y: 1}); err == nil {
		t.Fatal("validateCoordinateBounds succeeded without window bounds")
	}
}

func TestValidateElementClickTargetRejectsUnlocatableNonSemanticElement(t *testing.T) {
	record := &elementRecord{
		Index: 3,
		Name:  "Label without frame",
	}

	err := validateElementClickTarget(record)

	if err == nil || !strings.Contains(err.Error(), "requires a semantic click action or frame") {
		t.Fatalf("validateElementClickTarget error = %v", err)
	}
}

func TestValidateElementClickTargetAllowsSemanticOrFramedElement(t *testing.T) {
	if err := validateElementClickTarget(&elementRecord{Index: 1, Actions: []string{"Invoke"}}); err != nil {
		t.Fatalf("validateElementClickTarget rejected semantic element: %v", err)
	}
	if err := validateElementClickTarget(&elementRecord{Index: 2, Frame: &frame{Width: 10, Height: 10}}); err != nil {
		t.Fatalf("validateElementClickTarget rejected framed element: %v", err)
	}
}

func TestValidateElementScrollTargetRejectsUnlocatableNonScrollableElement(t *testing.T) {
	record := &elementRecord{
		Index: 4,
		Name:  "Static text without frame",
	}

	err := validateElementScrollTarget(record)

	if err == nil || !strings.Contains(err.Error(), "requires Scroll support or frame") {
		t.Fatalf("validateElementScrollTarget error = %v", err)
	}
}

func TestValidateElementScrollTargetAllowsScrollableOrFramedElement(t *testing.T) {
	if err := validateElementScrollTarget(&elementRecord{Index: 1, Actions: []string{"Scroll"}}); err != nil {
		t.Fatalf("validateElementScrollTarget rejected scrollable element: %v", err)
	}
	if err := validateElementScrollTarget(&elementRecord{Index: 2, Frame: &frame{Width: 10, Height: 10}}); err != nil {
		t.Fatalf("validateElementScrollTarget rejected framed element: %v", err)
	}
}

func TestSnapshotRenderedTextReportsSensitiveRedaction(t *testing.T) {
	snapshot := appSnapshot{
		App: appDescriptor{
			Name: "notepad",
			PID:  42,
		},
		WindowTitle:       "Notes",
		TreeLines:         []string{"\t0 edit Password Value: [redacted sensitive field]"},
		SensitiveRedacted: true,
	}

	result := snapshot.result()
	if len(result.Content) != 1 {
		t.Fatalf("sensitive snapshot should not include an image: %#v", result.Content)
	}
	if !strings.Contains(result.Content[0].Text, "Sensitive UI content was redacted") {
		t.Fatalf("rendered text missing redaction notice:\n%s", result.Content[0].Text)
	}
}

func TestWindowsRuntimeRedactsSensitiveSnapshotContent(t *testing.T) {
	for _, snippet := range []string{
		"Test-ElementIsPassword",
		"Redact-KnownSensitiveText",
		"Get-WindowTitleInfo",
		"sensitiveContentRedacted",
		"Get-SelectedTextInfo",
		"selectedTextInfo.containsSensitiveText",
		"glpat-",
		"whsec_",
		"eyJ[A-Za-z0-9_-]",
		"Test-PaymentCardNumberCandidate",
		"[redacted payment card]",
		"[redacted sensitive field]",
	} {
		if !strings.Contains(windowsRuntimeScript, snippet) {
			t.Fatalf("Windows runtime missing sensitive redaction snippet %q", snippet)
		}
	}
}

func TestPowerShellRedactsCommonSecretValues(t *testing.T) {
	for _, secret := range []string{
		"glpat-abcdefghijklmnopqrstuvwxyz123456",
		"npm_abcdefghijklmnopqrstuvwxyz123456",
		"hf_abcdefghijklmnopqrstuvwxyz123456",
		"AIzaabcdefghijklmnopqrstuvwxyz1234567890",
		"sk_live_abcdefghijklmnopqrstuvwxyz123456",
		"whsec_abcdefghijklmnopqrstuvwxyz123456",
		"xoxb-123456789012-abcdefghijklmnopqrstuvwxyz",
		"eyJabcdefghijklmnop.abcdefghijklmnop.abcdefghijklmnop",
		"4111 1111 1111 1111",
	} {
		t.Run(secret[:6], func(t *testing.T) {
			redacted := redactKnownSensitiveTextWithPowerShell(t, "value="+secret)
			if strings.Contains(redacted, secret) {
				t.Fatalf("secret was not redacted: %q", redacted)
			}
			if !strings.Contains(redacted, "[redacted") {
				t.Fatalf("redacted output missing marker: %q", redacted)
			}
		})
	}
}

func TestPowerShellKeepsNonLuhnCardShapedNumbers(t *testing.T) {
	value := "order 4111 1111 1111 1112"
	redacted := redactKnownSensitiveTextWithPowerShell(t, value)
	if redacted != value {
		t.Fatalf("non-Luhn card-shaped number should not be redacted: %q", redacted)
	}
}

func TestPowerShellKeepsNonCardTimestampThatPassesLuhn(t *testing.T) {
	value := "activate-paste-shortcut-test-1779705235340697000"
	redacted := redactKnownSensitiveTextWithPowerShell(t, value)
	if redacted != value {
		t.Fatalf("Luhn-valid timestamp with a non-card prefix should not be redacted: %q", redacted)
	}
}

func TestFilterAppListEntriesUsesPolicy(t *testing.T) {
	entries := []appListEntry{
		{App: appDescriptor{Name: "notepad", BundleIdentifier: "notepad", PID: 10}, WindowTitle: "Notes"},
		{App: appDescriptor{Name: "powershell", BundleIdentifier: "powershell", PID: 11}, WindowTitle: "Admin shell"},
	}
	policy := appAccessPolicy{
		allowed: map[string]struct{}{"notepad": {}},
		denied:  map[string]struct{}{"powershell": {}},
	}

	filtered := filterAppListEntries(entries, policy)
	if len(filtered) != 1 || filtered[0].App.Name != "notepad" {
		t.Fatalf("filtered entries = %#v", filtered)
	}
	rendered := renderAppList(filtered)
	if !strings.Contains(rendered, "Notes") {
		t.Fatalf("rendered list missing allowed app title: %s", rendered)
	}
	if strings.Contains(rendered, "Admin shell") {
		t.Fatalf("rendered list leaked denied app title: %s", rendered)
	}
}

func TestWindowsRuntimeResolvesAppsBeforeSnapshot(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, `elseif ($operation.tool -eq "resolve_app")`) {
		t.Fatal("Windows runtime must support resolve_app preflight")
	}
	if !strings.Contains(windowsRuntimeScript, "Resolve-App $operation.app $false") {
		t.Fatal("resolve_app preflight must not auto-launch apps before authorization")
	}
}

func TestWindowsRuntimeUsesLiteralWindowTitleMatching(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "Test-TitleContainsLiteral") {
		t.Fatal("Windows runtime must route partial title matching through a literal helper")
	}
	if !strings.Contains(windowsRuntimeScript, "IndexOf($query, [StringComparison]::OrdinalIgnoreCase)") {
		t.Fatal("Windows runtime must use literal OrdinalIgnoreCase title matching")
	}
	if strings.Contains(windowsRuntimeScript, "-ilike \"*$normalized*\"") {
		t.Fatal("Windows runtime must not use PowerShell wildcard matching for app window titles")
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
		if !strings.Contains(tool.Description, "global shortcuts") {
			t.Fatalf("press_key description must document blocked Windows global shortcuts:\n%s", tool.Description)
		}
		if strings.Contains(tool.Description, `"super+c"`) {
			t.Fatalf("press_key description should not advertise blocked Windows-key shortcuts:\n%s", tool.Description)
		}
		return
	}
	t.Fatal("press_key tool definition not found")
}

func TestActivateAppToolDefinitionDocumentsForegroundBehavior(t *testing.T) {
	for _, tool := range toolDefinitions() {
		if tool.Name != "activate_app" {
			continue
		}
		if !strings.Contains(tool.Description, "foreground") {
			t.Fatalf("activate_app description must document foreground behavior:\n%s", tool.Description)
		}
		if _, ok := tool.InputSchema["required"]; !ok {
			t.Fatalf("activate_app schema must require app: %#v", tool.InputSchema)
		}
		return
	}
	t.Fatal("activate_app tool definition not found")
}

func TestTypeTextToolDefinitionSupportsTargetElement(t *testing.T) {
	for _, tool := range toolDefinitions() {
		if tool.Name != "type_text" {
			continue
		}
		properties, ok := tool.InputSchema["properties"].(map[string]any)
		if !ok {
			t.Fatalf("type_text schema missing properties: %#v", tool.InputSchema)
		}
		if _, ok := properties["element_index"]; !ok {
			t.Fatalf("type_text schema must expose optional element_index: %#v", properties)
		}
		return
	}
	t.Fatal("type_text tool definition not found")
}

func TestWindowsRuntimeSupportsTargetedTypeText(t *testing.T) {
	for _, snippet := range []string{
		"Invoke-TypeText $process $operation.text $element",
		"Target element is not a writable text entry",
		"Test-TextWindowHandleCandidate $process $element",
	} {
		if !strings.Contains(windowsRuntimeScript, snippet) {
			t.Fatalf("Windows runtime targeted type_text support missing snippet %q", snippet)
		}
	}
}

func TestWindowsRuntimeRejectsUnlocatableElementClickFallback(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "Target element has no semantic click action or frame") {
		t.Fatal("Windows runtime must reject element clicks without UIA action or frame instead of falling back to null coordinates")
	}
}

func TestWindowsRuntimeRejectsUnlocatableElementScrollFallback(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "Target element has no Scroll support or frame") {
		t.Fatal("Windows runtime must reject element scroll without UIA scroll support or frame instead of falling back to null coordinates")
	}
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

func TestActivateAppThenCtrlVPastesIntoNotepad(t *testing.T) {
	requireWindowsDesktopIntegration(t)

	pasteText := "activate-paste-shortcut-test-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	setClipboard(t, pasteText)

	cmd := startNotepadForIntegration(t)
	app := strconv.Itoa(cmd.Process.Pid)
	waitForRuntimeApp(t, app, 10*time.Second)

	service := newService()
	t.Cleanup(service.close)
	result := service.getAppState(app)
	if result.IsError {
		t.Fatalf("get_app_state failed: %s", result.Content[0].Text)
	}
	result = service.activateApp(app)
	if result.IsError {
		t.Fatalf("activate_app failed: %s", result.Content[0].Text)
	}
	result = service.pressKey(app, "ctrl+v")
	if result.IsError {
		t.Fatalf("press_key failed: %s", result.Content[0].Text)
	}
	if strings.Contains(result.Content[0].Text, pasteText) {
		return
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		result = service.getAppState(app)
		if !result.IsError && strings.Contains(result.Content[0].Text, pasteText) {
			return
		}
		time.Sleep(150 * time.Millisecond)
	}
	t.Fatalf("Notepad snapshot did not contain pasted text after activate_app %q:\n%s", pasteText, result.Content[0].Text)
}

func TestTypeTextIntoNotepad(t *testing.T) {
	requireWindowsDesktopIntegration(t)

	cmd := startNotepadForIntegration(t)
	app := strconv.Itoa(cmd.Process.Pid)
	waitForRuntimeApp(t, app, 10*time.Second)

	text := "type-text-test-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	service := newService()
	t.Cleanup(service.close)
	result := service.getAppState(app)
	if result.IsError {
		t.Fatalf("get_app_state failed: %s", result.Content[0].Text)
	}

	result = service.typeText(app, "", text)
	if result.IsError {
		t.Fatalf("type_text failed: %s", result.Content[0].Text)
	}
	rendered := result.Content[0].Text
	if !strings.Contains(rendered, text) {
		t.Fatalf("Notepad snapshot did not contain typed text %q:\n%s", text, rendered)
	}
	snapshot := service.currentSnapshotFor(app, &appDescriptor{Name: "notepad", PID: cmd.Process.Pid})
	if snapshot == nil {
		t.Fatal("service did not remember Notepad snapshot after type_text")
	}
	if snapshot.SensitiveRedacted {
		t.Fatalf("normal Notepad text should not be marked sensitive:\n%s", snapshot.renderedText())
	}
	if snapshot.ScreenshotPNGBase64 == "" {
		t.Fatal("normal Notepad snapshot should include a screenshot")
	}
}

func TestTypeTextPreservesLiteralWhitespaceIntoNotepad(t *testing.T) {
	requireWindowsDesktopIntegration(t)

	cmd := startNotepadForIntegration(t)
	app := strconv.Itoa(cmd.Process.Pid)
	waitForRuntimeApp(t, app, 10*time.Second)

	text := "  literal-whitespace-test-" + strconv.FormatInt(time.Now().UnixNano(), 10) + "  "
	service := newService()
	t.Cleanup(service.close)
	result := service.getAppState(app)
	if result.IsError {
		t.Fatalf("get_app_state failed: %s", result.Content[0].Text)
	}

	result = service.callTool("type_text", map[string]any{"app": app, "text": text})
	if result.IsError {
		t.Fatalf("type_text failed: %s", result.Content[0].Text)
	}
	if !strings.Contains(result.Content[0].Text, strings.TrimSpace(text)) {
		t.Fatalf("Notepad snapshot did not contain typed text %q:\n%s", text, result.Content[0].Text)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if got := getNotepadDocumentText(t, cmd.Process.Pid); strings.Contains(got, text) {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("Notepad document text did not preserve literal whitespace; got %q, want substring %q", getNotepadDocumentText(t, cmd.Process.Pid), text)
}

func TestKnownSecretTextSnapshotOmitsScreenshot(t *testing.T) {
	requireWindowsDesktopIntegration(t)

	secret := "sk-test_abcdefghijklmnopqrstuvwxyz123456"
	path := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(path, []byte("visible secret "+secret), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := startNotepadForIntegration(t, path)
	app := strconv.Itoa(cmd.Process.Pid)
	waitForRuntimeApp(t, app, 10*time.Second)

	response, err := runPowerShell(psRequest{Tool: "get_app_state", App: app})
	if err != nil {
		t.Fatal(err)
	}
	if !response.OK {
		t.Fatal(response.Error)
	}
	if response.Snapshot == nil {
		t.Fatal("missing Notepad snapshot")
	}
	rendered := response.Snapshot.renderedText()
	if strings.Contains(rendered, secret) {
		t.Fatalf("snapshot leaked secret text:\n%s", rendered)
	}
	if !strings.Contains(rendered, "[redacted secret]") {
		t.Fatalf("snapshot did not show redacted secret marker:\n%s", rendered)
	}
	if !response.Snapshot.SensitiveRedacted {
		t.Fatalf("secret-looking text should mark snapshot sensitive:\n%s", rendered)
	}
	if response.Snapshot.ScreenshotPNGBase64 != "" {
		t.Fatal("secret-looking text snapshot should omit screenshot")
	}
}

func TestKnownSecretWindowTitleIsRedacted(t *testing.T) {
	requireWindowsDesktopIntegration(t)

	secret := "sk-test_abcdefghijklmnopqrstuvwxyz123456"
	path := filepath.Join(t.TempDir(), "title-"+secret+".txt")
	if err := os.WriteFile(path, []byte("ordinary window content"), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := startNotepadForIntegration(t, path)
	app := strconv.Itoa(cmd.Process.Pid)
	waitForRuntimeApp(t, app, 10*time.Second)

	response, err := runPowerShell(psRequest{Tool: "get_app_state", App: app})
	if err != nil {
		t.Fatal(err)
	}
	if !response.OK {
		t.Fatal(response.Error)
	}
	if response.Snapshot == nil {
		t.Fatal("missing Notepad snapshot")
	}
	rendered := response.Snapshot.renderedText()
	if strings.Contains(rendered, secret) || strings.Contains(response.Snapshot.WindowTitle, secret) {
		t.Fatalf("snapshot leaked secret window title:\n%s", rendered)
	}
	if !strings.Contains(rendered, "[redacted secret]") || !strings.Contains(response.Snapshot.WindowTitle, "[redacted secret]") {
		t.Fatalf("snapshot did not redact secret window title:\n%s", rendered)
	}
	if !response.Snapshot.SensitiveRedacted {
		t.Fatalf("secret-looking window title should mark snapshot sensitive:\n%s", rendered)
	}
	if response.Snapshot.ScreenshotPNGBase64 != "" {
		t.Fatal("secret-looking window title snapshot should omit screenshot")
	}
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

func redactKnownSensitiveTextWithPowerShell(t *testing.T, value string) string {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell runtime redaction test")
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
[Console]::Out.Write((Redact-KnownSensitiveText ` + powerShellSingleQuoted(value) + `))
`
	path := filepath.Join(t.TempDir(), "redact-test.ps1")
	if err := os.WriteFile(path, []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}

	output, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path, "unused").CombinedOutput()
	if err != nil {
		t.Fatalf("PowerShell redaction failed: %v\n%s", err, string(output))
	}
	return string(output)
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

func getClipboard(t *testing.T) string {
	t.Helper()
	script := "$value = Get-Clipboard -Raw; if ($null -eq $value) { $value = '' }; [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$value)))"
	output, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script).CombinedOutput()
	if err != nil {
		t.Fatalf("failed to get clipboard: %v\n%s", err, string(output))
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(output)))
	if err != nil {
		t.Fatalf("failed to decode clipboard output %q: %v", string(output), err)
	}
	return string(decoded)
}

func getNotepadDocumentText(t *testing.T, pid int) string {
	t.Helper()
	script := `
param([int]$ProcessId)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class OCUWin32Test {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, StringBuilder lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);
}
"@
$WM_GETTEXT = 0x000D
$WM_GETTEXTLENGTH = 0x000E
$process = Get-Process -Id $ProcessId
$texts = New-Object System.Collections.Generic.List[string]
$handles = New-Object System.Collections.Generic.List[IntPtr]
$handles.Add([IntPtr]$process.MainWindowHandle)
$callback = [OCUWin32Test+EnumWindowsProc]{
    param([IntPtr]$hwnd, [IntPtr]$lParam)
    $handles.Add($hwnd)
    return $true
}
[void][OCUWin32Test]::EnumChildWindows([IntPtr]$process.MainWindowHandle, $callback, [IntPtr]::Zero)
foreach ($handle in $handles) {
    try {
        $length = [int][OCUWin32Test]::SendMessage($handle, $WM_GETTEXTLENGTH, [IntPtr]::Zero, [IntPtr]::Zero)
        if ($length -gt 0) {
            $builder = New-Object System.Text.StringBuilder ($length + 1)
            [void][OCUWin32Test]::SendMessage($handle, $WM_GETTEXT, [IntPtr]($builder.Capacity), $builder)
            $text = $builder.ToString()
            if (-not [string]::IsNullOrEmpty($text)) {
                $texts.Add($text)
            }
        }
    } catch {
    }
}
$root = [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$process.MainWindowHandle)
$items = New-Object System.Collections.Generic.List[object]
$items.Add($root)
$descendants = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
for ($i = 0; $i -lt $descendants.Count; $i++) {
    $items.Add($descendants.Item($i))
}
foreach ($item in $items) {
    try {
        $textPattern = $item.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern)
        $text = $textPattern.DocumentRange.GetText(-1)
        if (-not [string]::IsNullOrEmpty($text)) {
            $texts.Add($text)
        }
    } catch {
    }
    try {
        $valuePattern = $item.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
        $value = $valuePattern.Current.Value
        if (-not [string]::IsNullOrEmpty($value)) {
            $texts.Add($value)
        }
    } catch {
    }
}
[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($texts -join [Environment]::NewLine))))
`
	path := filepath.Join(t.TempDir(), "read-notepad-text.ps1")
	if err := os.WriteFile(path, []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path, strconv.Itoa(pid)).CombinedOutput()
	if err != nil {
		t.Fatalf("failed to read Notepad document text: %v\n%s", err, string(output))
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(output)))
	if err != nil {
		t.Fatalf("failed to decode Notepad document text output %q: %v", string(output), err)
	}
	return string(decoded)
}

func requireWindowsDesktopIntegration(t *testing.T) {
	t.Helper()
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
}

func startNotepadForIntegration(t *testing.T, args ...string) *exec.Cmd {
	t.Helper()
	cmd := exec.Command("notepad.exe", args...)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	})
	return cmd
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
