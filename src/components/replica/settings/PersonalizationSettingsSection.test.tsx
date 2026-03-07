import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonalizationSettingsSection } from "./PersonalizationSettingsSection";

const USER_FILE = "C:/Users/Administrator/.codex/AGENTS.md";

function createSnapshot(overrides?: Partial<Record<string, unknown>>) {
  return {
    config: {
      personality: "friendly",
      ...overrides
    },
    origins: {},
    layers: []
  };
}

function createInstructionsResult(content = "默认先给结论。") {
  return {
    path: USER_FILE,
    content
  };
}

describe("PersonalizationSettingsSection", () => {
  it("renders Codex global AGENTS instructions and personality", async () => {
    render(
      <PersonalizationSettingsSection
        configSnapshot={createSnapshot()}
        busy={false}
        readGlobalAgentInstructions={vi.fn().mockResolvedValue(createInstructionsResult())}
        writeGlobalAgentInstructions={vi.fn().mockResolvedValue(createInstructionsResult())}
      />
    );

    expect(await screen.findByDisplayValue("默认先给结论。")).toBeInTheDocument();
    expect(screen.getByText("友好")).toBeInTheDocument();
    expect(
      screen.getByText("当前回答风格与 Codex 全局 `personality` 配置一致：友好、自然。")
    ).toBeInTheDocument();
  });

  it("writes instructions back to the user AGENTS file", async () => {
    const writeGlobalAgentInstructions = vi.fn().mockResolvedValue(createInstructionsResult("回答前先总结风险。"));

    render(
      <PersonalizationSettingsSection
        configSnapshot={createSnapshot()}
        busy={false}
        readGlobalAgentInstructions={vi.fn().mockResolvedValue(createInstructionsResult())}
        writeGlobalAgentInstructions={writeGlobalAgentInstructions}
      />
    );

    await screen.findByDisplayValue("默认先给结论。");
    fireEvent.change(screen.getByLabelText("自定义指令"), { target: { value: "回答前先总结风险。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(writeGlobalAgentInstructions).toHaveBeenCalled());
    expect(writeGlobalAgentInstructions).toHaveBeenCalledWith({
      content: "回答前先总结风险。"
    });
    expect(screen.getByText("已同步到 Codex 全局 AGENTS.md。")).toBeInTheDocument();
  });

  it("surfaces load and save errors instead of swallowing them", async () => {
    const writeGlobalAgentInstructions = vi.fn().mockRejectedValue(new Error("写入失败"));

    render(
      <PersonalizationSettingsSection
        configSnapshot={createSnapshot()}
        busy={false}
        readGlobalAgentInstructions={vi.fn().mockResolvedValue(createInstructionsResult("旧值"))}
        writeGlobalAgentInstructions={writeGlobalAgentInstructions}
      />
    );

    await screen.findByDisplayValue("旧值");
    fireEvent.change(screen.getByLabelText("自定义指令"), { target: { value: "新值" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("写入失败")).toBeInTheDocument();
  });
});
