import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { PersonalizationSettingsSection } from "./PersonalizationSettingsSection";

const USER_FILE = "C:/Users/Administrator/.codex/AGENTS.md";

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
    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue: vi.fn().mockResolvedValue({}),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult())
    });

    expect(await screen.findByDisplayValue("默认先给结论。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答风格：友好" })).toBeInTheDocument();
    expect(
      screen.getByText("当前回答风格与 Codex 全局 `personality` 配置一致：友好、自然。")
    ).toBeInTheDocument();
  });

  it("writes the selected personality back to the user config", async () => {
    const writeConfigValue = vi.fn().mockResolvedValue({});

    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue,
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult())
    });

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
    expect(screen.getByText("已同步到 Codex 全局 config.toml。")).toBeInTheDocument();
  });

  it("writes instructions back to the user AGENTS file", async () => {
    const writeGlobalAgentInstructions = vi.fn().mockResolvedValue(createInstructionsResult("回答前先总结风险。"));

    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue: vi.fn().mockResolvedValue({}),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
      writeGlobalAgentInstructions
    });

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
    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue: vi.fn().mockResolvedValue({}),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult("")),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult("补充规则"))
    });

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

    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue: vi.fn().mockResolvedValue({}),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult("旧值")),
      writeGlobalAgentInstructions
    });

    await screen.findByDisplayValue("旧值");
    fireEvent.change(screen.getByLabelText("自定义指令"), { target: { value: "新值" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("写入失败")).toBeInTheDocument();
  });

  it("surfaces personality write errors and restores the previous selection", async () => {
    const writeConfigValue = vi.fn().mockRejectedValue(new Error("写入 personality 失败"));

    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue,
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult())
    });

    await screen.findByDisplayValue("默认先给结论。");
    fireEvent.click(screen.getByRole("button", { name: "回答风格：友好" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "默认" }));

    expect(await screen.findByText("写入 personality 失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答风格：友好" })).toBeInTheDocument();
  });

  it("renders English copy when locale is en-US", async () => {
    renderSection({
      configSnapshot: createSnapshot(),
      busy: false,
      writeConfigValue: vi.fn().mockResolvedValue({}),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult()),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue(createInstructionsResult())
    }, "en-US");

    expect(await screen.findByText("Personalization")).toBeInTheDocument();
    expect(screen.getByText("Response style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Response style：Friendly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
