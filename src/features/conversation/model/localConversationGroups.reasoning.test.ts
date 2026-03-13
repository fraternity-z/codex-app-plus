import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../../domain/timeline";
import { splitActivitiesIntoRenderGroups } from "./localConversationGroups";

function createUserMessage(): TimelineEntry {
  return {
    id: "user-1",
    kind: "userMessage",
    role: "user",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-user",
    text: "Inspect the current UI",
    status: "done",
  };
}

function createReasoning(summary: ReadonlyArray<string>, content: ReadonlyArray<string>): TimelineEntry {
  return {
    id: "reasoning-1",
    kind: "reasoning",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-reasoning",
    summary,
    content,
  };
}

function extractReasoningBlock(entry: TimelineEntry) {
  const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), entry], null, "commands");
  const block = group?.assistantFlow.find((node) => node.kind === "reasoningBlock");

  if (!block || block.kind !== "reasoningBlock") {
    throw new Error("Expected a reasoning block in the render group.");
  }

  return block.block;
}

describe("localConversationGroups reasoning", () => {
  it("extracts a markdown title from the first summary block", () => {
    const block = extractReasoningBlock(
      createReasoning(["**Inspecting code behavior**\nCheck how deletion closes the menu."], ["Open the component snippet."])
    );

    expect(block.titleMarkdown).toBe("**Inspecting code behavior**");
    expect(block.bodyMarkdown).toBe("Check how deletion closes the menu.\n\nOpen the component snippet.");
  });

  it("falls back to the default title when no standalone markdown title exists", () => {
    const block = extractReasoningBlock(createReasoning(["Check how deletion closes the menu."], []));

    expect(block.titleMarkdown).toBe("**Reasoning**");
    expect(block.bodyMarkdown).toBe("Check how deletion closes the menu.");
  });

  it("keeps reasoning visible when only content is present", () => {
    const block = extractReasoningBlock(createReasoning([" ", ""], ["Inspect the component body."]));

    expect(block.titleMarkdown).toBe("**Reasoning**");
    expect(block.bodyMarkdown).toBe("Inspect the component body.");
  });

  it("deduplicates overlapping summary and content bodies", () => {
    const block = extractReasoningBlock(
      createReasoning(["**Inspecting code behavior**\nInspect the component body."], ["Inspect   the component body."])
    );

    expect(block.bodyMarkdown).toBe("Inspect the component body.");
  });
});
