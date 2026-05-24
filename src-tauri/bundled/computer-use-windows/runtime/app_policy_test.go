package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseAppPolicyConfig(t *testing.T) {
	allowed, denied := parseAppPolicyConfig(`
[apps]
allowed = [
  "notepad.exe",
  "Code",
]
denied = ["powershell"] # shell access is blocked
`)

	if strings.Join(allowed, ",") != "notepad.exe,Code" {
		t.Fatalf("allowed = %#v", allowed)
	}
	if strings.Join(denied, ",") != "powershell" {
		t.Fatalf("denied = %#v", denied)
	}
}

func TestAppAccessPolicyBlocksDeniedApps(t *testing.T) {
	policy := appAccessPolicy{
		allowed: map[string]struct{}{},
		denied:  map[string]struct{}{"powershell": {}},
	}

	err := policy.authorize(appDescriptor{Name: "powershell", BundleIdentifier: "powershell", PID: 42})
	if err == nil || !strings.Contains(err.Error(), "denied") {
		t.Fatalf("authorize denied app error = %v", err)
	}
}

func TestAppAccessPolicyRequiresAllowedMatchWhenConfigured(t *testing.T) {
	policy := appAccessPolicy{
		allowed: map[string]struct{}{"notepad": {}},
		denied:  map[string]struct{}{},
	}

	if err := policy.authorize(appDescriptor{Name: "notepad", PID: 42}); err != nil {
		t.Fatalf("authorize allowed app: %v", err)
	}
	err := policy.authorize(appDescriptor{Name: "calc", PID: 43})
	if err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("authorize unlisted app error = %v", err)
	}
}

func TestLoadAppAccessPolicyReadsCodexHomeConfig(t *testing.T) {
	root := t.TempDir()
	configPath := filepath.Join(root, "computer-use", "config.toml")
	if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte("[apps]\nallowed = [\"notepad\"]\ndenied = [\"powershell.exe\"]\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_HOME", root)
	t.Setenv(appPolicyEnvPath, "")
	t.Setenv(appPolicyEnvRequireApprovals, "")
	t.Setenv(appPolicyEnvAllowUnapproved, "")

	policy := loadAppAccessPolicy()
	if _, ok := policy.allowed["notepad"]; !ok {
		t.Fatalf("allowed policy missing notepad: %#v", policy.allowed)
	}
	if _, ok := policy.denied["powershell"]; !ok {
		t.Fatalf("denied policy missing powershell: %#v", policy.denied)
	}
}

func TestNormalizeAppIdentifier(t *testing.T) {
	for input, want := range map[string]string{
		`C:\Windows\System32\notepad.exe`: "notepad",
		`"Code.exe"`:                      "code",
		` powershell `:                    "powershell",
	} {
		if got := normalizeAppIdentifier(input); got != want {
			t.Fatalf("normalizeAppIdentifier(%q) = %q, want %q", input, got, want)
		}
	}
}
