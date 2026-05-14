import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComposerModelOption } from "../model/composerPreferences";
import { useComposerSelection } from "./useComposerSelection";

const MODELS: ReadonlyArray<ComposerModelOption> = [
  {
    id: "model-1",
    value: "gpt-5.5",
    label: "gpt-5.5",
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
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

    expect(result.current.selectedModel).toBe("gpt-5.5");
    expect(result.current.selectedEffort).toBe("high");
    expect(result.current.selectedServiceTier).toBeNull();
    expect(result.current.selectedModelOption?.value).toBe("gpt-5.5");
  });

  it("preserves a local speed override across unrelated config refreshes", () => {
    const { result, rerender } = renderHook(
      ({ defaultModel, defaultServiceTier }) => useComposerSelection(MODELS, defaultModel, "high", defaultServiceTier),
      { initialProps: { defaultModel: "gpt-5.5", defaultServiceTier: null as "fast" | null } }
    );

    act(() => result.current.selectServiceTier("fast"));

    rerender({ defaultModel: "gpt-5.4", defaultServiceTier: null });

    expect(result.current.selectedModel).toBe("gpt-5.4");
    expect(result.current.selectedServiceTier).toBe("fast");
  });

  it("follows external speed defaults when there is no local override", () => {
    const { result, rerender } = renderHook(
      ({ defaultServiceTier }) => useComposerSelection(MODELS, "gpt-5.5", "high", defaultServiceTier),
      { initialProps: { defaultServiceTier: null as "fast" | null } }
    );

    rerender({ defaultServiceTier: "fast" });

    expect(result.current.selectedServiceTier).toBe("fast");
  });
});
