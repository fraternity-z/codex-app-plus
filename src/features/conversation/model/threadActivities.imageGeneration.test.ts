import { describe, expect, it } from "vitest";
import type { Thread } from "../../../protocol/generated/v2/Thread";
import { mapThreadHistoryToActivities } from "./threadActivities";

function createThread(): Thread {
  return {
    id: "thread-1",
    forkedFromId: null,
    preview: "Generate an image",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1776729600,
    updatedAt: 1776729600,
    status: { type: "idle" },
    path: null,
    cwd: "E:/code/codex-app-plus",
    cliVersion: "0.0.0-test",
    source: "appServer",
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [{
      id: "turn-1",
      status: "completed",
      error: null,
      startedAt: 1776729600,
      completedAt: 1776729601,
      durationMs: 1000,
      items: [{
        type: "imageGeneration",
        id: "ig_123",
        status: "completed",
        revisedPrompt: "A tiny blue square",
        result: "Zm9v",
        savedPath: "E:/code/codex-app-plus/.codex/images/ig_123.png",
      }],
    }],
  };
}

describe("threadActivities image generation", () => {
  it("keeps generated image items when loading thread history", () => {
    const [entry] = mapThreadHistoryToActivities(createThread());

    expect(entry).toMatchObject({
      kind: "imageGeneration",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "ig_123",
      status: "completed",
      revisedPrompt: "A tiny blue square",
      result: "Zm9v",
      savedPath: "E:/code/codex-app-plus/.codex/images/ig_123.png",
    });
  });
});
