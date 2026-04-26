import { describe, expect, it } from "vitest";
import {
  appendDictationTranscript,
  collectFinalDictationTranscript,
  resolveComposerSpeechRecognitionConstructor,
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

  it("collects only final speech recognition results", () => {
    expect(collectFinalDictationTranscript({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "hello " } },
        { isFinal: false, 0: { transcript: "ignored" } },
        { isFinal: true, 0: { transcript: "world" } },
      ],
    })).toBe("hello world");
  });

  it("resolves standard and webkit speech recognition constructors", () => {
    class StandardRecognition {}
    class WebkitRecognition {}

    expect(resolveComposerSpeechRecognitionConstructor({ SpeechRecognition: StandardRecognition })).toBe(StandardRecognition);
    expect(resolveComposerSpeechRecognitionConstructor({ webkitSpeechRecognition: WebkitRecognition })).toBe(WebkitRecognition);
    expect(resolveComposerSpeechRecognitionConstructor({})).toBeNull();
  });
});
