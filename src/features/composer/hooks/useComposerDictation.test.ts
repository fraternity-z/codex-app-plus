import { describe, expect, it } from "vitest";
import {
  appendDictationTranscript,
  isDictationPermissionDeniedError,
} from "./useComposerDictation";

describe("composer dictation helpers", () => {
  it("appends transcripts with spacing for latin text", () => {
    expect(appendDictationTranscript("", "hello")).toBe("hello");
    expect(appendDictationTranscript("Review", "the diff")).toBe("Review the diff");
    expect(appendDictationTranscript("Review ", "the diff")).toBe("Review the diff");
  });

  it("appends punctuation and CJK transcripts without inserting spaces", () => {
    expect(appendDictationTranscript("Review", ".")).toBe("Review.");
    expect(appendDictationTranscript("请检查", "这个文件")).toBe("请检查这个文件");
  });

  it("identifies dictation permission errors by name", () => {
    const error = new Error("Microphone permission was denied.");
    error.name = "DictationPermissionDeniedError";
    expect(isDictationPermissionDeniedError(error)).toBe(true);
    expect(isDictationPermissionDeniedError(new Error("other"))).toBe(false);
  });
});
