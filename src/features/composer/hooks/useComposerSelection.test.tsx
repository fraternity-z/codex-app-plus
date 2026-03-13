import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComposerModelOption } from "../model/composerPreferences";
import { useComposerSelection } from "./useComposerSelection";

const MODELS: ReadonlyArray<ComposerModelOption> = [
  {
    id: "model-1",
    value: "gpt-5.2",
    label: "GPT-5.2",
    defaultEffort: "medium",
    supportedEfforts: ["low", "medium"],
    isDefault: true
  }
];

describe("useComposerSelection", () => {
  it("preserves an unknown configured model after the model list loads", () => {
    const { result, rerender } = renderHook(
      ({ models }) => useComposerSelection(models, "custom-model", "high"),
      { initialProps: { models: [] as ReadonlyArray<ComposerModelOption> } }
    );

    expect(result.current.selectedModel).toBe("custom-model");
    expect(result.current.selectedEffort).toBe("high");
    expect(result.current.selectedServiceTier).toBeNull();

    rerender({ models: MODELS });

    expect(result.current.selectedModel).toBe("custom-model");
    expect(result.current.selectedEffort).toBe("high");
    expect(result.current.selectedServiceTier).toBeNull();
    expect(result.current.selectedModelOption).toBeNull();
  });

  it("falls back to the default listed model only when config has no model", () => {
    const { result } = renderHook(() => useComposerSelection(MODELS, null, null));

    expect(result.current.selectedModel).toBe("gpt-5.2");
    expect(result.current.selectedEffort).toBe("medium");
    expect(result.current.selectedServiceTier).toBeNull();
    expect(result.current.selectedModelOption?.value).toBe("gpt-5.2");
  });
});
