import { describe, expect, it, vi } from "vitest";
import type { ConversationState } from "../../../domain/conversation";
import { createConversationFromThread } from "../model/conversationState";
import { collectDescendantThreadIds, forceCloseThreadRuntime, type ThreadRuntimeCleanupTransport } from "./threadRuntimeCleanup";

function createThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    forkedFromId: null,
    preview: "thread",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 1,
    status: { type: "idle" as const },
    path: null,
    cwd: "E:/code/FPGA",
    cliVersion: "0.1.0",
    source: "appServer" as const,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...overrides,
  };
}

function createConversation(overrides: Record<string, unknown> = {}): ConversationState {
  return createConversationFromThread(createThread(overrides), { resumeState: "resumed" });
}

function createCollabTurn(senderThreadId: string, receiverThreadIds: ReadonlyArray<string>) {
  return {
    id: `turn-${senderThreadId}`,
    status: "completed" as const,
    error: null,
    startedAt: 1,
    completedAt: 2,
    durationMs: 1000,
    items: [{
      type: "collabAgentToolCall" as const,
      id: `collab-${senderThreadId}`,
      tool: "spawnAgent" as const,
      status: "completed" as const,
      senderThreadId,
      receiverThreadIds: [...receiverThreadIds],
      prompt: "inspect",
      agentsStates: Object.fromEntries(receiverThreadIds.map((threadId) => [threadId, { status: "running", message: null }])),
    }],
  };
}

function createTransport(): ThreadRuntimeCleanupTransport {
  return {
    interruptTurn: vi.fn().mockResolvedValue(undefined),
    cleanBackgroundTerminals: vi.fn().mockResolvedValue(undefined),
    unsubscribeThread: vi.fn().mockResolvedValue({ status: "unsubscribed" }),
  };
}

describe("threadRuntimeCleanup", () => {
  it("collects descendant threads in child-first order", () => {
    const conversationsById = {
      "thread-1": createConversation({
        id: "thread-1",
        turns: [createCollabTurn("thread-1", ["thread-2", "thread-4"])],
      }),
      "thread-2": createConversation({
        id: "thread-2",
        source: { subAgent: { thread_spawn: { parent_thread_id: "thread-1", depth: 1, agent_nickname: null, agent_role: "explorer" } } },
        turns: [createCollabTurn("thread-2", ["thread-3"])],
      }),
      "thread-3": createConversation({
        id: "thread-3",
        source: { subAgent: { thread_spawn: { parent_thread_id: "thread-2", depth: 2, agent_nickname: null, agent_role: "explorer" } } },
      }),
      "thread-4": createConversation({
        id: "thread-4",
        source: { subAgent: { thread_spawn: { parent_thread_id: "thread-1", depth: 1, agent_nickname: null, agent_role: "explorer" } } },
      }),
    } satisfies Readonly<Record<string, ConversationState | undefined>>;

    expect(collectDescendantThreadIds("thread-1", conversationsById)).toEqual(["thread-3", "thread-2", "thread-4"]);
  });

  it("interrupts active turns before cleaning and unsubscribing", async () => {
    const transport = createTransport();
    const conversation = createConversation({
      id: "thread-2",
      status: { type: "active" as const, activeFlags: [] },
      turns: [{ id: "turn-2", status: "inProgress" as const, error: null, items: [], startedAt: 1, completedAt: null, durationMs: null }],
    });

    await forceCloseThreadRuntime("thread-2", conversation, transport);

    expect(transport.interruptTurn).toHaveBeenCalledWith("thread-2", "turn-2");
    expect(transport.cleanBackgroundTerminals).toHaveBeenCalledWith("thread-2");
    expect(transport.unsubscribeThread).toHaveBeenCalledWith("thread-2");
    expect((transport.interruptTurn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((transport.cleanBackgroundTerminals as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
    expect((transport.cleanBackgroundTerminals as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((transport.unsubscribeThread as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it("ignores already-closed cleanup errors", async () => {
    const transport: ThreadRuntimeCleanupTransport = {
      interruptTurn: vi.fn().mockRejectedValue(new Error("turn already completed")),
      cleanBackgroundTerminals: vi.fn().mockRejectedValue(new Error("thread not loaded")),
      unsubscribeThread: vi.fn().mockRejectedValue(new Error("thread not found")),
    };

    await expect(forceCloseThreadRuntime("thread-2", createConversation({ id: "thread-2", turns: [{ id: "turn-2", status: "inProgress" as const, error: null, items: [], startedAt: 1, completedAt: null, durationMs: null }] }), transport)).resolves.toBeUndefined();
  });
});
