package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

var version = "0.1.44"

//go:embed runtime.ps1
var windowsRuntimeScript string

const (
	maxAppQueryRunes = 120
	maxTextRunes     = 20_000
	maxScrollPages   = 50
	maxClickCount    = 10
)

const serverInstructions = "Computer Use tools let you interact with Windows apps by performing UI actions.\n\nBegin by calling `get_app_state` every turn you want to use Computer Use to get the latest state before acting. The available tools are list_apps, get_app_state, activate_app, click, perform_secondary_action, scroll, drag, type_text, press_key, and set_value. Cross-platform aliases list_mac_apps, get_state, and perform_accessibility_action are also accepted.\n\nPrefer element-targeted interactions over coordinate clicks when an index for the targeted element is available. Windows actions use UI Automation patterns first and fall back to window messages when an app does not expose the needed pattern. The MCP server reuses a PowerShell UI Automation worker so repeated calls avoid reloading UIA assemblies each time. Modifier keyboard shortcuts are delivered through foreground keyboard input so Ctrl/Alt/Shift state is preserved; use activate_app before modifier shortcuts when the target app is not foreground. After activate_app, the worker may re-activate the same app for subsequent modifier shortcuts in that session. The Windows runtime does not auto-launch apps, perform implicit SetFocus, use UIA text fallback, or use raw text fallback by default, so background-capable actions do not intentionally steal the user's foreground focus or type into an ambiguous window. App access is filtered by CODEX_HOME/computer-use/config.toml; denied apps are always blocked, a non-empty allowed list restricts access, and require_approvals blocks unlisted apps when no allowlist is configured. Protected shells, disk-management tools, registry consoles, credential prompts, and password managers are blocked before app policy checks. The runtime also refuses to inspect or control the desktop while Windows is locked or a secure non-Default input desktop is active. Password fields, window titles, and known secret-looking UI text are redacted from snapshots, and screenshots are omitted when sensitive controls or known secret text are present. Action guards block risky clicks, coordinate actions, text entry, and confirmation keys when the current UI appears to delete data, format storage, expose credentials, submit data, or create financial side effects. Error results include a machine-readable errorCode such as app_not_found, missing_app_state, app_policy_blocked, desktop_locked, action_blocked, unknown_element, invalid_arguments, or windows_runtime_error so callers can recover without parsing prose."

type toolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Annotations map[string]any `json:"annotations,omitempty"`
	InputSchema map[string]any `json:"inputSchema"`
}

type contentItem struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

type toolCallResult struct {
	Content   []contentItem `json:"content"`
	IsError   bool          `json:"isError"`
	ErrorCode string        `json:"errorCode,omitempty"`
}

func textResult(text string, isError bool) toolCallResult {
	return toolCallResult{
		Content:   []contentItem{{Type: "text", Text: text}},
		IsError:   isError,
		ErrorCode: classifyToolError(text, isError),
	}
}

func classifyToolError(text string, isError bool) string {
	if !isError {
		return ""
	}
	normalized := strings.ToLower(strings.TrimSpace(text))
	switch {
	case strings.HasPrefix(normalized, "unsupportedtool("):
		return "unsupported_tool"
	case strings.HasPrefix(normalized, "appnotfound("):
		return "app_not_found"
	case strings.Contains(normalized, "no app state is available"):
		return "missing_app_state"
	case strings.Contains(normalized, "unknown element_index"):
		return "unknown_element"
	case strings.Contains(normalized, "computer use blocked"):
		if strings.Contains(normalized, "desktop access") || strings.Contains(normalized, "interactive desktop") || strings.Contains(normalized, "input desktop") {
			return "desktop_locked"
		}
		return "action_blocked"
	case strings.Contains(normalized, "computer use blocks ") || strings.Contains(normalized, "computer use is denied") || strings.Contains(normalized, "computer use requires approval"):
		return "app_policy_blocked"
	case strings.Contains(normalized, "missing required argument") ||
		strings.Contains(normalized, "requires either") ||
		strings.Contains(normalized, "requires a ") ||
		strings.Contains(normalized, "must be") ||
		strings.Contains(normalized, "invalid "):
		return "invalid_arguments"
	case strings.Contains(normalized, "windows runtime") ||
		strings.Contains(normalized, "could not activate") ||
		strings.Contains(normalized, "cannot activate") ||
		strings.Contains(normalized, "powershell") ||
		strings.Contains(normalized, "uia "):
		return "windows_runtime_error"
	default:
		return "tool_error"
	}
}

type appDescriptor struct {
	Name             string `json:"name"`
	BundleIdentifier string `json:"bundleIdentifier,omitempty"`
	PID              int    `json:"pid"`
}

type appListEntry struct {
	App         appDescriptor `json:"app"`
	WindowTitle string        `json:"windowTitle,omitempty"`
}

type frame struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

func (f frame) renderedLocalFrame() string {
	return fmt.Sprintf("{{x: %.0f, y: %.0f, width: %.0f, height: %.0f}}", f.X, f.Y, f.Width, f.Height)
}

type elementRecord struct {
	Index                int      `json:"index"`
	RuntimeID            []int    `json:"runtimeId,omitempty"`
	AutomationID         string   `json:"automationId,omitempty"`
	Name                 string   `json:"name,omitempty"`
	ControlType          string   `json:"controlType,omitempty"`
	LocalizedControlType string   `json:"localizedControlType,omitempty"`
	ClassName            string   `json:"className,omitempty"`
	Value                string   `json:"value,omitempty"`
	NativeWindowHandle   int64    `json:"nativeWindowHandle,omitempty"`
	Frame                *frame   `json:"frame,omitempty"`
	Actions              []string `json:"actions,omitempty"`
	IsSensitive          bool     `json:"isSensitive,omitempty"`
}

type appSnapshot struct {
	App                 appDescriptor   `json:"app"`
	WindowTitle         string          `json:"windowTitle,omitempty"`
	WindowBounds        *frame          `json:"windowBounds,omitempty"`
	ScreenshotPNGBase64 string          `json:"screenshotPngBase64,omitempty"`
	TreeLines           []string        `json:"treeLines,omitempty"`
	FocusedSummary      string          `json:"focusedSummary,omitempty"`
	SelectedText        string          `json:"selectedText,omitempty"`
	Elements            []elementRecord `json:"elements,omitempty"`
	SensitiveRedacted   bool            `json:"sensitiveContentRedacted,omitempty"`
}

func (s *appSnapshot) renderedText() string {
	if s == nil {
		return ""
	}
	appRef := s.App.BundleIdentifier
	if appRef == "" {
		appRef = s.App.Name
	}
	title := s.WindowTitle
	if strings.TrimSpace(title) == "" {
		title = s.App.Name
	}

	lines := []string{
		fmt.Sprintf("App=%s (pid %d)", appRef, s.App.PID),
		fmt.Sprintf("Window: %q, App: %s.", title, s.App.Name),
	}
	lines = append(lines, s.TreeLines...)
	if s.SensitiveRedacted {
		lines = append(lines, "", "Sensitive UI content was redacted; screenshot omitted.")
	}
	if strings.TrimSpace(s.SelectedText) != "" {
		lines = append(lines, "", fmt.Sprintf("Selected text: [%s]", s.SelectedText))
	} else if strings.TrimSpace(s.FocusedSummary) != "" {
		lines = append(lines, "", fmt.Sprintf("The focused UI element is %s.", s.FocusedSummary))
	}
	return strings.Join(lines, "\n")
}

func (s *appSnapshot) result() toolCallResult {
	result := toolCallResult{
		Content: []contentItem{{Type: "text", Text: s.renderedText()}},
	}
	if s != nil && s.ScreenshotPNGBase64 != "" {
		result.Content = append(result.Content, contentItem{
			Type:     "image",
			Data:     s.ScreenshotPNGBase64,
			MimeType: "image/png",
		})
	}
	return result
}

type psRequest struct {
	Tool         string         `json:"tool"`
	App          string         `json:"app,omitempty"`
	Element      *elementRecord `json:"element,omitempty"`
	X            *float64       `json:"x,omitempty"`
	Y            *float64       `json:"y,omitempty"`
	FromX        *float64       `json:"from_x,omitempty"`
	FromY        *float64       `json:"from_y,omitempty"`
	ToX          *float64       `json:"to_x,omitempty"`
	ToY          *float64       `json:"to_y,omitempty"`
	ClickCount   int            `json:"click_count,omitempty"`
	MouseButton  string         `json:"mouse_button,omitempty"`
	Action       string         `json:"action,omitempty"`
	Direction    string         `json:"direction,omitempty"`
	Pages        float64        `json:"pages,omitempty"`
	Text         string         `json:"text,omitempty"`
	Key          string         `json:"key,omitempty"`
	Value        string         `json:"value,omitempty"`
	WindowBounds *frame         `json:"windowBounds,omitempty"`
}

type psResponse struct {
	OK          bool           `json:"ok"`
	Text        string         `json:"text,omitempty"`
	Error       string         `json:"error,omitempty"`
	App         *appDescriptor `json:"app,omitempty"`
	Apps        []appListEntry `json:"apps,omitempty"`
	WindowTitle string         `json:"windowTitle,omitempty"`
	Snapshot    *appSnapshot   `json:"snapshot,omitempty"`
}

type service struct {
	snapshots map[string]*appSnapshot
	runner    *powerShellRunner
}

func newService() *service {
	return &service{snapshots: map[string]*appSnapshot{}, runner: newPowerShellRunner()}
}

func (s *service) close() {
	if s == nil || s.runner == nil {
		return
	}
	s.runner.close()
}

func (s *service) callTool(name string, args map[string]any) toolCallResult {
	canonicalName := canonicalToolName(name)
	switch canonicalName {
	case "list_apps":
		return s.listApps()
	case "get_app_state":
		return s.getAppState(requiredString(args, "app"))
	case "activate_app":
		return s.activateApp(requiredString(args, "app"))
	case "click":
		return s.click(
			requiredString(args, "app"),
			optionalString(args, "element_index"),
			optionalFloat(args, "x"),
			optionalFloat(args, "y"),
			intValue(optionalFloat(args, "click_count"), 1),
			defaultString(optionalString(args, "mouse_button"), "left"),
		)
	case "perform_secondary_action":
		return s.performSecondaryAction(
			requiredString(args, "app"),
			requiredString(args, "element_index"),
			requiredString(args, "action"),
		)
	case "scroll":
		return s.scroll(
			requiredString(args, "app"),
			requiredString(args, "direction"),
			requiredString(args, "element_index"),
			floatValue(optionalFloat(args, "pages"), 1),
		)
	case "drag":
		return s.drag(
			requiredString(args, "app"),
			requiredFloat(args, "from_x"),
			requiredFloat(args, "from_y"),
			requiredFloat(args, "to_x"),
			requiredFloat(args, "to_y"),
		)
	case "type_text":
		return s.typeText(requiredString(args, "app"), optionalString(args, "element_index"), requiredLiteralString(args, "text"))
	case "press_key":
		return s.pressKey(requiredString(args, "app"), requiredString(args, "key"))
	case "set_value":
		return s.setValue(requiredString(args, "app"), requiredString(args, "element_index"), requiredLiteralString(args, "value"))
	default:
		return textResult(fmt.Sprintf("unsupportedTool(%q)", name), true)
	}
}

func canonicalToolName(name string) string {
	switch strings.TrimSpace(name) {
	case "list_mac_apps":
		return "list_apps"
	case "get_state":
		return "get_app_state"
	case "perform_accessibility_action":
		return "perform_secondary_action"
	default:
		return name
	}
}

func (s *service) listApps() toolCallResult {
	response, err := s.runPowerShell(psRequest{Tool: "list_apps"})
	if err != nil {
		return textResult(err.Error(), true)
	}
	if !response.OK {
		return textResult(response.Error, true)
	}
	text := response.Text
	if len(response.Apps) > 0 {
		text = renderAppList(filterAppListEntries(response.Apps, loadAppAccessPolicy()))
	}
	if strings.TrimSpace(text) == "" {
		text = "No running top-level apps are visible or allowed by the Computer Use policy."
	}
	return textResult(text, false)
}

func (s *service) getAppState(app string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	snapshot, result := s.refreshSnapshot(app, psRequest{Tool: "get_app_state", App: strconv.Itoa(resolved.PID)})
	if result.IsError {
		return result
	}
	return snapshot.result()
}

func (s *service) activateApp(app string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	return s.actionResult(app, psRequest{Tool: "activate_app", App: strconv.Itoa(resolved.PID)})
}

func (s *service) click(app, elementIndex string, x, y *float64, clickCount int, mouseButton string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if elementIndex == "" && (x == nil || y == nil) {
		return textResult("click requires either element_index or x/y", true)
	}
	if clickCount < 1 || clickCount > maxClickCount {
		return textResult(fmt.Sprintf("click_count must be between 1 and %d", maxClickCount), true)
	}
	mouseButton = strings.ToLower(strings.TrimSpace(mouseButton))
	if mouseButton != "left" && mouseButton != "right" && mouseButton != "middle" {
		return textResult("mouse_button must be left, right, or middle", true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	request := psRequest{
		Tool:         "click",
		App:          strconv.Itoa(resolved.PID),
		X:            x,
		Y:            y,
		ClickCount:   clickCount,
		MouseButton:  mouseButton,
		WindowBounds: snapshot.WindowBounds,
	}
	if elementIndex != "" {
		record, err := lookupElement(snapshot, elementIndex)
		if err != nil {
			return textResult(err.Error(), true)
		}
		if err := guardElementActionInSnapshot("click", *resolved, snapshot, record); err != nil {
			return textResult(err.Error(), true)
		}
		if err := validateElementClickTarget(record); err != nil {
			return textResult(err.Error(), true)
		}
		request.Element = record
	} else {
		point := coordinatePoint{x: *x, y: *y}
		if err := validateCoordinateBounds("click", snapshot, point); err != nil {
			return textResult(err.Error(), true)
		}
		if err := guardCoordinateAction("click", *resolved, snapshot, point); err != nil {
			return textResult(err.Error(), true)
		}
	}
	return s.actionResult(app, request)
}

func (s *service) performSecondaryAction(app, elementIndex, action string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if elementIndex == "" {
		return textResult("Missing required argument: element_index", true)
	}
	if action == "" {
		return textResult("Missing required argument: action", true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	record, err := lookupElement(snapshot, elementIndex)
	if err != nil {
		return textResult(err.Error(), true)
	}
	if err := guardElementActionInSnapshot("perform_secondary_action", *resolved, snapshot, record); err != nil {
		return textResult(err.Error(), true)
	}
	return s.actionResult(app, psRequest{Tool: "perform_secondary_action", App: strconv.Itoa(resolved.PID), Element: record, Action: action})
}

func (s *service) scroll(app, direction, elementIndex string, pages float64) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if elementIndex == "" {
		return textResult("Missing required argument: element_index", true)
	}
	normalized := strings.ToLower(direction)
	if normalized != "up" && normalized != "down" && normalized != "left" && normalized != "right" {
		return textResult("Invalid scroll direction: "+direction, true)
	}
	if pages <= 0 {
		return textResult("pages must be > 0", true)
	}
	if pages > maxScrollPages {
		return textResult(fmt.Sprintf("pages must be <= %d", maxScrollPages), true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	record, err := lookupElement(snapshot, elementIndex)
	if err != nil {
		return textResult(err.Error(), true)
	}
	if err := guardScrollAction(*resolved, snapshot, record); err != nil {
		return textResult(err.Error(), true)
	}
	if err := validateElementScrollTarget(record); err != nil {
		return textResult(err.Error(), true)
	}
	return s.actionResult(app, psRequest{Tool: "scroll", App: strconv.Itoa(resolved.PID), Element: record, Direction: normalized, Pages: pages})
}

func (s *service) drag(app string, fromX, fromY, toX, toY *float64) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if fromX == nil {
		return textResult("Missing required argument: from_x", true)
	}
	if fromY == nil {
		return textResult("Missing required argument: from_y", true)
	}
	if toX == nil {
		return textResult("Missing required argument: to_x", true)
	}
	if toY == nil {
		return textResult("Missing required argument: to_y", true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	from := coordinatePoint{x: *fromX, y: *fromY}
	to := coordinatePoint{x: *toX, y: *toY}
	if err := validateCoordinateBounds("drag", snapshot, from, to); err != nil {
		return textResult(err.Error(), true)
	}
	if err := guardCoordinateAction("drag", *resolved, snapshot, from, to); err != nil {
		return textResult(err.Error(), true)
	}
	return s.actionResult(app, psRequest{Tool: "drag", App: strconv.Itoa(resolved.PID), FromX: fromX, FromY: fromY, ToX: toX, ToY: toY, WindowBounds: snapshot.WindowBounds})
}

func (s *service) typeText(app, elementIndex, text string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if text == "" {
		return textResult("Missing required argument: text", true)
	}
	if runeCount(text) > maxTextRunes {
		return textResult(fmt.Sprintf("text must be <= %d characters", maxTextRunes), true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	request := psRequest{Tool: "type_text", App: strconv.Itoa(resolved.PID), Text: text}
	var record *elementRecord
	if strings.TrimSpace(elementIndex) != "" {
		var err error
		record, err = lookupElement(snapshot, elementIndex)
		if err != nil {
			return textResult(err.Error(), true)
		}
		request.Element = record
	}
	if err := guardTextAction("type_text", *resolved, snapshot, record, text); err != nil {
		return textResult(err.Error(), true)
	}
	return s.actionResult(app, request)
}

func (s *service) pressKey(app, key string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if key == "" {
		return textResult("Missing required argument: key", true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	if err := guardKeyAction(*resolved, snapshot, key); err != nil {
		return textResult(err.Error(), true)
	}
	return s.actionResult(app, psRequest{Tool: "press_key", App: strconv.Itoa(resolved.PID), Key: key})
}

func (s *service) setValue(app, elementIndex, value string) toolCallResult {
	resolved, _, result := s.resolveAppForUse(app)
	if result.IsError {
		return result
	}
	if elementIndex == "" {
		return textResult("Missing required argument: element_index", true)
	}
	if runeCount(value) > maxTextRunes {
		return textResult(fmt.Sprintf("value must be <= %d characters", maxTextRunes), true)
	}
	snapshot := s.currentSnapshotFor(app, resolved)
	if snapshot == nil {
		return textResult("No app state is available for "+app+". Run get_app_state before action tools.", true)
	}
	record, err := lookupElement(snapshot, elementIndex)
	if err != nil {
		return textResult(err.Error(), true)
	}
	if err := guardTextAction("set_value", *resolved, snapshot, record, value); err != nil {
		return textResult(err.Error(), true)
	}
	return s.actionResult(app, psRequest{Tool: "set_value", App: strconv.Itoa(resolved.PID), Element: record, Value: value})
}

func (s *service) actionResult(app string, request psRequest) toolCallResult {
	snapshot, result := s.refreshSnapshot(app, request)
	if result.IsError {
		return result
	}
	return snapshot.result()
}

func (s *service) currentSnapshot(app string) *appSnapshot {
	return s.snapshots[strings.ToLower(app)]
}

func (s *service) currentSnapshotFor(app string, resolved *appDescriptor) *appSnapshot {
	if snapshot := s.currentSnapshot(app); snapshotMatchesResolved(snapshot, resolved) {
		return snapshot
	}
	if resolved == nil {
		return nil
	}
	for _, key := range []string{strconv.Itoa(resolved.PID), resolved.Name, resolved.BundleIdentifier} {
		if snapshot := s.currentSnapshot(key); snapshotMatchesResolved(snapshot, resolved) {
			return snapshot
		}
	}
	return nil
}

func snapshotMatchesResolved(snapshot *appSnapshot, resolved *appDescriptor) bool {
	if snapshot == nil || resolved == nil {
		return false
	}
	if snapshot.App.PID != 0 && resolved.PID != 0 {
		return snapshot.App.PID == resolved.PID
	}
	return strings.EqualFold(snapshot.App.Name, resolved.Name) ||
		strings.EqualFold(snapshot.App.BundleIdentifier, resolved.BundleIdentifier)
}

func (s *service) resolveAppForUse(app string) (*appDescriptor, string, toolCallResult) {
	query, err := cleanAppQuery(app)
	if err != nil {
		return nil, "", textResult(err.Error(), true)
	}

	response, err := s.runPowerShell(psRequest{Tool: "resolve_app", App: query})
	if err != nil {
		return nil, "", textResult(err.Error(), true)
	}
	if !response.OK {
		return nil, "", textResult(response.Error, true)
	}
	if response.App == nil {
		return nil, "", textResult("Windows runtime did not resolve an app.", true)
	}
	if err := loadAppAccessPolicy().authorize(*response.App); err != nil {
		return nil, "", textResult(err.Error(), true)
	}
	return response.App, response.WindowTitle, toolCallResult{}
}

func filterAppListEntries(entries []appListEntry, policy appAccessPolicy) []appListEntry {
	filtered := make([]appListEntry, 0, len(entries))
	for _, entry := range entries {
		if err := policy.authorize(entry.App); err == nil {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func renderAppList(entries []appListEntry) string {
	lines := make([]string, 0, len(entries))
	for _, entry := range entries {
		title := strings.TrimSpace(entry.WindowTitle)
		if title == "" {
			title = "untitled"
		}
		lines = append(lines, fmt.Sprintf("%s -- %s [running, pid=%d, window=%s]", entry.App.Name, entry.App.Name, entry.App.PID, title))
	}
	return strings.Join(lines, "\n")
}

func cleanAppQuery(app string) (string, error) {
	app = strings.TrimSpace(app)
	if app == "" {
		return "", errors.New("Missing required argument: app")
	}
	if runeCount(app) > maxAppQueryRunes {
		return "", fmt.Errorf("app must be <= %d characters", maxAppQueryRunes)
	}
	return app, nil
}

func runeCount(value string) int {
	return len([]rune(value))
}

func (s *service) refreshSnapshot(app string, request psRequest) (*appSnapshot, toolCallResult) {
	response, err := s.runPowerShell(request)
	if err != nil {
		return nil, textResult(err.Error(), true)
	}
	if !response.OK {
		return nil, textResult(response.Error, true)
	}
	if response.Snapshot == nil {
		return nil, textResult("Windows runtime did not return an app snapshot.", true)
	}
	s.rememberSnapshot(app, response.Snapshot)
	return response.Snapshot, toolCallResult{}
}

func (s *service) runPowerShell(request psRequest) (*psResponse, error) {
	if s.runner == nil {
		return runPowerShell(request)
	}
	return s.runner.run(request)
}

func (s *service) rememberSnapshot(query string, snapshot *appSnapshot) {
	keys := []string{query, snapshot.App.Name, snapshot.App.BundleIdentifier, strconv.Itoa(snapshot.App.PID)}
	for _, key := range keys {
		key = strings.ToLower(strings.TrimSpace(key))
		if key != "" {
			s.snapshots[key] = snapshot
		}
	}
}

func lookupElement(snapshot *appSnapshot, elementIndex string) (*elementRecord, error) {
	index, err := strconv.Atoi(elementIndex)
	if err != nil {
		return nil, fmt.Errorf("unknown element_index %q", elementIndex)
	}
	for _, record := range snapshot.Elements {
		if record.Index == index {
			copy := record
			return &copy, nil
		}
	}
	return nil, fmt.Errorf("unknown element_index %q", elementIndex)
}

func validateElementClickTarget(record *elementRecord) error {
	if record == nil || record.Frame != nil || elementHasPreferredClickAction(record) {
		return nil
	}
	return fmt.Errorf("element_index %d requires a semantic click action or frame; refresh app state or use x/y coordinates without element_index", record.Index)
}

func validateElementScrollTarget(record *elementRecord) error {
	if record == nil || record.Frame != nil || elementHasAction(record, "scroll") {
		return nil
	}
	return fmt.Errorf("element_index %d requires Scroll support or frame; refresh app state before scrolling", record.Index)
}

func elementHasPreferredClickAction(record *elementRecord) bool {
	return elementHasAction(record, "invoke", "select", "toggle")
}

func elementHasAction(record *elementRecord, names ...string) bool {
	if record == nil {
		return false
	}
	allowed := map[string]struct{}{}
	for _, name := range names {
		allowed[strings.ToLower(strings.TrimSpace(name))] = struct{}{}
	}
	for _, action := range record.Actions {
		if _, ok := allowed[strings.ToLower(strings.TrimSpace(action))]; ok {
			return true
		}
	}
	return false
}

func validateCoordinateBounds(tool string, snapshot *appSnapshot, points ...coordinatePoint) error {
	if snapshot == nil || snapshot.WindowBounds == nil || snapshot.WindowBounds.Width <= 0 || snapshot.WindowBounds.Height <= 0 {
		return fmt.Errorf("%s coordinates require latest app state with window bounds", tool)
	}
	for _, point := range points {
		if point.x < 0 || point.y < 0 || point.x >= snapshot.WindowBounds.Width || point.y >= snapshot.WindowBounds.Height {
			return fmt.Errorf("%s coordinates must be within latest screenshot bounds (0 <= x < %.0f, 0 <= y < %.0f)", tool, snapshot.WindowBounds.Width, snapshot.WindowBounds.Height)
		}
	}
	return nil
}

func runPowerShell(request psRequest) (*psResponse, error) {
	return runPowerShellOnce(request)
}

func runPowerShellOnce(request psRequest) (*psResponse, error) {
	if runtime.GOOS != "windows" {
		return nil, errors.New("Windows Computer Use runtime requires powershell.exe on Windows")
	}

	tempDir, err := os.MkdirTemp("", "open-computer-use-windows-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tempDir)

	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	operationPath := filepath.Join(tempDir, "operation.json")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		return nil, err
	}
	operationData, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(operationPath, operationData, 0o600); err != nil {
		return nil, err
	}

	timeout := powerShellToolTimeout(request.Tool)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, operationPath)
	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return nil, fmt.Errorf("Windows runtime timed out after %s", formatDurationSeconds(timeout))
	}
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			text = err.Error()
		}
		return nil, fmt.Errorf("Windows runtime failed: %s", text)
	}

	var response psResponse
	if err := json.Unmarshal(output, &response); err != nil {
		return nil, fmt.Errorf("Windows runtime returned invalid JSON: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return &response, nil
}

func requiredString(args map[string]any, key string) string {
	value, _ := args[key].(string)
	return strings.TrimSpace(value)
}

func requiredLiteralString(args map[string]any, key string) string {
	value, _ := args[key].(string)
	return value
}

func optionalString(args map[string]any, key string) string {
	value, _ := args[key].(string)
	return value
}

func requiredFloat(args map[string]any, key string) *float64 {
	return optionalFloat(args, key)
}

func optionalFloat(args map[string]any, key string) *float64 {
	switch value := args[key].(type) {
	case float64:
		return &value
	case int:
		float := float64(value)
		return &float
	case json.Number:
		float, err := value.Float64()
		if err == nil {
			return &float
		}
	}
	return nil
}

func intValue(value *float64, fallback int) int {
	if value == nil {
		return fallback
	}
	return int(*value)
}

func floatValue(value *float64, fallback float64) float64 {
	if value == nil {
		return fallback
	}
	return *value
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func toolDefinitions() []toolDefinition {
	return []toolDefinition{
		{
			Name:        "activate_app",
			Description: "Bring a visible target app window to the foreground. Use before modifier keyboard shortcuts such as ctrl+v when the target app is not already foreground. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app": stringProperty("App name or bundle identifier"),
			}, []string{"app"}),
		},
		{
			Name:        "click",
			Description: "Click an element by index or pixel coordinates from screenshot. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":           stringProperty("App name or bundle identifier"),
				"element_index": stringProperty("Element index to click"),
				"x":             numberProperty("X coordinate in screenshot pixel coordinates"),
				"y":             numberProperty("Y coordinate in screenshot pixel coordinates"),
				"click_count":   integerProperty("Number of clicks. Defaults to 1"),
				"mouse_button":  enumStringProperty("Mouse button to click. Defaults to left.", []string{"left", "right", "middle"}),
			}, []string{"app"}),
		},
		{
			Name:        "drag",
			Description: "Drag from one point to another using pixel coordinates. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":    stringProperty("App name or bundle identifier"),
				"from_x": numberProperty("Start X coordinate"),
				"from_y": numberProperty("Start Y coordinate"),
				"to_x":   numberProperty("End X coordinate"),
				"to_y":   numberProperty("End Y coordinate"),
			}, []string{"app", "from_x", "from_y", "to_x", "to_y"}),
		},
		{
			Name:        "get_app_state",
			Description: "Get the state of an already running app's key window and return a screenshot and accessibility tree. This must be called once per assistant turn before interacting with the app. This tool is part of plugin `Computer Use`.",
			Annotations: readOnlyAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app": stringProperty("App name or bundle identifier"),
			}, []string{"app"}),
		},
		{
			Name:        "get_state",
			Description: "Alias of get_app_state for cross-platform Computer Use prompts. This tool is part of plugin `Computer Use`.",
			Annotations: readOnlyAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app": stringProperty("App name or bundle identifier"),
			}, []string{"app"}),
		},
		{
			Name:        "list_apps",
			Description: "List visible top-level Windows apps that are currently running. This tool is part of plugin `Computer Use`.",
			Annotations: readOnlyAnnotations(),
			InputSchema: objectSchema(map[string]any{}, nil),
		},
		{
			Name:        "list_mac_apps",
			Description: "Alias of list_apps for cross-platform Computer Use prompts. On Windows this returns visible Windows apps. This tool is part of plugin `Computer Use`.",
			Annotations: readOnlyAnnotations(),
			InputSchema: objectSchema(map[string]any{}, nil),
		},
		{
			Name:        "perform_secondary_action",
			Description: "Invoke a secondary accessibility action exposed by an element. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":           stringProperty("App name or bundle identifier"),
				"element_index": stringProperty("Element identifier"),
				"action":        stringProperty("Secondary accessibility action name"),
			}, []string{"app", "element_index", "action"}),
		},
		{
			Name:        "perform_accessibility_action",
			Description: "Alias of perform_secondary_action for cross-platform Computer Use prompts. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":           stringProperty("App name or bundle identifier"),
				"element_index": stringProperty("Element identifier"),
				"action":        stringProperty("Accessibility action name"),
			}, []string{"app", "element_index", "action"}),
		},
		{
			Name:        "press_key",
			Description: "Press a key or key-combination on the keyboard, including modifier and navigation keys.\n  - This supports xdotool's `key` syntax.\n  - Modifier combinations such as \"ctrl+v\" and \"Control_L+v\" use foreground keyboard input so the modifier state is preserved; call activate_app first unless the target app is already foreground.\n  - Windows global shortcuts such as win+r, super+l, alt+tab, and ctrl+shift+esc are blocked by the action guard.\n  - Examples: \"a\", \"Return\", \"Tab\", \"ctrl+v\", \"Control_L+v\", \"Up\", \"KP_0\" (for the numpad 0). This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app": stringProperty("App name or bundle identifier"),
				"key": stringProperty("Key or key-combination to press"),
			}, []string{"app", "key"}),
		},
		{
			Name:        "scroll",
			Description: "Scroll an element in a direction by a number of pages. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":           stringProperty("App name or bundle identifier"),
				"direction":     stringProperty("Scroll direction: up, down, left, or right"),
				"element_index": stringProperty("Element identifier"),
				"pages":         numberProperty("Number of pages to scroll. Fractional values are supported. Defaults to 1"),
			}, []string{"app", "element_index", "direction"}),
		},
		{
			Name:        "set_value",
			Description: "Set the value of a settable accessibility element. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":           stringProperty("App name or bundle identifier"),
				"element_index": stringProperty("Element identifier"),
				"value":         stringProperty("Value to assign"),
			}, []string{"app", "element_index", "value"}),
		},
		{
			Name:        "type_text",
			Description: "Type literal text using keyboard input. This tool is part of plugin `Computer Use`.",
			Annotations: defaultAnnotations(),
			InputSchema: objectSchema(map[string]any{
				"app":           stringProperty("App name or bundle identifier"),
				"element_index": stringProperty("Optional text-entry element index from the latest app state"),
				"text":          stringProperty("Literal text to type"),
			}, []string{"app", "text"}),
		},
	}
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	schema := map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func defaultAnnotations() map[string]any {
	return map[string]any{"destructiveHint": false, "openWorldHint": false}
}

func readOnlyAnnotations() map[string]any {
	return map[string]any{"destructiveHint": false, "idempotentHint": true, "openWorldHint": false, "readOnlyHint": true}
}

func stringProperty(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

func enumStringProperty(description string, values []string) map[string]any {
	property := stringProperty(description)
	property["enum"] = values
	return property
}

func numberProperty(description string) map[string]any {
	return map[string]any{"type": "number", "description": description}
}

func integerProperty(description string) map[string]any {
	return map[string]any{"type": "integer", "description": description}
}

func main() {
	if err := runCLI(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runCLI(args []string, stdout io.Writer) error {
	if len(args) == 0 {
		fmt.Fprint(stdout, helpText(""))
		return nil
	}

	switch args[0] {
	case "-h", "--help", "help":
		topic := ""
		if len(args) > 1 {
			topic = args[1]
		}
		fmt.Fprint(stdout, helpText(topic))
		return nil
	case "-v", "--version", "version":
		fmt.Fprintln(stdout, version)
		return nil
	case "mcp":
		return runMCP(os.Stdin, stdout)
	case "doctor":
		fmt.Fprintln(stdout, "Windows runtime: UI Automation and Win32 window-message bridge are available when this process runs in the signed-in desktop session.")
		return nil
	case "list-apps":
		svc := newService()
		defer svc.close()
		result := svc.callTool("list_apps", map[string]any{})
		if result.IsError {
			return errors.New(result.Content[0].Text)
		}
		fmt.Fprintln(stdout, result.Content[0].Text)
		return nil
	case "snapshot":
		if len(args) != 2 {
			return errors.New("snapshot requires an app name, process name, window title, or pid")
		}
		svc := newService()
		defer svc.close()
		result := svc.callTool("get_app_state", map[string]any{"app": args[1]})
		if result.IsError {
			return errors.New(result.Content[0].Text)
		}
		fmt.Fprintln(stdout, result.Content[0].Text)
		return nil
	case "call":
		svc := newService()
		defer svc.close()
		output, hasError, err := runCallCommand(args[1:], svc)
		if err != nil {
			return err
		}
		encoded, err := json.MarshalIndent(output, "", "  ")
		if err != nil {
			return err
		}
		fmt.Fprintln(stdout, string(encoded))
		if hasError {
			return errors.New("tool call returned isError=true")
		}
		return nil
	default:
		return fmt.Errorf("unknown command: %s\n\n%s", args[0], helpText(""))
	}
}

func runCallCommand(args []string, svc *service) (any, bool, error) {
	if len(args) == 0 {
		return nil, false, errors.New("call requires a tool name or --calls/--calls-file")
	}

	var toolName, argsJSON, argsFile, callsJSON, callsFile string
	for index := 0; index < len(args); index++ {
		arg := args[index]
		switch arg {
		case "--args":
			index++
			if index >= len(args) {
				return nil, false, errors.New("--args requires a value")
			}
			argsJSON = args[index]
		case "--args-file":
			index++
			if index >= len(args) {
				return nil, false, errors.New("--args-file requires a value")
			}
			argsFile = args[index]
		case "--calls":
			index++
			if index >= len(args) {
				return nil, false, errors.New("--calls requires a value")
			}
			callsJSON = args[index]
		case "--calls-file":
			index++
			if index >= len(args) {
				return nil, false, errors.New("--calls-file requires a value")
			}
			callsFile = args[index]
		default:
			if strings.HasPrefix(arg, "-") {
				return nil, false, fmt.Errorf("unknown call option: %s", arg)
			}
			if toolName != "" {
				return nil, false, errors.New("call accepts at most one tool name")
			}
			toolName = arg
		}
	}

	if callsJSON != "" || callsFile != "" {
		if toolName != "" || argsJSON != "" || argsFile != "" {
			return nil, false, errors.New("call sequence does not accept a tool name, --args, or --args-file")
		}
		calls, err := readCallSequence(callsJSON, callsFile)
		if err != nil {
			return nil, false, err
		}
		var outputs []map[string]any
		hasError := false
		for _, call := range calls {
			result := svc.callTool(call.Tool, call.Args)
			outputs = append(outputs, map[string]any{"tool": call.Tool, "result": result})
			if result.IsError {
				hasError = true
				break
			}
		}
		return outputs, hasError, nil
	}

	if toolName == "" {
		return nil, false, errors.New("call requires a tool name or --calls/--calls-file")
	}
	arguments, err := readArguments(argsJSON, argsFile)
	if err != nil {
		return nil, false, err
	}
	result := svc.callTool(toolName, arguments)
	return result, result.IsError, nil
}

type callSpec struct {
	Tool string
	Args map[string]any
}

func readArguments(inline, file string) (map[string]any, error) {
	if inline != "" && file != "" {
		return nil, errors.New("Use either inline JSON or a JSON file, not both")
	}
	if inline == "" && file == "" {
		return map[string]any{}, nil
	}
	source, err := readJSONSource(inline, file)
	if err != nil {
		return nil, err
	}
	var args map[string]any
	decoder := json.NewDecoder(strings.NewReader(source))
	decoder.UseNumber()
	if err := decoder.Decode(&args); err != nil {
		return nil, fmt.Errorf("Invalid JSON input: %w", err)
	}
	if args == nil {
		return nil, errors.New("--args must be a JSON object")
	}
	return args, nil
}

func readCallSequence(inline, file string) ([]callSpec, error) {
	if inline != "" && file != "" {
		return nil, errors.New("Use either --calls or --calls-file, not both")
	}
	source, err := readJSONSource(inline, file)
	if err != nil {
		return nil, err
	}
	var raw []map[string]any
	decoder := json.NewDecoder(strings.NewReader(source))
	decoder.UseNumber()
	if err := decoder.Decode(&raw); err != nil {
		return nil, fmt.Errorf("Invalid JSON input: %w", err)
	}
	calls := make([]callSpec, 0, len(raw))
	for index, item := range raw {
		name, _ := item["tool"].(string)
		if name == "" {
			name, _ = item["name"].(string)
		}
		if name == "" {
			return nil, fmt.Errorf("call sequence item #%d requires a non-empty tool", index+1)
		}
		args, _ := item["args"].(map[string]any)
		if args == nil {
			args, _ = item["arguments"].(map[string]any)
		}
		if args == nil {
			args = map[string]any{}
		}
		calls = append(calls, callSpec{Tool: name, Args: args})
	}
	return calls, nil
}

func readJSONSource(inline, file string) (string, error) {
	if inline != "" {
		return inline, nil
	}
	if file == "" {
		return "", errors.New("JSON input is required")
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func runMCP(stdin io.Reader, stdout io.Writer) error {
	svc := newService()
	defer svc.close()
	decoder := json.NewDecoder(stdin)
	encoder := json.NewEncoder(stdout)
	for {
		var request map[string]any
		if err := decoder.Decode(&request); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			_ = encoder.Encode(jsonRPCError(nil, -32700, "Invalid JSON-RPC payload"))
			continue
		}
		response := handleMCPRequest(request, svc)
		if response != nil {
			if err := encoder.Encode(response); err != nil {
				return err
			}
		}
	}
}

func handleMCPRequest(request map[string]any, svc *service) map[string]any {
	id := request["id"]
	method, _ := request["method"].(string)
	params, _ := request["params"].(map[string]any)
	switch method {
	case "initialize":
		return jsonRPCResult(id, map[string]any{
			"protocolVersion": "2025-03-26",
			"serverInfo": map[string]any{
				"name":    "open-computer-use",
				"version": version,
			},
			"capabilities": map[string]any{"tools": map[string]any{"listChanged": false}},
			"instructions": serverInstructions,
		})
	case "notifications/initialized", "notifications/turn-ended":
		return nil
	case "ping":
		return jsonRPCResult(id, map[string]any{})
	case "tools/list":
		return jsonRPCResult(id, map[string]any{"tools": toolDefinitions()})
	case "tools/call":
		name, _ := params["name"].(string)
		arguments, _ := params["arguments"].(map[string]any)
		if arguments == nil {
			arguments = map[string]any{}
		}
		return jsonRPCResult(id, svc.callTool(name, arguments))
	default:
		if method == "" {
			return nil
		}
		return jsonRPCError(id, -32601, "Method not found: "+method)
	}
}

func jsonRPCResult(id any, result any) map[string]any {
	return map[string]any{"jsonrpc": "2.0", "id": id, "result": result}
}

func jsonRPCError(id any, code int, message string) map[string]any {
	return map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": code, "message": message},
	}
}

func helpText(command string) string {
	switch command {
	case "mcp":
		return "Usage:\n  open-computer-use.exe mcp\n\nStart the stdio MCP server.\n"
	case "call":
		return "Usage:\n  open-computer-use.exe call <tool> [--args '<json-object>']\n  open-computer-use.exe call --calls '<json-array>'\n\nThe JSON array form keeps all calls in one process so element_index state can be reused.\n"
	case "snapshot":
		return "Usage:\n  open-computer-use.exe snapshot <app>\n\nPrint the current Windows UI Automation snapshot for the target app.\n"
	default:
		return `Open Computer Use for Windows

Usage:
  open-computer-use.exe [command] [options]

Commands:
  mcp                  Start the stdio MCP server.
  doctor               Print Windows runtime notes.
  list-apps            Print running apps with top-level windows.
  snapshot <app>       Print the current UI Automation snapshot for an app.
  call <tool>           Call one tool, or run a JSON array of tool calls.
  help [command]       Show general or command-specific help.
  version              Print the CLI version.

Notes:
  The Windows runtime uses UI Automation first, then Win32 window messages for
  fallback input. Run it in the signed-in desktop session, not as a service.
`
	}
}
