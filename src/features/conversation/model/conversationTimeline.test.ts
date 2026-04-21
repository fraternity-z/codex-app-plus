import { describe, expect, it } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import type { TimelineEntry } from "../../../domain/timeline";
import type { ThreadTokenUsage } from "../../../protocol/generated/v2/ThreadTokenUsage";
import { mapConversationToTimelineEntries } from "./conversationTimeline";

const TOKEN_USAGE: ThreadTokenUsage = {
  total: { totalTokens: 14996, inputTokens: 14791, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  last: { totalTokens: 14996, inputTokens: 14791, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  modelContextWindow: 200000,
};

function createTurn(overrides?: Partial<ConversationTurnState>): ConversationTurnState {
  return {
    localId: "local-turn-1",
    turnId: "turn-1",
    status: "completed",
    error: null,
    params: null,
    items: [],
    turnStartedAtMs: null,
    planExplanation: null,
    planSteps: [],
    diff: null,
    rawResponses: [],
    notices: [],
    reviewStates: [],
    contextCompactions: [],
    tokenUsage: null,
    ...overrides,
  };
}

function createConversation(turns: ReadonlyArray<ConversationTurnState>): ConversationState {
  return {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-07T04:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns: [...turns],
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
  };
}

function getKinds(entries: ReadonlyArray<TimelineEntry>): Array<TimelineEntry["kind"]> {
  return entries.map((entry) => entry.kind);
}

describe("conversationTimeline", () => {
  it("同一 turn 同时存在 params.input 与 userMessage item 时只生成一个用户气泡", () => {
    const conversation = createConversation([
      createTurn({
        params: { input: [{ type: "text", text: "from params", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
        items: [{ item: { type: "userMessage", id: "user-item-1", content: [{ type: "text", text: "from item", text_elements: [] }] }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
      }),
    ]);

    const entries = mapConversationToTimelineEntries(conversation, []);
    const userEntries = entries.filter((entry) => entry.kind === "userMessage");
    const [userEntry] = userEntries;

    expect(userEntries).toHaveLength(1);
    expect(userEntry?.itemId).toBe("user-item-1");
    expect(userEntry?.kind === "userMessage" ? userEntry.text : null).toBe("from item");
  });

  it("没有 userMessage item 时回退到 params.input 作为用户起始气泡", () => {
    const conversation = createConversation([
      createTurn({
        params: { input: [{ type: "text", text: "fallback input", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
      }),
    ]);

    const entries = mapConversationToTimelineEntries(conversation, []);

    expect(getKinds(entries)).toEqual(["userMessage"]);
    expect(entries[0]?.kind).toBe("userMessage");
    expect(entries[0]?.kind === "userMessage" ? entries[0].text : null).toBe("fallback input");
  });

  it("保留 turn.items 中 assistant、工具与 webSearch 的原始顺序", () => {
    const conversation = createConversation([
      createTurn({
        params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
        items: [
          { item: { type: "agentMessage", id: "assistant-1", text: "先说结论", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "commandExecution", id: "command-1", command: "pnpm test", cwd: "E:/code/codex-app-plus", processId: "proc-1", source: "agent", status: "inProgress", commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null }, approvalRequestId: null, outputText: "running", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "dynamicToolCall", id: "dynamic-1", tool: "browser.run", arguments: { task: "open" }, status: "completed", contentItems: [{ type: "inputText", text: "ok" }], success: true, durationMs: 10 }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "collabAgentToolCall", id: "collab-1", tool: "spawnAgent", status: "completed", senderThreadId: "thread-1", receiverThreadIds: ["thread-2"], prompt: "check ui", model: null, reasoningEffort: null, agentsStates: { "thread-2": { status: "completed", message: "done" } } }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "webSearch", id: "web-1", query: "latest docs", action: { type: "search", query: "latest docs", queries: ["latest docs"] } }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "fileChange", id: "file-1", changes: [{ path: "src/App.tsx", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" }], status: "completed" }, approvalRequestId: null, outputText: "patched", terminalInteractions: [], rawResponse: null, progressMessages: [] },
        ],
      }),
    ]);

    const entries = mapConversationToTimelineEntries(conversation, []);

    expect(getKinds(entries)).toEqual(["userMessage", "agentMessage", "commandExecution", "dynamicToolCall", "collabAgentToolCall", "webSearch", "fileChange"]);
  });
  it("keeps assistant content visible when a turn also stores token usage", () => {
    const conversation = createConversation([
      createTurn({
        params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
        items: [{ item: { type: "agentMessage", id: "assistant-1", text: "assistant reply", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
        tokenUsage: TOKEN_USAGE,
      }),
    ]);

    const entries = mapConversationToTimelineEntries(conversation, []);
    const kinds = getKinds(entries);

    expect(kinds).toEqual(["userMessage", "agentMessage"]);
    expect(kinds).not.toContain("tokenUsage");
    expect(entries[1]?.kind === "agentMessage" ? entries[1].text : null).toBe("assistant reply");
  });

  it("keeps context compaction items inline with the assistant flow", () => {
    const conversation = createConversation([
      createTurn({
        params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
        items: [
          { item: { type: "agentMessage", id: "assistant-1", text: "压缩前", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "contextCompaction", id: "context-compaction-1" }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "agentMessage", id: "assistant-2", text: "压缩后继续", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
        ],
      }),
    ]);

    const entries = mapConversationToTimelineEntries(conversation, []);

    expect(getKinds(entries)).toEqual(["userMessage", "agentMessage", "contextCompaction", "agentMessage"]);
  });

  it("inserts deprecated compaction notices at their anchored position", () => {
    const conversation = createConversation([
      createTurn({
        params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
        items: [
          { item: { type: "agentMessage", id: "assistant-1", text: "压缩前", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
          { item: { type: "agentMessage", id: "assistant-2", text: "压缩后继续", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
        ],
        contextCompactions: [{ id: "context-fallback-1", itemId: null, afterItemId: "assistant-1" }],
      }),
    ]);

    const entries = mapConversationToTimelineEntries(conversation, []);

    expect(getKinds(entries)).toEqual(["userMessage", "agentMessage", "contextCompaction", "agentMessage"]);
  });
});
