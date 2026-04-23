import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { PersonalizationSettingsSection } from "./PersonalizationSettingsSection";

const USER_FILE = "C:/Users/Administrator/.codex/AGENTS.md";
const MANAGED_PROMPT_PATH = "~/.codex/prompts/codex-app-plus/system-prompt.md";

function createSnapshot(overrides?: Partial<Record<string, unknown>>) {
  return {
    config: {
      personality: "friendly",
      ...overrides
    },
    origins: {},
    layers: [
      {
        name: { type: "user", file: "C:/Users/Administrator/.codex/config.toml" },
        version: "u1",
        config: {},
        disabledReason: null,
      },
    ]
  };
}

function createInstructionsResult(content = "默认先给结论。") {
  return {
    path: USER_FILE,
    content
  };
}

function createManagedPromptResult(overrides?: Partial<{
  readonly name: string;
  readonly path: string;
  readonly content: string;
}>) {
  return {
    name: "system-prompt",
    path: MANAGED_PROMPT_PATH,
    content: "始终使用中文回答。",
    ...overrides,
  };
}

function createProps(
  overrides: Partial<ComponentProps<typeof PersonalizationSettingsSection>> = {},
): ComponentProps<typeof PersonalizationSettingsSection> {
  return {
    configSnapshot: createSnapshot(),
    busy: false,
    writeConfigValue: vi.fn().mockResolvedValue({}),
    readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
    listManagedPrompts: vi.fn().mockResolvedValue([]),
    upsertManagedPrompt: vi.fn().mockResolvedValue(createManagedPromptResult()),
    deleteManagedPrompt: vi.fn().mockResolvedValue(undefined),
    setUserModelInstructionsFile: vi.fn().mockResolvedValue(undefined),
    refreshConfigSnapshot: vi.fn().mockResolvedValue({ config: {}, origins: {}, layers: [] }),
    writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
    ...overrides,
  };
}

function renderSection(
  props: ComponentProps<typeof PersonalizationSettingsSection>,
  locale: Locale = "zh-CN"
) {
  return render(<PersonalizationSettingsSection {...props} />, {
    wrapper: createI18nWrapper(locale)
  });
}

describe("PersonalizationSettingsSection", () => {
  it("renders Codex global AGENTS instructions and personality", async () => {
    renderSection(createProps());

    expect(await screen.findByDisplayValue("默认先给结论。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答风格：友好" })).toBeInTheDocument();
    expect(
      screen.getByText("当前回答风格与 Codex 全局 `personality` 配置一致：友好、自然。")
    ).toBeInTheDocument();
  });

  it("writes the selected personality back to the user config", async () => {
    const writeConfigValue = vi.fn().mockResolvedValue({});

    renderSection(createProps({
      writeConfigValue,
    }));

    await screen.findByDisplayValue("默认先给结论。");
    fireEvent.click(screen.getByRole("button", { name: "回答风格：友好" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "务实" }));

    await waitFor(() => expect(writeConfigValue).toHaveBeenCalled());
    expect(writeConfigValue).toHaveBeenCalledWith({
      keyPath: "personality",
      value: "pragmatic",
      mergeStrategy: "replace",
      filePath: "C:/Users/Administrator/.codex/config.toml",
      expectedVersion: "u1",
    });
    expect(screen.getByRole("button", { name: "回答风格：务实" })).toBeInTheDocument();
    expect(screen.getByText("已同步到 Codex App Plus 的 config.toml。")).toBeInTheDocument();
  });

  it("writes instructions back to the user AGENTS file", async () => {
    const writeGlobalAgentInstructions = vi.fn().mockResolvedValue(createInstructionsResult("回答前先总结风险。"));

    renderSection(createProps({
      writeGlobalAgentInstructions
    }));

    await screen.findByDisplayValue("默认先给结论。");
    fireEvent.change(screen.getByLabelText("自定义指令"), { target: { value: "回答前先总结风险。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(writeGlobalAgentInstructions).toHaveBeenCalled());
    expect(writeGlobalAgentInstructions).toHaveBeenCalledWith({
      content: "回答前先总结风险。"
    });
    expect(screen.getByText("已同步到 Codex 全局 AGENTS.md。")).toBeInTheDocument();
  });

  it("keeps an empty AGENTS file editable after load", async () => {
    renderSection(createProps({
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult("")),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult("补充规则")),
    }));

    const textarea = await screen.findByLabelText("自定义指令");
    const saveButton = screen.getByRole("button", { name: "保存" });

    expect(textarea).toHaveValue("");
    expect(textarea).not.toBeDisabled();
    expect(saveButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "补充规则" } });

    expect(saveButton).not.toBeDisabled();
  });

  it("surfaces instruction save errors instead of swallowing them", async () => {
    const writeGlobalAgentInstructions = vi.fn().mockRejectedValue(new Error("写入失败"));

    renderSection(createProps({
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult("旧值")),
      writeGlobalAgentInstructions
    }));

    await screen.findByDisplayValue("旧值");
    fireEvent.change(screen.getByLabelText("自定义指令"), { target: { value: "新值" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("写入失败")).toBeInTheDocument();
  });

  it("surfaces personality write errors and restores the previous selection", async () => {
    const writeConfigValue = vi.fn().mockRejectedValue(new Error("写入 personality 失败"));

    renderSection(createProps({
      writeConfigValue,
    }));

    await screen.findByDisplayValue("默认先给结论。");
    fireEvent.click(screen.getByRole("button", { name: "回答风格：友好" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "默认" }));

    expect(await screen.findByText("写入 personality 失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答风格：友好" })).toBeInTheDocument();
  });

  it("applies a managed prompt by writing model_instructions_file", async () => {
    const setUserModelInstructionsFile = vi.fn().mockResolvedValue(undefined);
    const refreshConfigSnapshot = vi.fn().mockResolvedValue({ config: {}, origins: {}, layers: [] });

    renderSection(createProps({
      configSnapshot: createSnapshot({ model_instructions_file: null }),
      setUserModelInstructionsFile,
      refreshConfigSnapshot,
      listManagedPrompts: vi.fn().mockResolvedValue([
        createManagedPromptResult(),
      ]),
    }));

    expect(await screen.findByText("system-prompt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "应用 system-prompt" }));

    await waitFor(() =>
      expect(setUserModelInstructionsFile).toHaveBeenCalledWith(MANAGED_PROMPT_PATH),
    );
    expect(refreshConfigSnapshot).toHaveBeenCalled();
    expect(screen.getByText(`已应用 Prompt，并同步配置到 ${MANAGED_PROMPT_PATH}。`)).toBeInTheDocument();
  });

  it("opens a prompt dialog for create, supports cancel, and saves", async () => {
    const upsertManagedPrompt = vi.fn().mockResolvedValue(createManagedPromptResult({
      name: "project-guide",
      path: "~/.codex/prompts/codex-app-plus/project-guide.md",
      content: "始终先给结论。",
    }));

    renderSection(createProps({
      upsertManagedPrompt,
    }));

    await screen.findByDisplayValue("默认先给结论。");
    fireEvent.click(screen.getByRole("button", { name: "新建 Prompt" }));

    const createDialog = screen.getByRole("dialog", { name: "新建 Prompt" });
    expect(createDialog).toBeInTheDocument();
    fireEvent.change(within(createDialog).getByLabelText("Prompt 名称"), { target: { value: "project-guide" } });
    fireEvent.change(within(createDialog).getByLabelText("Prompt 内容"), { target: { value: "始终先给结论。" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "新建 Prompt" })).not.toBeInTheDocument();
    expect(upsertManagedPrompt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "新建 Prompt" }));
    const saveDialog = screen.getByRole("dialog", { name: "新建 Prompt" });
    fireEvent.change(within(saveDialog).getByLabelText("Prompt 名称"), { target: { value: "project-guide" } });
    fireEvent.change(within(saveDialog).getByLabelText("Prompt 内容"), { target: { value: "始终先给结论。" } });
    fireEvent.click(within(saveDialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(upsertManagedPrompt).toHaveBeenCalledWith({
      previousName: null,
      name: "project-guide",
      content: "始终先给结论。",
    }));
    expect(screen.getByText("Prompt 已保存。")).toBeInTheDocument();
  });

  it("renders row actions and edits a prompt through the dialog", async () => {
    const upsertManagedPrompt = vi.fn().mockResolvedValue(createManagedPromptResult({
      content: "更新后的 Prompt。",
    }));

    renderSection(createProps({
      listManagedPrompts: vi.fn().mockResolvedValue([
        createManagedPromptResult(),
      ]),
      upsertManagedPrompt,
    }));

    expect(await screen.findByText("system-prompt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用 system-prompt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 system-prompt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 system-prompt" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑 system-prompt" }));
    const editDialog = screen.getByRole("dialog", { name: "编辑 Prompt" });
    expect(editDialog).toBeInTheDocument();
    fireEvent.change(within(editDialog).getByLabelText("Prompt 内容"), { target: { value: "更新后的 Prompt。" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(upsertManagedPrompt).toHaveBeenCalledWith({
      previousName: "system-prompt",
      name: "system-prompt",
      content: "更新后的 Prompt。",
    }));
  });

  it("deletes a prompt from the row action", async () => {
    const deleteManagedPrompt = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderSection(createProps({
      listManagedPrompts: vi.fn().mockResolvedValue([
        createManagedPromptResult(),
      ]),
      deleteManagedPrompt,
    }));

    expect(await screen.findByText("system-prompt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除 system-prompt" }));

    await waitFor(() => expect(deleteManagedPrompt).toHaveBeenCalledWith("system-prompt"));
    confirmSpy.mockRestore();
  });

  it("removes model_instructions_file when the custom prompt switch is turned off", async () => {
    const setUserModelInstructionsFile = vi.fn().mockResolvedValue(undefined);

    renderSection(createProps({
      configSnapshot: createSnapshot({ model_instructions_file: MANAGED_PROMPT_PATH }),
      setUserModelInstructionsFile,
      listManagedPrompts: vi.fn().mockResolvedValue([
        createManagedPromptResult(),
      ]),
    }));

    const toggle = await screen.findByRole("switch", { name: "启用自定义 Prompt" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => expect(setUserModelInstructionsFile).toHaveBeenCalledWith(null));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("已关闭自定义 Prompt，并清除相关配置。")).toBeInTheDocument();
  });

  it("enables the custom prompt switch by upserting model_instructions_file", async () => {
    const setUserModelInstructionsFile = vi.fn().mockResolvedValue(undefined);

    renderSection(createProps({
      configSnapshot: createSnapshot({ model_instructions_file: null }),
      setUserModelInstructionsFile,
      listManagedPrompts: vi.fn().mockResolvedValue([
        createManagedPromptResult(),
      ]),
    }));

    const toggle = await screen.findByRole("switch", { name: "启用自定义 Prompt" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(setUserModelInstructionsFile).toHaveBeenCalledWith(MANAGED_PROMPT_PATH),
    );
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  });

  it("renders English copy when locale is en-US", async () => {
    renderSection(createProps(), "en-US");

    expect(await screen.findByText("Personalization")).toBeInTheDocument();
    expect(screen.getByText("Response style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Response style：Friendly" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable custom prompt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
