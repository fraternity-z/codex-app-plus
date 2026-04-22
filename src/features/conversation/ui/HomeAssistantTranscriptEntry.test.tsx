import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CollabAgentToolCallEntry,
  CommandExecutionEntry,
  ContextCompactionEntry,
  ConversationMessage,
  DynamicToolCallEntry,
  ImageGenerationEntry,
  McpToolCallEntry,
  PlanEntry,
  TurnPlanSnapshotEntry,
} from "../../../domain/timeline";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";

const coreMocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => coreMocks);

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

  return { key: message.id, kind: "assistantMessage", message };
}

function createTraceNode(entry: Extract<AssistantNode, { kind: "traceItem" }>["item"]): Extract<AssistantNode, { kind: "traceItem" }> {
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

function createCommandNodeWithStatus(
  command: string,
  status: CommandExecutionEntry["status"],
): Extract<AssistantNode, { kind: "traceItem" }> {
  const node = createCommandNode(command);
  if (node.item.kind !== "commandExecution") {
    throw new Error("Expected commandExecution node");
  }
  return { ...node, item: { ...node.item, status } };
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

function createImageGenerationNode(): Extract<AssistantNode, { kind: "traceItem" }> {
  const item: ImageGenerationEntry = {
    id: "image-generation-1",
    kind: "imageGeneration",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "ig_123",
    status: "completed",
    revisedPrompt: "A small pink pig in a meadow",
    result: "abc123",
    savedPath: "C:/Users/Administrator/.codex/generated_images/ig_123.png",
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

function createPlanDraftNode(): Extract<AssistantNode, { kind: "auxiliaryBlock" }> {
  const entry: PlanEntry = {
    id: "plan-draft-1",
    kind: "plan",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-plan-draft",
    text: "## Plan doc\n- Step one\n- Step two",
    status: "done",
  };

  return { key: entry.id, kind: "auxiliaryBlock", entry };
}

function createContextCompactionNode(): Extract<AssistantNode, { kind: "auxiliaryBlock" }> {
  const entry: ContextCompactionEntry = {
    id: "context-compaction-1",
    kind: "contextCompaction",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-context-compaction",
  };

  return { key: entry.id, kind: "auxiliaryBlock", entry };
}

function createReasoningNode(
  titleMarkdown = "**Inspecting code behavior**",
  bodyMarkdown = "I need to inspect the component before patching it.",
): Extract<AssistantNode, { kind: "reasoningBlock" }> {
  return {
    key: "reasoning-1",
    kind: "reasoningBlock",
    block: {
      id: "reasoning-1",
      titleMarkdown,
      bodyMarkdown,
    },
  };
}

describe("HomeAssistantTranscriptEntry", () => {
  beforeEach(() => {
    coreMocks.convertFileSrc.mockClear();
    coreMocks.invoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders assistant proposed plans inside the plan draft card", () => {
    const { container } = render(
      <HomeAssistantTranscriptEntry
        node={createAssistantMessage("before\n<proposed_plan>\n# Plan\n- one\n</proposed_plan>\nafter")}
      />,
      { wrapper: createI18nWrapper("en-US") },
    );

    expect(container.querySelector(".home-plan-draft-card")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByText("after")).toBeInTheDocument();
  });

  it("renders plan items as markdown cards", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createPlanDraftNode()} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(container.querySelector(".home-plan-draft-card")).not.toBeNull();
    expect(screen.getByText("Plan draft")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plan doc" })).toBeInTheDocument();
  });

  it("renders context compaction as a divider line", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createContextCompactionNode()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(container.querySelector(".home-assistant-transcript-divider")).not.toBeNull();
    expect(screen.getByText("背景信息已自动压缩")).toBeInTheDocument();
  });

  it("renders generated images inline without prompt or path metadata", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createImageGenerationNode()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    const image = screen.getByRole("img", { name: "生成的图片" });
    expect(container.querySelector(".home-assistant-transcript-image-generation")).not.toBeNull();
    expect(image).toHaveAttribute("src", "data:image/png;base64,abc123");
    expect(screen.queryByText("生成图片：A small pink pig in a meadow")).toBeNull();
    expect(screen.queryByText(/generated_images/)).toBeNull();
  });

  it("opens generated images in a preview dialog", () => {
    render(<HomeAssistantTranscriptEntry node={createImageGenerationNode()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    fireEvent.click(screen.getByRole("button", { name: "放大查看生成图片" }));

    expect(screen.getByRole("dialog", { name: "生成图片预览" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭图片预览" }));
    expect(screen.queryByRole("dialog", { name: "生成图片预览" })).toBeNull();
  });

  it("shows image context menu actions with localized labels", async () => {
    render(<HomeAssistantTranscriptEntry node={createImageGenerationNode()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    fireEvent.contextMenu(screen.getByRole("button", { name: "放大查看生成图片" }), { clientX: 12, clientY: 24 });
    expect(screen.getByRole("menu", { name: "生成图片操作" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "在文件夹中显示" }));

    expect(coreMocks.invoke).toHaveBeenCalledWith("app_reveal_path_in_folder", {
      input: { path: "C:/Users/Administrator/.codex/generated_images/ig_123.png" },
    });
  });

  it("copies generated image data from the context menu", async () => {
    const imageBlob = new Blob(["image"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(imageBlob) });
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      readonly items: Record<string, Blob>;

      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: clipboardWrite },
    });
    render(<HomeAssistantTranscriptEntry node={createImageGenerationNode()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    fireEvent.contextMenu(screen.getByRole("button", { name: "放大查看生成图片" }), { clientX: 12, clientY: 24 });
    fireEvent.click(screen.getByRole("menuitem", { name: "复制图片" }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,abc123");
  });

  it("omits empty assistant message placeholders", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createAssistantMessage("")} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(container.firstChild).toBeNull();
  });

  it("marks command summaries for collapsed truncation without shortening text content", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createCommandNode()} />, {
      wrapper: createI18nWrapper("en-US"),
    });
    const summary = container.querySelector("summary");
    const details = container.querySelector("details");
    const summaryText = container.querySelector(".home-assistant-transcript-summary-text");
    const entry = container.querySelector(".home-assistant-transcript-details-trace");
    const detailPanel = container.querySelector('.home-assistant-transcript-detail-panel[data-variant="shell"]');
    const footerMeta = container.querySelector(".home-assistant-transcript-detail-footer-meta");
    const footerStatus = container.querySelector(".home-assistant-transcript-detail-footer-status");
    const body = container.querySelector(".home-assistant-transcript-detail-body");

    expect(entry).not.toBeNull();
    expect(summary).toHaveAttribute("data-truncate-summary", "true");
    expect(summaryText?.textContent).toContain(LONG_COMMAND);
    expect(summaryText?.textContent).not.toContain("...");
    expect(details?.open).toBe(false);
    expect(detailPanel).not.toBeNull();
    expect(screen.getByText("Shell")).toBeInTheDocument();
    expect(container.querySelector(".home-assistant-transcript-detail-top-meta")).toBeNull();
    expect(footerMeta?.textContent).toContain("Exit code: 0");
    expect(footerMeta?.textContent).toContain("Duration: 1.2 s");
    expect(footerStatus?.textContent).toBe("Succeeded");
    expect(body?.textContent).toContain(`$ ${LONG_COMMAND}`);
    expect(body?.textContent).toContain("done");

    if (summary !== null) {
      fireEvent.click(summary);
    }

    expect(details?.open).toBe(true);
  });

  it("highlights read command file names in the summary", () => {
    const { container } = render(
      <HomeAssistantTranscriptEntry node={createCommandNode("Get-Content src/i18n/messages/schema.ts")} />,
      { wrapper: createI18nWrapper("zh-CN") },
    );

    const fileName = screen.getByText("schema.ts", { selector: ".home-assistant-transcript-file-name" });
    const summaryText = container.querySelector(".home-assistant-transcript-summary-text");

    expect(fileName).toHaveClass("home-assistant-transcript-file-name");
    expect(summaryText?.textContent).toBe("已读取文件 schema.ts");
    expect(summaryText?.textContent).not.toContain("src/i18n/messages/schema.ts");
  });

  it("uses concise completed copy for searches inside a path", () => {
    const { container } = render(
      <HomeAssistantTranscriptEntry node={createCommandNodeWithStatus("rg -n \"ConversationPane|ControlBar\" src", "completed")} />,
      { wrapper: createI18nWrapper("zh-CN") },
    );

    const summaryText = container.querySelector(".home-assistant-transcript-summary-text");

    expect(container.querySelector(".home-assistant-transcript-file-name")).toBeNull();
    expect(summaryText?.textContent).toBe("在 src 中搜寻完毕");
  });

  it("marks MCP, dynamic, and collab tool summaries for collapsed truncation", () => {
    const { container } = render(
      <>
        <HomeAssistantTranscriptEntry node={createMcpToolNode()} />
        <HomeAssistantTranscriptEntry node={createDynamicToolNode()} />
        <HomeAssistantTranscriptEntry node={createCollabToolNode()} />
      </>,
      { wrapper: createI18nWrapper("en-US") },
    );

    const summaries = Array.from(container.querySelectorAll('summary[data-truncate-summary="true"]'));
    const texts = Array.from(container.querySelectorAll(".home-assistant-transcript-summary-text")).map(
      (element) => element.textContent,
    );
    const labels = Array.from(container.querySelectorAll(".home-assistant-transcript-detail-label")).map(
      (element) => element.textContent,
    );

    expect(summaries).toHaveLength(3);
    expect(texts).toContain("Tool call: server-alpha/tool/with/a/very/long/name");
    expect(texts).toContain("Tool call: dynamic-tool-with-an-extremely-long-name");
    expect(texts).toContain("Tool call: spawnAgent");
    expect(labels.filter((label) => label === "Tool")).toHaveLength(3);
  });

  it("does not mark turn plan summaries for collapsed truncation", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createTurnPlanNode()} />, {
      wrapper: createI18nWrapper("en-US"),
    });
    const summary = container.querySelector("summary");
    const label = container.querySelector(".home-assistant-transcript-detail-label");
    const detailBody = container.querySelector(".home-assistant-transcript-detail-body");

    expect(screen.getByText("Task list")).toBeInTheDocument();
    expect(detailBody?.textContent).toContain("keep the plan visible");
    expect(detailBody?.textContent).toContain("Inspect UI");
    expect(summary?.hasAttribute("data-truncate-summary")).toBe(false);
    expect(label?.textContent).toBe("Plan");
  });

  it("renders reasoning as collapsed plain text details with markdown title", () => {
    const { container } = render(<HomeAssistantTranscriptEntry node={createReasoningNode()} />, {
      wrapper: createI18nWrapper("en-US"),
    });
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");
    const strongTitle = container.querySelector(".home-assistant-transcript-reasoning-summary strong");

    expect(details?.open).toBe(false);
    expect(summary?.textContent).toBe("Inspecting code behavior");
    expect(strongTitle?.textContent).toBe("Inspecting code behavior");
    expect(container.querySelector(".home-assistant-transcript-detail-panel")).toBeNull();

    if (summary !== null) {
      fireEvent.click(summary);
    }

    expect(details?.open).toBe(true);
    expect(container.querySelector(".home-assistant-transcript-reasoning-body")?.textContent).toContain(
      "I need to inspect the component before patching it.",
    );
  });

  it("renders a title-only reasoning block without a disclosure container", () => {
    const { container } = render(
      <HomeAssistantTranscriptEntry node={createReasoningNode("**Inspecting code behavior**", "")} />,
      { wrapper: createI18nWrapper("en-US") },
    );

    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
    expect(container.querySelector(".home-assistant-transcript-reasoning-title-markdown strong")?.textContent).toBe(
      "Inspecting code behavior",
    );
    expect(container.querySelector(".home-assistant-transcript-details-trace")).toBeNull();
  });
});
