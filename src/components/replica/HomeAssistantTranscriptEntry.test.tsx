import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  CollabAgentToolCallEntry,
  CommandExecutionEntry,
  ConversationMessage,
  DynamicToolCallEntry,
  McpToolCallEntry,
  TurnPlanSnapshotEntry,
} from "../../domain/timeline";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";

type AssistantNode = Parameters<typeof HomeAssistantTranscriptEntry>[0]["node"];

const LONG_COMMAND = "pnpm test --filter @very-long/package-name -- --runInBand --reporter=verbose";

function createAssistantMessage(text: string): Extract<AssistantNode, { kind: "assistantMessage" }> {
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

function createTraceNode(entry: Extract<AssistantNode, { kind: "traceItem" }>['item']): Extract<AssistantNode, { kind: "traceItem" }> {
  return { key: entry.id, kind: "traceItem", item: entry };
}

function createCommandNode(command = LONG_COMMAND): Extract<AssistantNode, { kind: "traceItem" }> {
  const item: CommandExecutionEntry = {
    id: "command-1",
    kind: "commandExecution",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-command",
    command,
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

  return createTraceNode(item);
}

function createMcpToolNode(): Extract<AssistantNode, { kind: "traceItem" }> {
  const item: McpToolCallEntry = {
    id: "mcp-1",
    kind: "mcpToolCall",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-mcp",
    server: "server-alpha",
    tool: "tool/with/a/very/long/name",
    status: "completed",
    arguments: { query: "status" },
    result: null,
    error: null,
    durationMs: 250,
    progress: [],
  };

  return createTraceNode(item);
}

function createDynamicToolNode(): Extract<AssistantNode, { kind: "traceItem" }> {
  const item: DynamicToolCallEntry = {
    id: "dynamic-1",
    kind: "dynamicToolCall",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-dynamic",
    tool: "dynamic-tool-with-an-extremely-long-name",
    arguments: { mode: "full" },
    status: "completed",
    contentItems: [],
    success: true,
    durationMs: 400,
  };

  return createTraceNode(item);
}

function createCollabToolNode(): Extract<AssistantNode, { kind: "traceItem" }> {
  const item: CollabAgentToolCallEntry = {
    id: "collab-1",
    kind: "collabAgentToolCall",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-collab",
    tool: "spawnAgent",
    status: "completed",
    senderThreadId: "thread-main",
    receiverThreadIds: ["thread-helper"],
    prompt: "inspect the command UI",
    agentsStates: {
      "thread-helper": {
        status: "completed",
        message: null,
      },
    },
  };

  return createTraceNode(item);
}

function createTurnPlanNode(): Extract<AssistantNode, { kind: "auxiliaryBlock" }> {
  const entry: TurnPlanSnapshotEntry = {
    id: "turn-plan-1",
    kind: "turnPlanSnapshot",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-plan",
    explanation: "keep the plan visible",
    plan: [{ step: "Inspect UI", status: "completed" }],
  };

  return { key: entry.id, kind: "auxiliaryBlock", entry };
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

  it("marks command summaries for collapsed truncation without shortening text content", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createCommandNode()} />);
    const summary = container.querySelector("summary");
    const details = container.querySelector("details");
    const summaryText = container.querySelector(".home-assistant-transcript-summary-text");
    const detailPanel = container.querySelector('.home-assistant-transcript-detail-panel[data-variant="shell"]');
    const footerMeta = container.querySelector(".home-assistant-transcript-detail-footer-meta");
    const footerStatus = container.querySelector(".home-assistant-transcript-detail-footer-status");
    const body = container.querySelector(".home-assistant-transcript-detail-body");

    expect(summary).toHaveAttribute("data-truncate-summary", "true");
    expect(summaryText?.textContent).toContain(LONG_COMMAND);
    expect(summaryText?.textContent).not.toContain("…");
    expect(details?.open).toBe(false);
    expect(detailPanel).not.toBeNull();
    expect(screen.getByText("Shell")).toBeInTheDocument();
    expect(container.querySelector(".home-assistant-transcript-detail-top-meta")).toBeNull();
    expect(footerMeta?.textContent).toContain("退出码：0");
    expect(footerMeta?.textContent).toContain("耗时：1.2 s");
    expect(footerStatus?.textContent).toBe("成功");
    expect(body?.textContent).toContain(`$ ${LONG_COMMAND}`);
    expect(body?.textContent).toContain("done");
    expect(body?.textContent).not.toContain("工作目录：");

    if (summary !== null) {
      fireEvent.click(summary);
    }

    expect(details?.open).toBe(true);
  });

  it("marks MCP, dynamic, and collab tool summaries for collapsed truncation", () => {
    const { container } = render(
      <>
        <HomeAssistantTranscriptEntry node={createMcpToolNode()} />
        <HomeAssistantTranscriptEntry node={createDynamicToolNode()} />
        <HomeAssistantTranscriptEntry node={createCollabToolNode()} />
      </>,
    );

    const summaries = Array.from(container.querySelectorAll('summary[data-truncate-summary="true"]'));
    const texts = Array.from(container.querySelectorAll(".home-assistant-transcript-summary-text")).map(
      (element) => element.textContent,
    );
    const labels = Array.from(container.querySelectorAll(".home-assistant-transcript-detail-label")).map(
      (element) => element.textContent,
    );

    expect(summaries).toHaveLength(3);
    expect(texts).toContain("工具调用：server-alpha/tool/with/a/very/long/name");
    expect(texts).toContain("工具调用：dynamic-tool-with-an-extremely-long-name");
    expect(texts).toContain("协作工具：spawnAgent");
    expect(labels.filter((label) => label === "Tool")).toHaveLength(3);
  });

  it("does not mark turn plan summaries for collapsed truncation", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createTurnPlanNode()} />);
    const summary = container.querySelector("summary");
    const label = container.querySelector(".home-assistant-transcript-detail-label");

    expect(screen.getByText("Turn plan")).toBeInTheDocument();
    expect(summary?.hasAttribute("data-truncate-summary")).toBe(false);
    expect(label?.textContent).toBe("Plan");
  });
});
