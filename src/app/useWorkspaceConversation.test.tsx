import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../bridge/types";
import { AppStoreProvider, useAppStore } from "../state/store";
import { applyAppServerNotification } from "./appControllerNotifications";
import type { ComposerAttachment } from "../domain/timeline";
import { createConversationFromThread } from "./conversationState";
import { FrameTextDeltaQueue } from "./frameTextDeltaQueue";
import { OutputDeltaQueue } from "./outputDeltaQueue";
import { useWorkspaceConversation } from "./useWorkspaceConversation";
import { createComposerFuzzySessionId } from "../components/replica/composerCommandBridge";

function createDeferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function Wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

function createThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    preview: "请分析当前工作区",
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

function createTurn(status: "inProgress" | "completed" = "inProgress") {
  return { id: "turn-1", items: [], status, error: null };
}

function createThreadStartResponse(threadOverrides: Record<string, unknown> = {}) {
  return {
    requestId: "request-1",
    result: {
      thread: createThread(threadOverrides),
      model: "gpt-5.2",
      modelProvider: "openai",
      serviceTier: null,
      cwd: "E:/code/FPGA",
      approvalPolicy: "on-request",
      sandbox: { type: "workspace-write", networkAccess: false, writableRoots: [], readableRoots: null },
      reasoningEffort: "medium",
    },
  };
}

function createSubAgentSource(parentThreadId = "thread-1") {
  return { subAgent: { thread_spawn: { parent_thread_id: parentThreadId, depth: 1, agent_nickname: null, agent_role: "explorer" } } };
}

function createCollabTurn(childThreadId: string, status: "completed" | "errored" | "shutdown" | "notFound") {
  return {
    id: "turn-1",
    status: "completed" as const,
    error: null,
    items: [{
      type: "collabAgentToolCall" as const,
      id: "collab-1",
      tool: "spawnAgent" as const,
      status: "completed" as const,
      senderThreadId: "thread-1",
      receiverThreadIds: [childThreadId],
      prompt: "inspect ui",
      agentsStates: {
        [childThreadId]: { status, message: status === "notFound" ? null : "done" }
      }
    }]
  };
}

function createSendOptions(text: string, attachments: ReadonlyArray<ComposerAttachment> = []) {
  return {
    text,
    attachments,
    selection: { model: "gpt-5.2", effort: "medium" as const, serviceTier: null },
    permissionLevel: "default" as const,
    collaborationPreset: "default" as const,
  };
}

function renderConversation(
  hostBridge: HostBridge,
  collaborationModes = [
    { name: "default", mode: "default", model: "gpt-5.2", reasoningEffort: null },
    { name: "plan", mode: "plan", model: "gpt-5.2", reasoningEffort: "medium" },
  ] as const,
) {
  return renderHook(() => {
    const store = useAppStore();
    const conversation = useWorkspaceConversation({
      hostBridge,
      selectedRootPath: "E:/code/FPGA",
      collaborationModes,
      followUpQueueMode: "queue",
    });
    return { store, conversation };
  }, { wrapper: Wrapper });
}

function createNotificationContext(dispatch: ReturnType<typeof useAppStore>["dispatch"]) {
  return {
    dispatch,
    textDeltaQueue: new FrameTextDeltaQueue({ onFlush: () => undefined }),
    outputDeltaQueue: new OutputDeltaQueue({ onFlush: () => undefined }),
  };
}

describe("useWorkspaceConversation", () => {
  it("opens a local draft instead of creating a real thread immediately", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
    });

    expect(request).not.toHaveBeenCalled();
    expect(result.current.conversation.draftActive).toBe(true);
    expect(result.current.conversation.selectedThreadId).toBeNull();
    expect(result.current.conversation.selectedThread).toBeNull();
    expect(result.current.conversation.workspaceThreads).toHaveLength(0);
  });

  it("filters composer-owned fuzzy search sessions from timeline activities", () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "fuzzySearch/updated", sessionId: createComposerFuzzySessionId(), query: "app", files: [] });
      result.current.store.dispatch({ type: "fuzzySearch/updated", sessionId: "plain-session", query: "app", files: [{ root: "E:/code/FPGA", path: "src/App.tsx", file_name: "App.tsx", score: 1, indices: null }] });
    });

    expect(result.current.conversation.activities.filter((entry) => entry.kind === "fuzzySearch")).toHaveLength(1);
    expect(result.current.conversation.activities.find((entry) => entry.kind === "fuzzySearch")?.itemId).toBe("plain-session");
  });

  it("clears draft mode after selecting an existing thread", async () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
    });

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.conversation.selectThread("thread-1");
    });

    expect(result.current.conversation.draftActive).toBe(false);
    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
  });

  it("starts official conversation on first send after opening a draft", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return {
          requestId: "request-1",
          result: {
            thread: createThread(),
            model: "gpt-5.2",
            modelProvider: "openai",
            serviceTier: null,
            cwd: "E:/code/FPGA",
            approvalPolicy: "on-request",
            sandbox: { type: "workspace-write", networkAccess: false, writableRoots: [], readableRoots: null },
            reasoningEffort: "medium",
          },
        };
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
    });

    act(() => {
      result.current.store.dispatch({ type: "input/changed", value: "请分析当前工作区" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("first turn"));
    });

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: "thread/start", params: expect.objectContaining({ approvalPolicy: "on-request", sandbox: "workspace-write" }) }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ approvalPolicy: "on-request", sandboxPolicy: expect.objectContaining({ type: "workspaceWrite", networkAccess: false }) }) }));
    expect(result.current.conversation.draftActive).toBe(false);
    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
  });

  it("keeps the first pending turn in responding state before turn/start resolves", async () => {
    const turnStartDeferred = createDeferred<{ requestId: string; result: { turn: ReturnType<typeof createTurn> } }>();
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return {
          requestId: "request-1",
          result: {
            thread: createThread(),
            model: "gpt-5.2",
            modelProvider: "openai",
            serviceTier: null,
            cwd: "E:/code/FPGA",
            approvalPolicy: "on-request",
            sandbox: { type: "workspace-write", networkAccess: false, writableRoots: [], readableRoots: null },
            reasoningEffort: "medium",
          },
        };
      }
      if (input.method === "turn/start") {
        return turnStartDeferred.promise;
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);
    let sendPromise: Promise<void> | null = null;

    await act(async () => {
      await result.current.conversation.createThread();
    });

    await act(async () => {
      sendPromise = result.current.conversation.sendTurn(createSendOptions("first turn"));
      await Promise.resolve();
    });

    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
    expect(result.current.conversation.isResponding).toBe(true);

    await act(async () => {
      turnStartDeferred.resolve({ requestId: "request-2", result: { turn: createTurn() } });
      await sendPromise;
    });

    expect(result.current.conversation.isResponding).toBe(true);
  });

  it("forwards fast service tier to thread/start and turn/start without sending priority", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return {
          requestId: "request-1",
          result: {
            thread: createThread(),
            model: "gpt-5.2",
            modelProvider: "openai",
            serviceTier: "fast",
            cwd: "E:/code/FPGA",
            approvalPolicy: "on-request",
            sandbox: { type: "workspace-write", networkAccess: false, writableRoots: [], readableRoots: null },
            reasoningEffort: "medium",
          },
        };
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
    });

    await act(async () => {
      await result.current.conversation.sendTurn({
        ...createSendOptions("first fast turn"),
        selection: { model: "gpt-5.2", effort: "medium", serviceTier: "fast" }
      });
    });

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: "thread/start", params: expect.objectContaining({ serviceTier: "fast" }) }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ serviceTier: "fast" }) }));
    expect(JSON.stringify(request.mock.calls[0]?.[0] ?? {})).not.toContain("priority");
    expect(JSON.stringify(request.mock.calls[1]?.[0] ?? {})).not.toContain("priority");
  });

  it("sends an explicit default collaboration mode override for plan implementation", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "request-1", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({
        ...createSendOptions("Implement the plan."),
        collaborationModeOverridePreset: "default",
      });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        collaborationMode: {
          mode: "default",
          settings: {
            model: "gpt-5.2",
            reasoning_effort: "medium",
            developer_instructions: null,
          },
        },
      }),
    }));
  });

  it("does not send an explicit default collaboration mode during normal default turns", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "request-1", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("normal default turn"));
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({ collaborationMode: undefined }),
    }));
  });

  it("keeps sending the explicit plan collaboration mode for plan turns", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "request-1", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({
        ...createSendOptions("refine the plan"),
        collaborationPreset: "plan",
      });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        collaborationMode: expect.objectContaining({ mode: "plan" }),
      }),
    }));
  });

  it("does not resume the brand new thread after thread/started and still allows interrupt", async () => {
    let resumeCalls = 0;
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return {
          requestId: "request-1",
          result: {
            thread: createThread(),
            model: "gpt-5.2",
            modelProvider: "openai",
            serviceTier: null,
            cwd: "E:/code/FPGA",
            approvalPolicy: "on-request",
            sandbox: { type: "workspace-write", networkAccess: false, writableRoots: [], readableRoots: null },
            reasoningEffort: "medium",
          },
        };
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      if (input.method === "turn/interrupt") {
        return { requestId: "request-3", result: { success: true } };
      }
      if (input.method === "thread/resume") {
        resumeCalls += 1;
        return { requestId: "request-4", result: { thread: createThread({ turns: [createTurn()] }) } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
    });

    act(() => {
      result.current.store.dispatch({ type: "input/changed", value: "璇峰垎鏋愬綋鍓嶅伐浣滃尯" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("analyze workspace"));
    });

    act(() => {
      applyAppServerNotification(createNotificationContext(result.current.store.dispatch), "thread/started", { thread: createThread() });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resumeCalls).toBe(0);
    expect(result.current.conversation.isResponding).toBe(true);

    await act(async () => {
      await result.current.conversation.interruptActiveTurn();
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" } }));

    act(() => {
      const notificationContext = createNotificationContext(result.current.store.dispatch);
      applyAppServerNotification(notificationContext, "turn/completed", { threadId: "thread-1", turn: createTurn("completed") });
      applyAppServerNotification(notificationContext, "thread/status/changed", { threadId: "thread-1", status: { type: "idle" } });
    });

    expect(result.current.conversation.isResponding).toBe(false);
  });

  it("queues follow-ups when selected conversation is active", async () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);
    const attachments = [{ id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" }] as const;

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "conversation/turnPlaceholderAdded", conversationId: "thread-1", params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: "E:/code/FPGA", model: "gpt-5.2", effort: "medium", serviceTier: null, collaborationMode: null } });
      result.current.store.dispatch({ type: "conversation/turnStarted", conversationId: "thread-1", turn: createTurn() });
      result.current.store.dispatch({ type: "conversation/statusChanged", conversationId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "继续修测试" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("continue test", attachments));
    });

    expect(result.current.conversation.queuedFollowUps).toHaveLength(1);
    expect(result.current.conversation.queuedFollowUps[0]?.permissionLevel).toBe("default");
    expect(result.current.conversation.queuedFollowUps[0]?.attachments).toEqual(attachments);
  });

  it("sends official attachment inputs on turn start", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "request-1", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);
    const attachments = [
      { id: "image-1", kind: "image", source: "localImage", name: "image.png", value: "E:/code/codex-app-plus/image.png" },
      { id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" },
    ] as const;

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("inspect attachments", attachments));
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          { type: "text", text: "inspect attachments", text_elements: [] },
          { type: "localImage", path: "E:/code/codex-app-plus/image.png" },
          { type: "mention", name: "notes.md", path: "E:/code/codex-app-plus/notes.md" },
        ],
      }),
    }));
  });

  it("steers the active turn when requested", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/steer") {
        return { requestId: "request-1", result: { turnId: "turn-1" } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "conversation/turnPlaceholderAdded", conversationId: "thread-1", params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: "E:/code/FPGA", model: "gpt-5.2", effort: "medium", serviceTier: null, collaborationMode: null } });
      result.current.store.dispatch({ type: "conversation/turnStarted", conversationId: "thread-1", turn: createTurn() });
      result.current.store.dispatch({ type: "conversation/statusChanged", conversationId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "先看失败测试" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ ...createSendOptions("look at failure first"), followUpOverride: "steer" });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/steer" }));
  });

  it("overrides an existing thread to full access on the next turn", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "request-1", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "input/changed", value: "切到完全访问" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ ...createSendOptions("switch to full access"), permissionLevel: "full" });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } }) }));
  });


  it("updates thread branch metadata and refreshes the selected thread", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/metadata/update") {
        return { requestId: "request-1", result: { thread: createThread({ gitInfo: { sha: null, branch: "feature/agent", originUrl: null } }) } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await result.current.conversation.updateThreadBranch("feature/agent");
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/metadata/update", params: { threadId: "thread-1", gitInfo: { branch: "feature/agent" } } }));
    expect(result.current.conversation.selectedThread?.branch).toBe("feature/agent");
  });

  it("interrupts the active turn once and clears pending state after completion", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: "request-1", result: { success: true } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "conversation/turnPlaceholderAdded", conversationId: "thread-1", params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: "E:/code/FPGA", model: "gpt-5.2", effort: "medium", serviceTier: null, collaborationMode: null } });
      result.current.store.dispatch({ type: "conversation/turnStarted", conversationId: "thread-1", turn: createTurn() });
      result.current.store.dispatch({ type: "conversation/statusChanged", conversationId: "thread-1", status: "active", activeFlags: [] });
    });

    expect(result.current.conversation.isResponding).toBe(true);
    expect(result.current.conversation.interruptPending).toBe(false);

    await act(async () => {
      await result.current.conversation.interruptActiveTurn();
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" } }));
    expect(result.current.conversation.interruptPending).toBe(true);

    await act(async () => {
      await result.current.conversation.interruptActiveTurn();
    });

    expect(request).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.store.dispatch({ type: "conversation/turnCompleted", conversationId: "thread-1", turn: createTurn("completed") });
      result.current.store.dispatch({ type: "conversation/statusChanged", conversationId: "thread-1", status: "idle", activeFlags: [] });
    });

    expect(result.current.conversation.isResponding).toBe(false);
    expect(result.current.conversation.interruptPending).toBe(false);
  });

  it("does not clean up a non-selected thread with only a placeholder in-progress turn", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: "clean-1", result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: "unsubscribe-1", result: { status: "unsubscribed" } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-1" }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-2", preview: "other" }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-2" });
      result.current.store.dispatch({
        type: "conversation/turnPlaceholderAdded",
        conversationId: "thread-1",
        params: {
          input: [{ type: "text", text: "pending", text_elements: [] }],
          cwd: "E:/code/FPGA",
          model: "gpt-5.2",
          effort: "medium",
          serviceTier: null,
          collaborationMode: null,
        },
      });
    });

    expect(result.current.store.state.conversationsById["thread-1"]?.turns[0]?.turnId).toBeNull();
    expect(result.current.store.state.conversationsById["thread-1"]?.turns[0]?.status).toBe("inProgress");

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
  });

  it("does not unload a zero-turn thread when thread/started arrives before thread/start resolves", async () => {
    const threadStartDeferred = createDeferred<ReturnType<typeof createThreadStartResponse>>();
    const turnStartDeferred = createDeferred<{ requestId: string; result: { turn: ReturnType<typeof createTurn> } }>();
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") return threadStartDeferred.promise;
      if (input.method === "turn/start") return turnStartDeferred.promise;
      if (input.method === "thread/backgroundTerminals/clean") return { requestId: "clean-1", result: {} };
      if (input.method === "thread/unsubscribe") return { requestId: "unsubscribe-1", result: { status: "unsubscribed" } };
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);
    let sendPromise: Promise<void> | null = null;

    await act(async () => {
      await result.current.conversation.createThread();
    });
    await act(async () => {
      sendPromise = result.current.conversation.sendTurn(createSendOptions("first turn"));
      await Promise.resolve();
    });
    act(() => {
      applyAppServerNotification(createNotificationContext(result.current.store.dispatch), "thread/started", { thread: createThread({ id: "thread-1" }) });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));

    await act(async () => {
      threadStartDeferred.resolve(createThreadStartResponse({ id: "thread-1" }));
      await Promise.resolve();
    });

    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
    expect(result.current.conversation.isResponding).toBe(true);

    await act(async () => {
      turnStartDeferred.resolve({ requestId: "request-2", result: { turn: createTurn() } });
      await sendPromise;
    });

    expect(result.current.conversation.isResponding).toBe(true);
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
  });

  it("unloads a non-selected idle main thread after switching selection", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: "clean-1", result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: "unsubscribe-1", result: { status: "unsubscribed" } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-1", turns: [createTurn("completed")] }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-2", preview: "thread 2" }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-2" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
  });

  it("unloads a hidden idle main thread", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: "clean-1", result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: "unsubscribe-1", result: { status: "unsubscribed" } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({ id: "thread-1", turns: [createTurn("completed")] }), { hidden: true, resumeState: "resumed" })
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
  });

  it("cleans up completed sub-agent threads", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: "clean-1", result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: "unsubscribe-1", result: { status: "unsubscribed" } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          id: "thread-1",
          turns: [createCollabTurn("thread-2", "completed")],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          id: "thread-2",
          preview: "child",
          source: createSubAgentSource(),
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-2" } }));
  });

  it("does not retry cleanup for sub-agents already marked notFound", async () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          id: "thread-1",
          turns: [createCollabTurn("thread-2", "notFound")],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).not.toHaveBeenCalled();
  });
});
