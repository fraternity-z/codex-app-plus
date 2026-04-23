import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { ComposerModelOption } from "../model/composerPreferences";
import { ComposerModelControls } from "./ComposerModelControls";

function createModel(value: string, label: string): ComposerModelOption {
  return {
    id: value,
    value,
    label,
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    isDefault: false
  };
}

const MODELS: ReadonlyArray<ComposerModelOption> = [
  createModel("gpt-5.3-codex", "GPT-5.3-Codex"),
  createModel("gpt-5.2", "GPT-5.2"),
  createModel("gpt-5.1", "GPT-5.1"),
  createModel("gpt-5", "GPT-5"),
  createModel("o3", "o3"),
  createModel("o1", "o1")
];

describe("ComposerModelControls", () => {
  it("shows the latest five models first and reveals the rest in extra models", () => {
    render(
      <ComposerModelControls
        models={MODELS}
        selectedModel={null}
        selectedEffort="high"
        supportedEfforts={["low", "medium", "high", "xhigh"]}
        onSelectModel={vi.fn()}
        onSelectEffort={vi.fn()}
      />,
      { wrapper: createI18nWrapper() },
    );

    fireEvent.click(screen.getByRole("button", { name: /选择模型/ }));

    expect(screen.getByRole("menuitemradio", { name: "gpt-5.5" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "gpt-5.4" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "gpt-5.4-mini" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "GPT-5.3-Codex" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "GPT-5.2" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "GPT-5.1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "o3" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /额外模型/ }));

    expect(screen.getByRole("menuitemradio", { name: "GPT-5.1" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "GPT-5" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "o3" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "o1" })).toBeInTheDocument();
  });

  it("shows four effort levels for gpt-5.5 only", () => {
    render(
      <ComposerModelControls
        models={MODELS}
        selectedModel="gpt-5.5"
        selectedEffort="high"
        supportedEfforts={["low", "medium", "high", "xhigh"]}
        onSelectModel={vi.fn()}
        onSelectEffort={vi.fn()}
      />,
      { wrapper: createI18nWrapper() },
    );

    fireEvent.click(screen.getByRole("button", { name: /选择推理强度/ }));

    expect(screen.getByRole("menuitemradio", { name: "低" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "中" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "高" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "超高" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "极低" })).not.toBeInTheDocument();
  });
});
