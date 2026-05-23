import { describe, expect, it } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import type { Thread } from "../../../protocol/generated/v2/Thread";
import type { Turn } from "../../../protocol/generated/v2/Turn";
import type { ThreadTokenUsage } from "../../../protocol/generated/v2/ThreadTokenUsage";
import {
  addConversationMcpProgress,
  addGoalSubmissionHistoryEntries,
  appendConversationContextCompaction,
  createConversationFromThread,
  hydrateConversationFromThread,
  MAX_MCP_PROGRESS_MESSAGES_PER_ITEM,
  setConversationTokenUsage,
  syncCompletedTurn,
  syncStartedTurn,
  upsertConversationItem,
} from "./conversationState";

const TOKEN_USAGE: ThreadTokenUsage = {
  total: { totalTokens: 14996, inputTokens: 14791, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  last: { totalTokens: 205, inputTokens: 0, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  modelContextWindow: 200000,
};

function createAssistantItem(text: string): ConversationTurnState["items"][number] {
  return {
    item: { type: "agentMessage", id: "assistant-1", text, phase: null, memoryCitation: null },
    approvalRequestId: null,
    outputText: "",
    terminalInteractions: [],
    rawResponse: null,
    progressMessages: [],
  };
}

function createTurnState(overrides: Partial<ConversationTurnState> = {}): ConversationTurnState {
  return {
    localId: "local-turn-1",
    turnId: "turn-1",
    status: "completed",
    error: null,
    params: null,
    items: [createAssistantItem("assistant reply")],
    turnStartedAtMs: 123,
    planAvailable: true,
    planExplanation: "plan summary",
    planSteps: [{ step: "Inspect state merge", status: "completed" }],
    diff: "diff --git a/file b/file",
    rawResponses: [{ type: "message", role: "assistant", content: [] }],
    notices: [{ id: "notice-1", itemId: null, title: "notice", detail: "detail", level: "info", source: "test" }],
    reviewStates: [],
    contextCompactions: [],
    tokenUsage: null,
    ...overrides,
  };
}

function createConversation(turns: ReadonlyArray<ConversationTurnState> = [createTurnState()]): ConversationState {
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

function createNotificationTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    items: [],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: 1,
    completedAt: 2,
    durationMs: 1000,
    ...overrides,
  };
}

function createThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    forkedFromId: null,
    sessionId: "session-1",
    preview: "thread preview",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 2,
    status: { type: "idle" },
    path: null,
    cwd: "E:/code/codex-app-plus",
    cliVersion: "0.1.0",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: "Thread",
    turns: [],
    ...overrides,
  };
}

describe("conversationState", () => {

  it("preserves branch when creating and hydrating from thread metadata", () => {
    const thread = createThread({ gitInfo: { sha: null, branch: "feature/thread-branch", originUrl: null } });

    const conversation = createConversationFromThread(thread, { resumeState: "resumed" });
    const hydrated = hydrateConversationFromThread(conversation, { ...thread, gitInfo: { sha: null, branch: "feature/next-branch", originUrl: null } });

    expect(conversation.branch).toBe("feature/thread-branch");
    expect(hydrated.branch).toBe("feature/next-branch");
  });

  it("recognizes official and legacy subagent thread metadata", () => {
    expect(createConversationFromThread(createThread({ threadSource: "user" })).isSubagent).toBeUndefined();
    expect(createConversationFromThread(createThread({ threadSource: "subagent" })).isSubagent).toBe(true);
    expect(createConversationFromThread(createThread({
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent",
            depth: 1,
            agent_path: null,
            agent_nickname: "Atlas",
            agent_role: "worker",
          },
        },
      } as never,
    })).isSubagent).toBe(true);
  });

  it("rebuilds turn diff snapshots from persisted file change items", () => {
    const thread = createThread({
      turns: [
        createNotificationTurn({
          items: [
            {
              type: "fileChange",
              id: "file-change-1",
              status: "completed",
              changes: [
                {
                  path: "src/App.tsx",
                  kind: { type: "update", move_path: null },
                  diff: ["@@ -1 +1,2 @@", "-old", "+new", "+another"].join("\n"),
                },
              ],
            },
          ],
        }),
      ],
    });

    const conversation = createConversationFromThread(thread, { resumeState: "resumed" });
    const diff = conversation.turns[0]?.diff ?? "";

    expect(diff).toContain("diff --git a/src/App.tsx b/src/App.tsx");
    expect(diff).toContain("--- a/src/App.tsx");
    expect(diff).toContain("+++ b/src/App.tsx");
    expect(diff).toContain("+another");
  });

  it("rehydrates persisted goal submissions beside restored assistant turns", () => {
    const thread = createThread({
      turns: [
        createNotificationTurn({
          startedAt: 3,
          items: [{ type: "agentMessage", id: "assistant-1", text: "working", phase: null, memoryCitation: null }],
        }),
      ],
    });
    const conversation = addGoalSubmissionHistoryEntries(
      createConversationFromThread(thread, { resumeState: "resumed" }),
      [{ id: "goal-1", threadId: "thread-1", objective: "finish the migration", createdAtMs: 2_000 }],
    );

    expect(conversation.turns[0]?.goalSubmission).toBe(true);
    expect(conversation.turns[0]?.params?.input).toEqual([{ type: "text", text: "finish the migration", text_elements: [] }]);

    const hydrated = hydrateConversationFromThread(conversation, thread);

    expect(hydrated.turns.map((turn) => turn.goalSubmissionId ?? turn.turnId)).toEqual(["goal-1", "turn-1"]);
    expect(hydrated.turns[0]?.params?.input).toEqual([{ type: "text", text: "finish the migration", text_elements: [] }]);
  });

  it("sets token usage without changing the existing turn content", () => {
    const conversation = createConversation();
    const [originalTurn] = conversation.turns;
    const nextConversation = setConversationTokenUsage(conversation, "turn-1", TOKEN_USAGE);
    const [nextTurn] = nextConversation.turns;

    expect(nextConversation).not.toBe(conversation);
    expect(nextTurn).not.toBe(originalTurn);
    expect(nextTurn?.tokenUsage).toEqual(TOKEN_USAGE);
    expect(nextTurn?.items).toBe(originalTurn?.items);
    expect(nextTurn?.items[0]?.item.type).toBe("agentMessage");
    expect(nextTurn?.items[0]?.item.type === "agentMessage" ? nextTurn.items[0].item.text : null).toBe("assistant reply");
    expect(nextTurn?.notices).toBe(originalTurn?.notices);
    expect(nextTurn?.rawResponses).toBe(originalTurn?.rawResponses);
    expect(originalTurn?.tokenUsage).toBeNull();
  });

  it("preserves existing items on sparse turnCompleted while updating status and error", () => {
    const conversation = createConversation([createTurnState({ status: "inProgress", tokenUsage: TOKEN_USAGE })]);
    const [originalTurn] = conversation.turns;
    const error = { message: "turn failed", codexErrorInfo: "other" as const, additionalDetails: "details" };

    const nextConversation = syncCompletedTurn(conversation, createNotificationTurn({ status: "failed", error }));
    const [nextTurn] = nextConversation.turns;

    expect(nextTurn?.status).toBe("failed");
    expect(nextTurn?.error).toEqual(error);
    expect(nextTurn?.items).toBe(originalTurn?.items);
    expect(nextTurn?.items[0]?.item.type === "agentMessage" ? nextTurn.items[0].item.text : null).toBe("assistant reply");
    expect(nextTurn?.rawResponses).toBe(originalTurn?.rawResponses);
    expect(nextTurn?.notices).toBe(originalTurn?.notices);
    expect(nextTurn?.planAvailable).toBe(originalTurn?.planAvailable);
    expect(nextTurn?.planExplanation).toBe(originalTurn?.planExplanation);
    expect(nextTurn?.planSteps).toBe(originalTurn?.planSteps);
    expect(nextTurn?.diff).toBe(originalTurn?.diff);
    expect(nextTurn?.tokenUsage).toEqual(TOKEN_USAGE);
  });

  it("preserves existing items on sparse turnStarted notifications", () => {
    const conversation = createConversation([createTurnState({ status: "inProgress" })]);
    const [originalTurn] = conversation.turns;

    const nextConversation = syncStartedTurn(conversation, createNotificationTurn({ status: "inProgress" }));
    const [nextTurn] = nextConversation.turns;

    expect(nextTurn?.status).toBe("inProgress");
    expect(nextTurn?.items).toBe(originalTurn?.items);
    expect(nextTurn?.items[0]?.item.type === "agentMessage" ? nextTurn.items[0].item.text : null).toBe("assistant reply");
    expect(nextTurn?.turnStartedAtMs).toBe(123);
  });

  it("replaces items when the notification carries concrete items", () => {
    const conversation = createConversation();

    const nextConversation = syncCompletedTurn(conversation, createNotificationTurn({
      items: [{ type: "agentMessage", id: "assistant-2", text: "server final reply", phase: null, memoryCitation: null }],
    }));
    const [nextTurn] = nextConversation.turns;

    expect(nextTurn?.items).toHaveLength(1);
    expect(nextTurn?.items[0]?.item.type).toBe("agentMessage");
    expect(nextTurn?.items[0]?.item.type === "agentMessage" ? nextTurn.items[0].item.text : null).toBe("server final reply");
  });

  it("drops deprecated fallback compactions once the real contextCompaction item arrives", () => {
    const conversation = appendConversationContextCompaction(createConversation(), "turn-1");
    const nextConversation = upsertConversationItem(conversation, "turn-1", { type: "contextCompaction", id: "context-compaction-1" });
    const [nextTurn] = nextConversation.turns;

    expect(nextTurn?.contextCompactions).toEqual([]);
    expect(nextTurn?.items.some((itemState) => itemState.item.type === "contextCompaction")).toBe(true);
  });

  it("keeps only the latest MCP progress messages", () => {
    const mcpItem: ConversationTurnState["items"][number] = {
      item: {
        type: "mcpToolCall",
        id: "mcp-1",
        server: "filesystem",
        tool: "read_file",
        status: "inProgress",
        arguments: {},
        pluginId: null,
        result: null,
        error: null,
        durationMs: null,
      },
      approvalRequestId: null,
      outputText: "",
      terminalInteractions: [],
      rawResponse: null,
      progressMessages: [],
    };
    let conversation = createConversation([createTurnState({ items: [mcpItem] })]);
    for (let index = 0; index < MAX_MCP_PROGRESS_MESSAGES_PER_ITEM + 5; index += 1) {
      conversation = addConversationMcpProgress(conversation, "turn-1", "mcp-1", `progress-${index}`);
    }

    const progress = conversation.turns[0]?.items[0]?.progressMessages;
    expect(progress).toHaveLength(MAX_MCP_PROGRESS_MESSAGES_PER_ITEM);
    expect(progress?.[0]).toBe("progress-5");
    expect(progress?.[progress.length - 1]).toBe(`progress-${MAX_MCP_PROGRESS_MESSAGES_PER_ITEM + 4}`);
  });
});
