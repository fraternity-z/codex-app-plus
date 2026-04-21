import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../../domain/timeline";
import { flattenConversationRenderGroup, splitActivitiesIntoRenderGroups } from "./localConversationGroups";

const userEntry: TimelineEntry = {
  id: "user-1",
  kind: "userMessage",
  role: "user",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "user-1",
  text: "Generate an image",
  status: "done",
};

const imageGenerationEntry: TimelineEntry = {
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

describe("localConversationGroups image generation", () => {
  it("renders image generation as a trace item in commands mode", () => {
    const [group] = splitActivitiesIntoRenderGroups([userEntry, imageGenerationEntry], null, "commands");
    const nodes = flattenConversationRenderGroup(group);

    expect(nodes.map((node) => node.kind)).toEqual(["userBubble", "traceItem"]);
    expect(nodes[1]?.kind === "traceItem" ? nodes[1].item.kind : null).toBe("imageGeneration");
  });
});
