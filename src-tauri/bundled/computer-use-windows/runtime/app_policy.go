package main

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	appPolicyEnvPath               = "OPEN_COMPUTER_USE_WINDOWS_CONFIG"
	appPolicyEnvRequireApprovals   = "OPEN_COMPUTER_USE_WINDOWS_REQUIRE_APP_APPROVALS"
	appPolicyEnvAllowUnapproved    = "OPEN_COMPUTER_USE_WINDOWS_ALLOW_UNAPPROVED_APPS"
	appPolicyEnvAllowProtected     = "OPEN_COMPUTER_USE_WINDOWS_ALLOW_PROTECTED_APPS"
	appPolicyDefaultRelativeConfig = "computer-use/config.toml"
)

var protectedAppReasons = map[string]string{
	"cmd":                "terminal shells can run arbitrary commands outside Computer Use UI safeguards",
	"conhost":            "terminal hosts can run arbitrary commands outside Computer Use UI safeguards",
	"powershell":         "terminal shells can run arbitrary commands outside Computer Use UI safeguards",
	"pwsh":               "terminal shells can run arbitrary commands outside Computer Use UI safeguards",
	"windowsterminal":    "terminal shells can run arbitrary commands outside Computer Use UI safeguards",
	"wt":                 "terminal shells can run arbitrary commands outside Computer Use UI safeguards",
	"diskmgmt":           "disk management tools can format, repartition, or erase drives",
	"diskpart":           "disk management tools can format, repartition, or erase drives",
	"format":             "disk formatting tools can erase drives",
	"mmc":                "management consoles can change disks, certificates, users, and system policy",
	"compmgmt":           "management consoles can change disks, users, services, and system policy",
	"regedit":            "registry editors can change system-wide settings",
	"regedt32":           "registry editors can change system-wide settings",
	"taskmgr":            "task managers can terminate processes or change startup behavior",
	"credentialuibroker": "credential prompts may expose or submit secrets",
	"1password":          "password managers may expose saved secrets",
	"bitwarden":          "password managers may expose saved secrets",
	"dashlane":           "password managers may expose saved secrets",
	"enpass":             "password managers may expose saved secrets",
	"keepass":            "password managers may expose saved secrets",
	"keepassxc":          "password managers may expose saved secrets",
	"lastpass":           "password managers may expose saved secrets",
	"nordpass":           "password managers may expose saved secrets",
	"protonpass":         "password managers may expose saved secrets",
}

type appAccessPolicy struct {
	allowed          map[string]struct{}
	denied           map[string]struct{}
	requireApprovals bool
	allowUnapproved  bool
	sourcePath       string
}

func loadAppAccessPolicy() appAccessPolicy {
	policy := appAccessPolicy{
		allowed:          map[string]struct{}{},
		denied:           map[string]struct{}{},
		requireApprovals: envFlagEnabled(appPolicyEnvRequireApprovals),
		allowUnapproved:  envFlagEnabled(appPolicyEnvAllowUnapproved),
		sourcePath:       appPolicyPath(),
	}

	if policy.sourcePath == "" {
		return policy
	}
	data, err := os.ReadFile(policy.sourcePath)
	if err != nil {
		return policy
	}

	allowed, denied, requireApprovals := parseAppPolicyConfig(string(data))
	if requireApprovals {
		policy.requireApprovals = true
	}
	for _, value := range allowed {
		if normalized := normalizeAppIdentifier(value); normalized != "" {
			policy.allowed[normalized] = struct{}{}
		}
	}
	for _, value := range denied {
		if normalized := normalizeAppIdentifier(value); normalized != "" {
			policy.denied[normalized] = struct{}{}
		}
	}
	return policy
}

func (p appAccessPolicy) authorize(app appDescriptor) error {
	aliases := appIdentifierAliases(app)
	if reason := protectedAppReason(aliases); reason != "" && !envFlagEnabled(appPolicyEnvAllowProtected) {
		return fmt.Errorf("Computer Use blocks %s because %s. Use dedicated Codex tools or handle this app manually; set %s=1 only for trusted local debugging.", appLabel(app), reason, appPolicyEnvAllowProtected)
	}
	if hasAnyIdentifier(p.denied, aliases) {
		return fmt.Errorf("Computer Use is denied for %s. Remove it from [apps].denied in %s to allow access.", appLabel(app), p.displayPath())
	}

	if p.allowUnapproved {
		return nil
	}

	if len(p.allowed) > 0 {
		if hasAnyIdentifier(p.allowed, aliases) {
			return nil
		}
		return fmt.Errorf("Computer Use is not allowed for %s. Add %q to [apps].allowed in %s to allow access.", appLabel(app), app.Name, p.displayPath())
	}

	if p.requireApprovals {
		return fmt.Errorf("Computer Use app approvals are required and %s is not allowed. Add %q to [apps].allowed in %s or set %s=1.", appLabel(app), app.Name, p.displayPath(), appPolicyEnvAllowUnapproved)
	}

	return nil
}

func protectedAppReason(aliases []string) string {
	for _, alias := range aliases {
		if reason, ok := protectedAppReasons[alias]; ok {
			return reason
		}
	}
	return ""
}

func (p appAccessPolicy) displayPath() string {
	if strings.TrimSpace(p.sourcePath) == "" {
		return "%CODEX_HOME%/" + appPolicyDefaultRelativeConfig
	}
	return p.sourcePath
}

func hasAnyIdentifier(set map[string]struct{}, values []string) bool {
	for _, value := range values {
		if _, ok := set[value]; ok {
			return true
		}
	}
	return false
}

func appIdentifierAliases(app appDescriptor) []string {
	values := []string{
		app.Name,
		app.BundleIdentifier,
		fmt.Sprintf("%d", app.PID),
	}
	seen := map[string]struct{}{}
	var result []string
	for _, value := range values {
		normalized := normalizeAppIdentifier(value)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func appLabel(app appDescriptor) string {
	if strings.TrimSpace(app.Name) == "" {
		return fmt.Sprintf("pid %d", app.PID)
	}
	return fmt.Sprintf("%s (pid %d)", app.Name, app.PID)
}

func normalizeAppIdentifier(value string) string {
	value = strings.TrimSpace(strings.Trim(value, `"'`))
	if value == "" {
		return ""
	}
	value = strings.ReplaceAll(value, "\\", "/")
	value = path.Base(value)
	value = strings.TrimSpace(value)
	if strings.HasSuffix(strings.ToLower(value), ".exe") {
		value = value[:len(value)-4]
	}
	return strings.ToLower(value)
}

func appPolicyPath() string {
	if value := strings.TrimSpace(os.Getenv(appPolicyEnvPath)); value != "" {
		return value
	}
	if codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME")); codexHome != "" {
		return filepath.Join(codexHome, appPolicyDefaultRelativeConfig)
	}
	if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
		return filepath.Join(home, ".codex", appPolicyDefaultRelativeConfig)
	}
	return ""
}

func envFlagEnabled(name string) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	switch value {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func parseAppPolicyConfig(text string) (allowed []string, denied []string, requireApprovals bool) {
	section := ""
	pendingKey := ""
	pendingValue := ""

	commit := func(key, value string) {
		switch key {
		case "allowed":
			allowed = append(allowed, parseTomlStringArray(value)...)
		case "denied":
			denied = append(denied, parseTomlStringArray(value)...)
		case "require_approvals":
			requireApprovals = parseTomlBool(value)
		}
	}

	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(stripTomlComment(rawLine))
		if line == "" {
			continue
		}

		if pendingKey != "" {
			pendingValue += " " + line
			if strings.Contains(line, "]") {
				commit(pendingKey, pendingValue)
				pendingKey = ""
				pendingValue = ""
			}
			continue
		}

		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.TrimSpace(strings.Trim(line, "[]"))
			continue
		}
		if section != "apps" {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key != "allowed" && key != "denied" && key != "require_approvals" {
			continue
		}
		if strings.HasPrefix(value, "[") && !strings.Contains(value, "]") {
			pendingKey = key
			pendingValue = value
			continue
		}
		commit(key, value)
	}

	return allowed, denied, requireApprovals
}

func parseTomlBool(value string) bool {
	value = strings.TrimSpace(strings.ToLower(stripTomlComment(value)))
	switch value {
	case "true", "1", "yes", "on":
		return true
	default:
		return false
	}
}

func stripTomlComment(line string) string {
	inString := false
	escaped := false
	for index, char := range line {
		if escaped {
			escaped = false
			continue
		}
		if char == '\\' && inString {
			escaped = true
			continue
		}
		if char == '"' {
			inString = !inString
			continue
		}
		if char == '#' && !inString {
			return line[:index]
		}
	}
	return line
}

func parseTomlStringArray(value string) []string {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "[") || !strings.Contains(value, "]") {
		return nil
	}
	end := strings.LastIndex(value, "]")
	if end <= 0 {
		return nil
	}
	inner := value[1:end]
	parts := splitTomlArrayItems(inner)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.HasPrefix(part, `"`) {
			unquoted, err := strconv.Unquote(part)
			if err == nil {
				result = append(result, unquoted)
			}
			continue
		}
		result = append(result, strings.Trim(part, `"'`))
	}
	return result
}

func splitTomlArrayItems(value string) []string {
	var result []string
	start := 0
	inString := false
	escaped := false
	for index, char := range value {
		if escaped {
			escaped = false
			continue
		}
		if char == '\\' && inString {
			escaped = true
			continue
		}
		if char == '"' {
			inString = !inString
			continue
		}
		if char == ',' && !inString {
			result = append(result, value[start:index])
			start = index + 1
		}
	}
	result = append(result, value[start:])
	return result
}
