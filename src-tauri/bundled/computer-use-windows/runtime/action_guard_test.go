package main

import (
	"strings"
	"testing"
)

func TestGuardElementActionBlocksDestructiveTargets(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardElementAction("click", appDescriptor{Name: "explorer", PID: 42}, &elementRecord{
		Index:                7,
		Name:                 "Delete permanently",
		LocalizedControlType: "button",
	})

	if err == nil || !strings.Contains(err.Error(), "delete") {
		t.Fatalf("guardElementAction error = %v", err)
	}
}

func TestGuardElementActionBlocksSensitiveTargets(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardElementAction("click", appDescriptor{Name: "browser", PID: 42}, &elementRecord{
		Index:       8,
		Name:        "Show password",
		IsSensitive: true,
	})

	if err == nil || !strings.Contains(err.Error(), "sensitive") {
		t.Fatalf("guardElementAction error = %v", err)
	}
}

func TestGuardTextActionBlocksSecretInput(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	for _, secret := range []string{
		"sk-test_abcdefghijklmnopqrstuvwxyz",
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
			err := guardTextAction(
				"type_text",
				appDescriptor{Name: "notepad", PID: 42},
				&appSnapshot{WindowTitle: "Notes"},
				nil,
				secret,
			)

			if err == nil || !strings.Contains(err.Error(), "secret") {
				t.Fatalf("guardTextAction(%q) error = %v", secret, err)
			}
		})
	}
}

func TestLooksLikeSecretInputDoesNotBlockNonLuhnNumber(t *testing.T) {
	if looksLikeSecretInput("order 4111 1111 1111 1112") {
		t.Fatal("non-Luhn card-shaped number should not be treated as secret")
	}
}

func TestLooksLikeSecretInputDoesNotBlockNonCardTimestamp(t *testing.T) {
	if looksLikeSecretInput("activate-paste-shortcut-test-1779705235340697000") {
		t.Fatal("Luhn-valid timestamp with a non-card prefix should not be treated as secret")
	}
}

func TestGuardScrollActionBlocksSensitiveSnapshots(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardScrollAction(appDescriptor{Name: "browser", PID: 42}, &appSnapshot{
		WindowTitle:       "Tokens",
		SensitiveRedacted: true,
	}, &elementRecord{
		Index:                1,
		Name:                 "Document",
		LocalizedControlType: "document",
	})

	if err == nil || !strings.Contains(err.Error(), "scrolling is blocked") {
		t.Fatalf("guardScrollAction error = %v", err)
	}
}

func TestGuardScrollActionBlocksSensitiveTargets(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardScrollAction(appDescriptor{Name: "browser", PID: 42}, &appSnapshot{
		WindowTitle: "Settings",
	}, &elementRecord{
		Index:       2,
		Name:        "API key list",
		IsSensitive: true,
	})

	if err == nil || !strings.Contains(err.Error(), "sensitive") {
		t.Fatalf("guardScrollAction error = %v", err)
	}
}

func TestGuardScrollActionAllowsOrdinaryScrollableTargets(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardScrollAction(appDescriptor{Name: "notepad", PID: 42}, &appSnapshot{
		WindowTitle: "Notes",
	}, &elementRecord{
		Index:                3,
		Name:                 "Document",
		LocalizedControlType: "document",
	})

	if err != nil {
		t.Fatalf("guardScrollAction should allow ordinary target: %v", err)
	}
}

func TestGuardKeyActionBlocksConfirmationOnRiskyDialog(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardKeyAction(appDescriptor{Name: "explorer", PID: 42}, &appSnapshot{
		WindowTitle: "Delete File",
		TreeLines:   []string{"\t4 button Permanently delete"},
	}, "Return")

	if err == nil || !strings.Contains(err.Error(), "confirmation key") {
		t.Fatalf("guardKeyAction error = %v", err)
	}
}

func TestGuardKeyActionBlocksWindowsGlobalShortcuts(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	for _, key := range []string{"super+r", "Win_L+l", "cmd+x", "alt+tab", "ctrl+esc", "ctrl+shift+esc"} {
		t.Run(key, func(t *testing.T) {
			err := guardKeyAction(appDescriptor{Name: "notepad", PID: 42}, &appSnapshot{
				WindowTitle: "Notes",
				TreeLines:   []string{"\t1 document Text editor"},
			}, key)

			if err == nil || !strings.Contains(err.Error(), "system/global shortcuts") {
				t.Fatalf("guardKeyAction(%q) error = %v", key, err)
			}
		})
	}
}

func TestGuardKeyActionOverrideAllowsWindowsGlobalShortcuts(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "1")

	err := guardKeyAction(appDescriptor{Name: "notepad", PID: 42}, &appSnapshot{
		WindowTitle: "Notes",
	}, "super+r")

	if err != nil {
		t.Fatalf("guardKeyAction with override: %v", err)
	}
}

func TestGuardKeyActionBlocksClipboardShortcutOnSensitiveSnapshot(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardKeyAction(appDescriptor{Name: "browser", PID: 42}, &appSnapshot{
		WindowTitle:       "Secrets",
		SensitiveRedacted: true,
	}, "ctrl+c")

	if err == nil || !strings.Contains(err.Error(), "clipboard and selection shortcuts") {
		t.Fatalf("guardKeyAction error = %v", err)
	}
}

func TestGuardKeyActionBlocksClipboardShortcutOnRiskySnapshot(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardKeyAction(appDescriptor{Name: "browser", PID: 42}, &appSnapshot{
		WindowTitle: "API keys",
		TreeLines:   []string{"\t1 button Copy password"},
	}, "Control_L+c")

	if err == nil || !strings.Contains(err.Error(), "clipboard and selection shortcut") {
		t.Fatalf("guardKeyAction error = %v", err)
	}
}

func TestGuardKeyActionAllowsClipboardShortcutOnOrdinarySnapshot(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardKeyAction(appDescriptor{Name: "notepad", PID: 42}, &appSnapshot{
		WindowTitle: "Notes",
		TreeLines:   []string{"\t1 document Text editor"},
	}, "ctrl+v")

	if err != nil {
		t.Fatalf("guardKeyAction should allow ordinary clipboard shortcut: %v", err)
	}
}

func TestGuardCoordinateActionBlocksRiskyScreens(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardCoordinateAction("click", appDescriptor{Name: "settings", PID: 42}, &appSnapshot{
		WindowTitle: "Recovery",
		TreeLines:   []string{"\t2 button Reset this PC"},
	})

	if err == nil || !strings.Contains(err.Error(), "coordinate actions") {
		t.Fatalf("guardCoordinateAction error = %v", err)
	}
}

func TestGuardCoordinateActionBlocksRiskyElementAtPoint(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardCoordinateAction("click", appDescriptor{Name: "explorer", PID: 42}, &appSnapshot{
		WindowTitle: "Files",
		Elements: []elementRecord{
			{Index: 1, Name: "Open", Frame: &frame{X: 0, Y: 0, Width: 60, Height: 30}},
			{Index: 2, Name: "Delete permanently", Frame: &frame{X: 80, Y: 0, Width: 120, Height: 30}},
		},
	}, coordinatePoint{x: 100, y: 10})

	if err == nil || !strings.Contains(err.Error(), "delete") {
		t.Fatalf("guardCoordinateAction error = %v", err)
	}
}

func TestGuardCoordinateActionAllowsSafeElementOnRiskyScreen(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardCoordinateAction("click", appDescriptor{Name: "explorer", PID: 42}, &appSnapshot{
		WindowTitle: "Files",
		TreeLines:   []string{"\t2 button Delete permanently"},
		Elements: []elementRecord{
			{Index: 1, Name: "Open", Frame: &frame{X: 0, Y: 0, Width: 60, Height: 30}},
			{Index: 2, Name: "Delete permanently", Frame: &frame{X: 80, Y: 0, Width: 120, Height: 30}},
		},
	}, coordinatePoint{x: 10, y: 10})

	if err != nil {
		t.Fatalf("guardCoordinateAction should allow safe hit target: %v", err)
	}
}

func TestGuardCoordinateActionBlocksUnknownTargetOnRiskyScreen(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardCoordinateAction("click", appDescriptor{Name: "explorer", PID: 42}, &appSnapshot{
		WindowTitle: "Files",
		TreeLines:   []string{"\t2 button Delete permanently"},
		Elements: []elementRecord{
			{Index: 1, Name: "Open", Frame: &frame{X: 0, Y: 0, Width: 60, Height: 30}},
		},
	}, coordinatePoint{x: 100, y: 100})

	if err == nil || !strings.Contains(err.Error(), "target is unknown") {
		t.Fatalf("guardCoordinateAction error = %v", err)
	}
}

func TestGuardElementActionBlocksConfirmationInRiskyContext(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardElementActionInSnapshot("click", appDescriptor{Name: "explorer", PID: 42}, &appSnapshot{
		WindowTitle: "Delete File",
		TreeLines:   []string{"\t1 text Delete selected file?", "\t2 button OK", "\t3 button Cancel"},
	}, &elementRecord{
		Index:                2,
		Name:                 "OK",
		LocalizedControlType: "button",
	})

	if err == nil || !strings.Contains(err.Error(), "confirmation control") {
		t.Fatalf("guardElementActionInSnapshot error = %v", err)
	}
}

func TestGuardElementActionAllowsCancelInRiskyContext(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardElementActionInSnapshot("click", appDescriptor{Name: "explorer", PID: 42}, &appSnapshot{
		WindowTitle: "Delete File",
		TreeLines:   []string{"\t1 text Delete selected file?", "\t2 button OK", "\t3 button Cancel"},
	}, &elementRecord{
		Index:                3,
		Name:                 "Cancel",
		LocalizedControlType: "button",
	})

	if err != nil {
		t.Fatalf("guardElementActionInSnapshot should allow cancel: %v", err)
	}
}

func TestActionGuardOverrideAllowsRiskyActions(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "1")

	err := guardElementAction("click", appDescriptor{Name: "explorer", PID: 42}, &elementRecord{
		Name: "Delete permanently",
	})

	if err != nil {
		t.Fatalf("guardElementAction with override: %v", err)
	}
}

func TestGuardDoesNotMatchEnglishRiskTermsInsideLongerWords(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardElementAction("click", appDescriptor{Name: "explorer", PID: 42}, &elementRecord{
		Name: "Pin to taskbar",
	})

	if err != nil {
		t.Fatalf("guardElementAction should allow ordinary pin action: %v", err)
	}
}

func TestGuardAllowsOrdinaryFormatMenu(t *testing.T) {
	t.Setenv(actionGuardEnvAllowRisky, "")

	err := guardCoordinateAction("click", appDescriptor{Name: "notepad", PID: 42}, &appSnapshot{
		WindowTitle: "Untitled - Notepad",
		TreeLines:   []string{"\t5 menuitem Format"},
	})

	if err != nil {
		t.Fatalf("guardCoordinateAction should allow ordinary format menu: %v", err)
	}
}
