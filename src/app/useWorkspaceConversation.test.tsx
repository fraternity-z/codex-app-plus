import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../bridge/types";
import { AppStoreProvider, useAppStore } from "../state/store";
import { createConversationFromThread } from "./conversationState";
import { useWorkspaceConversation } from "./useWorkspaceConversation";

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

function renderConversation(hostBridge: HostBridge) {
  return renderHook(() => {
    const store = useAppStore();
    const conversation = useWorkspaceConversation({
      hostBridge,
      selectedRootPath: "E:/code/FPGA",
      collaborationModes: [{ name: "plan", mode: "plan", model: "gpt-5.2", reasoningEffort: "medium" }],
      followUpQueueMode: "queue",
    });
    return { store, conversation };
  }, { wrapper: Wrapper });
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
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, permissionLevel: "default", planModeEnabled: false });
    });

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: "thread/start", params: expect.objectContaining({ approvalPolicy: "on-request", sandbox: "workspace-write" }) }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ approvalPolicy: "on-request", sandboxPolicy: expect.objectContaining({ type: "workspaceWrite", networkAccess: false }) }) }));
    expect(result.current.conversation.draftActive).toBe(false);
    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
  });

  it("queues follow-ups when selected conversation is active", async () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "conversation/turnPlaceholderAdded", conversationId: "thread-1", params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: "E:/code/FPGA", model: "gpt-5.2", effort: "medium", collaborationMode: null } });
      result.current.store.dispatch({ type: "conversation/turnStarted", conversationId: "thread-1", turn: createTurn() });
      result.current.store.dispatch({ type: "conversation/statusChanged", conversationId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "继续修测试" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, permissionLevel: "default", planModeEnabled: false });
    });

    expect(result.current.conversation.queuedFollowUps).toHaveLength(1);
    expect(result.current.conversation.queuedFollowUps[0]?.permissionLevel).toBe("default");
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
      result.current.store.dispatch({ type: "conversation/turnPlaceholderAdded", conversationId: "thread-1", params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: "E:/code/FPGA", model: "gpt-5.2", effort: "medium", collaborationMode: null } });
      result.current.store.dispatch({ type: "conversation/turnStarted", conversationId: "thread-1", turn: createTurn() });
      result.current.store.dispatch({ type: "conversation/statusChanged", conversationId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "先看失败测试" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, permissionLevel: "default", planModeEnabled: false, followUpOverride: "steer" });
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
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, permissionLevel: "full", planModeEnabled: false });
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
      result.current.store.dispatch({ type: "conversation/turnPlaceholderAdded", conversationId: "thread-1", params: { input: [{ type: "text", text: "hello", text_elements: [] }], cwd: "E:/code/FPGA", model: "gpt-5.2", effort: "medium", collaborationMode: null } });
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
});
