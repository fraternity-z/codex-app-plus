import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedTheme } from "../../../domain/theme";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferencesController,
} from "../hooks/useAppPreferences";
import { updateAppearanceColorScheme } from "../model/appearanceColorScheme";
import { clampContrast } from "../model/appearancePreferences";
import {
  clampCodeFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeUiFontFamily,
} from "../model/fontPreferences";
import { CodexPetLayer } from "../../pets/ui/CodexPetLayer";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";

function renderSection(
  locale: Locale = "zh-CN",
  resolvedTheme: ResolvedTheme = "light",
  overrides: Partial<{
    readonly listCustomPets: ComponentProps<typeof AppearanceSettingsSection>["listCustomPets"];
    readonly openCustomPetsFolder: ComponentProps<typeof AppearanceSettingsSection>["openCustomPetsFolder"];
  }> = {},
): void {
  const listCustomPets = overrides.listCustomPets ?? vi.fn().mockResolvedValue({
    avatarDirectory: "C:\\Users\\Administrator\\.codex\\pets",
    avatars: [],
  });
  const openCustomPetsFolder = overrides.openCustomPetsFolder ?? vi.fn().mockResolvedValue(undefined);

  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
    const [petAwake, setPetAwake] = useState(false);
    const controller: AppPreferencesController = {
      ...preferences,
      setAgentEnvironment: (agentEnvironment) =>
        setPreferences((current) => ({ ...current, agentEnvironment })),
      setWorkspaceOpener: (workspaceOpener) =>
        setPreferences((current) => ({ ...current, workspaceOpener })),
      setEmbeddedTerminalShell: (embeddedTerminalShell) =>
        setPreferences((current) => ({ ...current, embeddedTerminalShell })),
      setEmbeddedTerminalUtf8: (embeddedTerminalUtf8) =>
        setPreferences((current) => ({ ...current, embeddedTerminalUtf8 })),
      setNotificationDeliveryMode: (notificationDeliveryMode) =>
        setPreferences((current) => ({ ...current, notificationDeliveryMode })),
      setNotificationTriggerMode: (notificationTriggerMode) =>
        setPreferences((current) => ({ ...current, notificationTriggerMode })),
      setSubagentNotificationsEnabled: (subagentNotificationsEnabled) =>
        setPreferences((current) => ({ ...current, subagentNotificationsEnabled })),
      setThemeMode: (themeMode) =>
        setPreferences((current) => ({ ...current, themeMode })),
      setUiLanguage: (uiLanguage) =>
        setPreferences((current) => ({ ...current, uiLanguage })),
      setThreadDetailLevel: (threadDetailLevel) =>
        setPreferences((current) => ({ ...current, threadDetailLevel })),
      setFollowUpQueueMode: (followUpQueueMode) =>
        setPreferences((current) => ({ ...current, followUpQueueMode })),
      setComposerEnterBehavior: (composerEnterBehavior) =>
        setPreferences((current) => ({ ...current, composerEnterBehavior })),
      setComposerPermissionLevel: (composerPermissionLevel) =>
        setPreferences((current) => ({ ...current, composerPermissionLevel })),
      setComposerDefaultApprovalPolicy: (composerDefaultApprovalPolicy) =>
        setPreferences((current) => ({ ...current, composerDefaultApprovalPolicy })),
      setComposerDefaultSandboxMode: (composerDefaultSandboxMode) =>
        setPreferences((current) => ({ ...current, composerDefaultSandboxMode })),
      setComposerFullApprovalPolicy: (composerFullApprovalPolicy) =>
        setPreferences((current) => ({ ...current, composerFullApprovalPolicy })),
      setComposerFullSandboxMode: (composerFullSandboxMode) =>
        setPreferences((current) => ({ ...current, composerFullSandboxMode })),
      setUiFontFamily: (uiFontFamily) =>
        setPreferences((current) => ({
          ...current,
          uiFontFamily: normalizeUiFontFamily(uiFontFamily),
        })),
      setUiFontSize: (uiFontSize) =>
        setPreferences((current) => ({
          ...current,
          uiFontSize: clampUiFontSize(uiFontSize),
        })),
      setCodeFontFamily: (codeFontFamily) =>
        setPreferences((current) => ({
          ...current,
          codeFontFamily: normalizeCodeFontFamily(codeFontFamily),
        })),
      setCodeFontSize: (codeFontSize) =>
        setPreferences((current) => ({
          ...current,
          codeFontSize: clampCodeFontSize(codeFontSize),
        })),
      setGitBranchPrefix: (gitBranchPrefix) =>
        setPreferences((current) => ({ ...current, gitBranchPrefix })),
      setGitPushForceWithLease: (gitPushForceWithLease) =>
        setPreferences((current) => ({ ...current, gitPushForceWithLease })),
      setGitCommitInstructions: (gitCommitInstructions) =>
        setPreferences((current) => ({ ...current, gitCommitInstructions })),
      setGitPullRequestMergeMethod: (gitPullRequestMergeMethod) =>
        setPreferences((current) => ({ ...current, gitPullRequestMergeMethod })),
      setGitDraftPullRequest: (gitDraftPullRequest) =>
        setPreferences((current) => ({ ...current, gitDraftPullRequest })),
      setGitAutoDeleteWorktrees: (gitAutoDeleteWorktrees) =>
        setPreferences((current) => ({ ...current, gitAutoDeleteWorktrees })),
      setGitAutoDeleteRetention: (gitAutoDeleteRetention) =>
        setPreferences((current) => ({ ...current, gitAutoDeleteRetention })),
      setGitPullRequestInstructions: (gitPullRequestInstructions) =>
        setPreferences((current) => ({ ...current, gitPullRequestInstructions })),
      setContrast: (contrast) =>
        setPreferences((current) => ({
          ...current,
          contrast: clampContrast(contrast),
        })),
      setAppearanceThemeColors: (theme, colors) =>
        setPreferences((current) => ({
          ...current,
          appearanceColors: updateAppearanceColorScheme(
            current.appearanceColors,
            theme,
            colors,
          ),
        })),
      setCodeStyle: (codeStyle) =>
        setPreferences((current) => ({ ...current, codeStyle })),
      setSelectedPetId: (selectedPetId) =>
        setPreferences((current) => ({ ...current, selectedPetId })),
    };

    return (
      <>
      <AppearanceSettingsSection
        busy={false}
        preferences={controller}
        resolvedTheme={resolvedTheme}
        petAwake={petAwake}
        listCustomPets={listCustomPets}
        openCustomPetsFolder={openCustomPetsFolder}
        onTogglePetAwake={() => setPetAwake((current) => !current)}
      />
      <CodexPetLayer
        awake={petAwake}
        selectedPetId={controller.selectedPetId}
        listCustomPets={listCustomPets}
        onClose={() => setPetAwake(false)}
      />
      </>
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(locale) });
}

describe("AppearanceSettingsSection", () => {
  it("renders the custom appearance controls for the light theme", () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByText("代码风格")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "代码风格：Codex" })).toBeInTheDocument();
    expect(document.querySelector('.code-style-preview[data-code-style="codex"]')).not.toBeNull();
    expect(document.querySelectorAll(".code-style-preview-row-delete")).toHaveLength(3);
    expect(document.querySelectorAll(".code-style-preview-row-add")).toHaveLength(3);
    expect(screen.getByText("当前正在编辑浅色主题颜色。")).toBeInTheDocument();
    expect(screen.getByLabelText("背景色")).toHaveValue("#FFFFFF");
  });

  it("switches displayed colors when selecting dark mode", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /深色/ }));

    expect(screen.getByText("当前正在编辑深色主题颜色。")).toBeInTheDocument();
    expect(screen.getByLabelText("背景色")).toHaveValue("#111111");
    expect(screen.getByLabelText("前景色")).toHaveValue("#FCFCFC");
  });

  it("updates the theme chip state after selecting light mode", () => {
    renderSection("zh-CN", "dark");

    fireEvent.click(screen.getByRole("button", { name: /浅色/ }));

    expect(screen.getByRole("button", { name: /浅色/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /深色/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("updates the displayed font family inputs", () => {
    renderSection();

    const uiFontInput = screen.getByRole("textbox", { name: "界面字体" });
    const codeFontInput = screen.getByRole("textbox", { name: "代码字体" });

    fireEvent.change(uiFontInput, { target: { value: "IBM Plex Sans" } });
    fireEvent.change(codeFontInput, { target: { value: "JetBrains Mono" } });

    expect(uiFontInput).toHaveValue("IBM Plex Sans");
    expect(codeFontInput).toHaveValue("JetBrains Mono");
  });

  it("clamps font sizes during input updates", () => {
    renderSection();

    const uiFontSizeInput = screen.getByRole("spinbutton", { name: "界面字号" });
    const codeFontSizeInput = screen.getByRole("spinbutton", { name: "代码字号" });

    fireEvent.change(uiFontSizeInput, { target: { value: "4" } });
    fireEvent.change(codeFontSizeInput, { target: { value: "99" } });

    expect(uiFontSizeInput).toHaveValue(12);
    expect(codeFontSizeInput).toHaveValue(18);
  });

  it("keeps a partial color draft until blur and then restores the saved value", () => {
    renderSection();

    const input = screen.getByRole("textbox", { name: "强调色" });

    fireEvent.change(input, {
      target: { value: "#12" },
    });

    expect(input).toHaveValue("#12");

    fireEvent.blur(input);

    expect(input).toHaveValue("#0169CC");
  });

  it("commits a valid color draft on blur", () => {
    renderSection();

    const input = screen.getByRole("textbox", { name: "强调色" });
    const pickerInput = document.querySelector<HTMLInputElement>(".color-picker-input");

    fireEvent.change(input, {
      target: { value: "#123456" },
    });

    expect(input).toHaveValue("#123456");
    expect(pickerInput?.value.toUpperCase()).toBe("#0169CC");

    fireEvent.blur(input);

    expect(input).toHaveValue("#123456");
    expect(pickerInput?.value.toUpperCase()).toBe("#123456");
  });

  it("opens the color picker from the swatch button and syncs picker updates", () => {
    renderSection();

    const pickerButton = screen.getByRole("button", { name: "强调色 调色盘" });
    const pickerInput = document.querySelector<HTMLInputElement>(".color-picker-input");
    expect(pickerInput).not.toBeNull();

    const clickSpy = vi.spyOn(pickerInput!, "click");
    fireEvent.click(pickerButton);
    expect(clickSpy).toHaveBeenCalled();

    fireEvent.change(pickerInput!, {
      target: { value: "#abcdef" },
    });

    expect(screen.getByRole("textbox", { name: "强调色" })).toHaveValue("#ABCDEF");
    expect(pickerInput?.value.toUpperCase()).toBe("#ABCDEF");
  });

  it("updates contrast inputs", () => {
    renderSection();

    fireEvent.change(screen.getByRole("slider", { name: "对比度" }), {
      target: { value: "77" },
    });

    expect(screen.getByRole("slider", { name: "对比度" })).toHaveValue("77");
    expect(screen.getByText("77")).toBeInTheDocument();
  });

  it("renders English copy when locale is en-US", () => {
    renderSection("en-US", "dark");

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByText("Code style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Code style：Codex" })).toBeInTheDocument();
    expect(screen.getByText("You're editing the dark theme colors.")).toBeInTheDocument();
    expect(screen.getByLabelText("Background")).toHaveValue("#111111");
  });

  it("renders the official pet picker at the bottom and saves selected pet ids", async () => {
    const listCustomPets = vi.fn().mockResolvedValue({
      avatarDirectory: "C:\\Users\\Administrator\\.codex\\pets",
      avatars: [
        {
          id: "custom:001",
          displayName: "001",
          description: "A tiny snow-star companion.",
          spritesheetDataUrl: "data:image/webp;base64,abc",
        },
      ],
    });

    renderSection("zh-CN", "light", { listCustomPets });

    const petHeader = screen.getByRole("button", { name: /宠物/ });
    const fontSizeLabel = screen.getByText("代码字号");
    expect(
      Boolean(fontSizeLabel.compareDocumentPosition(petHeader) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    fireEvent.click(petHeader);

    expect(await screen.findByText("The original Codex companion.")).toBeInTheDocument();
    expect(screen.getByText("A tiny snow-star companion.")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Administrator\\.codex\\pets")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择 Dewey" }));

    expect(screen.getByText("已选择 Dewey")).toBeInTheDocument();
  });

  it("moves the floating pet close action into the right-click menu", () => {
    renderSection("zh-CN", "light");

    fireEvent.click(screen.getByRole("button", { name: /宠物/ }));
    fireEvent.click(screen.getByRole("button", { name: "唤醒宠物" }));

    const overlay = document.querySelector<HTMLElement>(".codex-pet-overlay");
    expect(overlay).not.toBeNull();
    expect(document.querySelector(".codex-pet-overlay-close")).toBeNull();

    fireEvent.contextMenu(overlay!, { clientX: 160, clientY: 120 });
    fireEvent.click(screen.getByRole("menuitem", { name: "隐藏宠物" }));

    expect(document.querySelector(".codex-pet-overlay")).toBeNull();
  });

  it("lets the floating pet be dragged and animates toward the drag direction", () => {
    renderSection("zh-CN", "light");

    fireEvent.click(screen.getByRole("button", { name: /宠物/ }));
    fireEvent.click(screen.getByRole("button", { name: "唤醒宠物" }));

    const overlay = document.querySelector<HTMLElement>(".codex-pet-overlay");
    expect(overlay).not.toBeNull();
    const avatar = overlay!.querySelector<HTMLElement>(".codex-pet-overlay-avatar");
    expect(avatar).not.toBeNull();

    const initialLeft = Number.parseFloat(overlay!.style.left);

    fireEvent.mouseDown(overlay!, {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.mouseMove(overlay!, {
      clientX: 60,
      clientY: 104,
    });

    expect(Number.parseFloat(overlay!.style.left)).toBeLessThan(initialLeft);
    expect(avatar).toHaveAttribute("data-pet-state", "running-left");

    fireEvent.mouseUp(overlay!, {
      clientX: 60,
      clientY: 104,
    });

    expect(avatar).toHaveAttribute("data-pet-state", "idle");
  });
});
