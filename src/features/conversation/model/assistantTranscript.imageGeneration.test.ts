import { describe, expect, it } from "vitest";
import type { ImageGenerationEntry } from "../../../domain/timeline";
import { createAssistantTranscriptEntryModel } from "./assistantTranscript";

const translate: Parameters<typeof createAssistantTranscriptEntryModel>[1] = (key, params) => {
  if (key === "home.conversation.transcript.imageGeneration") {
    return `Generated image: ${String(params?.detail)}`;
  }
  if (key === "home.conversation.transcript.status.toolCompleted") {
    return "completed";
  }
  return key;
};

const imageGenerationEntry: ImageGenerationEntry = {
  id: "image-generation-1",
  kind: "imageGeneration",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "ig_123",
  status: "completed",
  revisedPrompt: "A tiny blue square",
  result: "Zm9v",
  savedPath: "E:/code/codex-app-plus/.codex/images/ig_123.png",
};

describe("assistantTranscript image generation", () => {
  it("summarizes generated images without dumping raw base64", () => {
    const model = createAssistantTranscriptEntryModel({
      key: "node-1",
      kind: "traceItem",
      item: imageGenerationEntry,
    }, translate);

    expect(model.kind).toBe("details");
    if (model.kind !== "details" || model.detailPanel.variant === "fileDiff") {
      throw new Error("expected text detail panel");
    }

    expect(model.summary).toBe("Generated image: A tiny blue square");
    expect(model.detailPanel.body).toContain("Saved path: E:/code/codex-app-plus/.codex/images/ig_123.png");
    expect(model.detailPanel.body).toContain("Result: 4 base64 chars");
    expect(model.detailPanel.body).not.toContain("Zm9v");
  });
});
