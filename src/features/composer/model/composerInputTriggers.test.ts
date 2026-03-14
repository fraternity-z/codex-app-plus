import { describe, expect, it } from "vitest";
import { createComposerFuzzySessionId, isComposerFuzzySessionId } from "../service/composerCommandBridge";
import { getActiveComposerTrigger, replaceComposerTrigger } from "./composerInputTriggers";

describe("composerInputTriggers", () => {
  it("detects slash commands only from the current line start", () => {
    expect(getActiveComposerTrigger("/model", 6)).toEqual({ kind: "slash", query: "model", range: { start: 0, end: 6 } });
    expect(getActiveComposerTrigger("/rename 修复命令", 12)).toEqual({ kind: "slash", query: "rename 修复命令", range: { start: 0, end: 12 } });
    expect(getActiveComposerTrigger("hello /model", 12)).toBeNull();
  });

  it("detects mentions after whitespace", () => {
    expect(getActiveComposerTrigger("inspect @src/App.tsx", 20)).toEqual({ kind: "mention", query: "src/App.tsx", range: { start: 8, end: 20 } });
    expect(getActiveComposerTrigger("email@test", 10)).toBeNull();
  });

  it("removes trigger text and collapses adjacent spaces", () => {
    expect(replaceComposerTrigger("inspect @src and", { start: 8, end: 12 }, "")).toEqual({ text: "inspect and", caret: 8 });
  });

  it("marks composer fuzzy session ids with the reserved prefix", () => {
    const sessionId = createComposerFuzzySessionId();
    expect(isComposerFuzzySessionId(sessionId)).toBe(true);
    expect(isComposerFuzzySessionId("plain-session")).toBe(false);
  });
});
