import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConversationMessage, TimelineEntry } from "../../domain/timeline";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";

function createAssistantMessage(text: string): Extract<
  Parameters<typeof HomeAssistantTranscriptEntry>[0]["node"],
  { kind: "assistantMessage" }
> {
  const message: ConversationMessage = {
    id: "assistant-1",
    kind: "agentMessage",
    role: "assistant",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-assistant",
    text,
    status: "done",
  };
  return { key: message.id, kind: "assistantMessage", message, showThinkingIndicator: false };
}

function createCommandNode(): Extract<
  Parameters<typeof HomeAssistantTranscriptEntry>[0]["node"],
  { kind: "traceItem" }
> {
  const item: TimelineEntry = {
    id: "command-1",
    kind: "commandExecution",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-command",
    command: "pnpm test",
    cwd: "E:/code/codex-app-plus",
    processId: "proc-1",
    status: "completed",
    commandActions: [],
    output: "done",
    exitCode: 0,
    durationMs: 1200,
    terminalInteractions: [],
    approvalRequestId: null,
  };
  return { key: item.id, kind: "traceItem", item };
}

describe("HomeAssistantTranscriptEntry", () => {
  it("renders assistant proposed plans without the card wrapper", () => {
    const { container } = render(
      <HomeAssistantTranscriptEntry
        node={createAssistantMessage("before\n<proposed_plan>\n# Plan\n- one\n</proposed_plan>\nafter")}
      />,
    );

    expect(container.querySelector(".home-chat-proposed-plan")).toBeNull();
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByText("after")).toBeInTheDocument();
  });

  it("renders command summaries in collapsed transcript details", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createCommandNode()} />);
    const summary = container.querySelector("summary");
    const details = container.querySelector("details");

    expect(screen.getByText(/pnpm test/)).toBeInTheDocument();
    expect(details?.open).toBe(false);

    if (summary !== null) {
      fireEvent.click(summary);
    }

    expect(details?.open).toBe(true);
  });
});
