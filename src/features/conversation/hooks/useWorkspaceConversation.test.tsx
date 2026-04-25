import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { AppStoreProvider, useAppStore } from "../../../state/store";
import { applyAppServerNotification } from "../../../app/controller/appControllerNotifications";
import type { ComposerAttachment } from "../../../domain/timeline";
import { createConversationFromThread } from "../model/conversationState";
import { FrameTextDeltaQueue } from "../model/frameTextDeltaQueue";
import { OutputDeltaQueue } from "../model/outputDeltaQueue";
import { useWorkspaceConversation } from "./useWorkspaceConversation";
import { FINAL_SUBAGENT_CLEANUP_DELAY_MS, MAIN_THREAD_SOFT_DETACH_DELAY_MS } from "./useThreadResourceCleanup";
import { createComposerFuzzySessionId } from "../../composer/service/composerCommandBridge";
import { serializeComposerFileReferenceDraft } from "../../composer/model/composerFileReferences";
import {
  DEFAULT_COMPOSER_PERMISSION_SETTINGS,
} from "../../composer/model/composerPermission";

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
    forkedFromId: null,
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
  return {
    id: "turn-1",
    items: [],
    status,
    error: null,
    startedAt: 1,
    completedAt: status === "completed" ? 2 : null,
    durationMs: status === "completed" ? 1000 : null
  };
}

function createTurnWithId(id: string, status: "inProgress" | "completed" = "completed") {
  return { ...createTurn(status), id };
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
    startedAt: 1,
    completedAt: 2,
    durationMs: 1000,
    items: [{
      type: "collabAgentToolCall" as const,
      id: "collab-1",
      tool: "spawnAgent" as const,
      status: "completed" as const,
      senderThreadId: "thread-1",
      receiverThreadIds: [childThreadId],
      prompt: "inspect ui",
      model: null,
      reasoningEffort: null,
      agentsStates: {
        [childThreadId]: { status, message: status === "notFound" ? null : "done" }
      }
    }]
  };
}

function createRunningCollabTurn(
  senderThreadId: string,
  childThreadIds: ReadonlyArray<string>,
) {
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
      receiverThreadIds: [...childThreadIds],
      prompt: "inspect ui",
      model: null,
      reasoningEffort: null,
      agentsStates: Object.fromEntries(childThreadIds.map((threadId) => [threadId, { status: "running", message: null }])),
    }],
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

function createQueuedFollowUp(id: string, text: string) {
  return {
    id,
    text,
    attachments: [],
    model: "gpt-5.2",
    effort: "medium" as const,
    serviceTier: null,
    permissionLevel: "default" as const,
    collaborationPreset: "default" as const,
    mode: "queue" as const,
    createdAt: "2026-03-06T09:00:00.000Z",
  };
}

function renderConversation(
  hostBridge: HostBridge,
  collaborationModes = [
    { name: "default", mode: "default", model: "gpt-5.2", reasoningEffort: null },
    { name: "plan", mode: "plan", model: "gpt-5.2", reasoningEffort: "medium" },
  ] as const,
  selectedRootPath = "E:/code/FPGA",
  initialAppServerReady = true,
  steerAvailable = true,
) {
  return renderHook((props: { readonly rootPath: string | null; readonly appServerReady: boolean }) => {
      const store = useAppStore();
      const conversation = useWorkspaceConversation({
        agentEnvironment: "windowsNative",
        hostBridge,
        appServerReady: props.appServerReady,
        selectedRootPath: props.rootPath,
        collaborationModes,
        steerAvailable,
        followUpQueueMode: "queue",
        permissionSettings: DEFAULT_COMPOSER_PERMISSION_SETTINGS,
      });
    return { store, conversation };
  }, { initialProps: { rootPath: selectedRootPath, appServerReady: initialAppServerReady }, wrapper: Wrapper });
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

  it("opens a local draft for an explicit workspace path override", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge, undefined, "E:/code/FPGA");

    await act(async () => {
      await result.current.conversation.createThread({ workspacePath: "E:/code/codex-app-plus" });
    });

    expect(result.current.store.state.draftConversation?.workspacePath).toBe("E:/code/codex-app-plus");
    expect(result.current.conversation.draftActive).toBe(true);
  });

  it("does not keep a selected thread from another workspace active", async () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({ id: "thread-local", cwd: "E:/code/FPGA" }), { resumeState: "resumed" }),
      });
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({ id: "thread-remote", cwd: "E:/code/other-workspace" }), { resumeState: "resumed" }),
      });
      result.current.conversation.selectThread("thread-remote");
    });

    await waitFor(() => {
      const visibleThreadIds = result.current.conversation.visibleThreads.map((thread) => thread.id);
      expect(result.current.conversation.selectedThreadId).toBeNull();
      expect(result.current.conversation.selectedThread).toBeNull();
      expect(result.current.conversation.activities).toEqual([]);
      expect(visibleThreadIds).toHaveLength(2);
      expect(visibleThreadIds).toEqual(expect.arrayContaining(["thread-local", "thread-remote"]));
      expect(result.current.conversation.workspaceThreads.map((thread) => thread.id)).toEqual(["thread-local"]);
    });
  });

  it("filters composer-owned fuzzy search sessions from timeline activities", () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "fuzzySearch/updated", sessionId: createComposerFuzzySessionId(), query: "app", files: [] });
      result.current.store.dispatch({
        type: "fuzzySearch/updated",
        sessionId: "plain-session",
        query: "app",
        files: [{ root: "E:/code/FPGA", path: "src/App.tsx", match_type: "file", file_name: "App.tsx", score: 1, indices: null }]
      });
    });

    expect(result.current.conversation.activities.filter((entry) => entry.kind === "fuzzySearch")).toHaveLength(1);
    expect(result.current.conversation.activities.find((entry) => entry.kind === "fuzzySearch")?.itemId).toBe("plain-session");
  });

  it("reuses workspace thread summaries when only selected thread content changes", () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          turns: [{
            id: "turn-1",
            status: "inProgress" as const,
            error: null,
            items: [{ type: "agentMessage" as const, id: "assistant-1", text: "", phase: null, memoryCitation: null }],
          }],
        }), { resumeState: "resumed" }),
      });
      result.current.conversation.selectThread("thread-1");
    });

    const previousThreads = result.current.conversation.workspaceThreads;
    const previousSelectedThread = result.current.conversation.selectedThread;

    act(() => {
      result.current.store.dispatch({
        type: "conversation/textDeltasFlushed",
        entries: [{
          conversationId: "thread-1",
          turnId: "turn-1",
          itemId: "assistant-1",
          target: { type: "agentMessage" },
          delta: "delta",
        }],
      });
    });

    expect(result.current.conversation.workspaceThreads).toBe(previousThreads);
    expect(result.current.conversation.selectedThread).toBe(previousSelectedThread);
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

  it("hides a selected thread when switching to another workspace", () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result, rerender } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread(), { resumeState: "resumed" }),
      });
      result.current.conversation.selectThread("thread-1");
    });

    expect(result.current.conversation.selectedThreadId).toBe("thread-1");

    rerender({ rootPath: "E:/code/another-workspace", appServerReady: true });

    expect(result.current.conversation.selectedThreadId).toBeNull();
    expect(result.current.conversation.selectedThread).toBeNull();
    expect(result.current.conversation.workspaceThreads).toHaveLength(0);
  });

  it("keeps collaboration presets isolated between threads", () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({ id: "thread-1" }), { resumeState: "resumed" }),
      });
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({ id: "thread-2" }), { resumeState: "resumed" }),
      });
      result.current.conversation.selectThread("thread-1");
    });

    expect(result.current.conversation.collaborationPreset).toBe("default");

    act(() => {
      result.current.conversation.selectCollaborationPreset("plan");
      result.current.conversation.selectThread("thread-2");
    });

    expect(result.current.conversation.collaborationPreset).toBe("default");

    act(() => {
      result.current.conversation.selectThread("thread-1");
    });

    expect(result.current.conversation.collaborationPreset).toBe("plan");
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

  it("expands custom prompts before sending the turn", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return createThreadStartResponse();
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "customPrompts/loaded",
        prompts: [{
          name: "review-branch",
          path: "~/.codex/prompts/review-branch.md",
          content: "Review $USER changes on $BRANCH",
          description: "Review branch changes",
          argumentHint: null,
        }],
      });
    });

    await act(async () => {
      await result.current.conversation.sendTurn(
        createSendOptions('/prompts:review-branch USER="Alice Smith" BRANCH=main'),
      );
    });

    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [{
          type: "text",
          text: "Review Alice Smith changes on main",
          text_elements: [],
        }],
      }),
    }));
  });

  it("surfaces custom prompt argument errors without starting a turn", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return createThreadStartResponse();
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "customPrompts/loaded",
        prompts: [{
          name: "review-branch",
          path: "~/.codex/prompts/review-branch.md",
          content: "Review $USER changes on $BRANCH",
          description: null,
          argumentHint: null,
        }],
      });
    });

    await expect(
      result.current.conversation.sendTurn(createSendOptions("/prompts:review-branch USER=Alice")),
    ).rejects.toThrow("缺少必填参数");
    expect(request).not.toHaveBeenCalled();
  });

  it("rolls back from an edited user message and starts a replacement turn", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: Record<string, unknown> }) => {
      if (input.method === "thread/rollback") {
        return { requestId: "request-rollback", result: { thread: createThread({ turns: [createTurnWithId("turn-1")] }) } };
      }
      if (input.method === "turn/start") {
        return { requestId: "request-start", result: { turn: createTurnWithId("turn-new", "inProgress") } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          turns: [
            createTurnWithId("turn-1"),
            createTurnWithId("turn-2"),
            createTurnWithId("turn-3"),
          ],
        }), { resumeState: "resumed" }),
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await act(async () => {
      await result.current.conversation.regenerateFromEditedUserMessage({
        threadId: "thread-1",
        turnId: "turn-2",
        text: "edited request",
        attachments: [{ kind: "file", source: "mention", name: "notes.md", value: "E:/code/FPGA/notes.md" }],
        selection: { model: "gpt-5.2", effort: "medium", serviceTier: null },
        permissionLevel: "default",
        collaborationPreset: "default",
      });
    });

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "thread/rollback",
      params: { threadId: "thread-1", numTurns: 2 },
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        threadId: "thread-1",
        input: [
          { type: "text", text: "edited request", text_elements: [] },
          { type: "mention", name: "notes.md", path: "E:/code/FPGA/notes.md" },
        ],
      }),
    }));
  });

  it("does not rollback an edited message while the conversation is streaming", async () => {
    const request = vi.fn(async (input: { readonly method: string }) => {
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          status: { type: "active" as const, activeFlags: [] },
          turns: [createTurnWithId("turn-1", "inProgress")],
        }), { resumeState: "resumed" }),
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    await expect(result.current.conversation.regenerateFromEditedUserMessage({
      threadId: "thread-1",
      turnId: "turn-1",
      text: "edited request",
      attachments: [],
      selection: { model: "gpt-5.2", effort: "medium", serviceTier: null },
      permissionLevel: "default",
      collaborationPreset: "default",
    })).rejects.toThrow("current response");
    expect(request).not.toHaveBeenCalled();
  });

  it("transfers the draft collaboration preset into the first created thread", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return createThreadStartResponse();
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.conversation.selectCollaborationPreset("plan");
    });

    expect(result.current.conversation.collaborationPreset).toBe("plan");

    await act(async () => {
      await result.current.conversation.sendTurn({
        ...createSendOptions("first turn"),
        collaborationPreset: result.current.conversation.collaborationPreset,
      });
    });

    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
    expect(result.current.conversation.collaborationPreset).toBe("plan");
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        collaborationMode: expect.objectContaining({ mode: "plan" }),
      }),
    }));
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

  it("does not auto-resume the brand new thread after explicit interrupt unload", async () => {
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
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: "request-4", result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: "request-5", result: { status: "unsubscribed" } };
      }
      if (input.method === "thread/resume") {
        resumeCalls += 1;
        return { requestId: "request-6", result: { thread: createThread() } };
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

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" } })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } })));
    expect(resumeCalls).toBe(0);
    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
    expect(result.current.conversation.selectedThread?.status).toBe("notLoaded");
    expect(result.current.conversation.isResponding).toBe(false);
    expect(result.current.conversation.interruptPending).toBe(false);
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

  it("promotes a queued follow-up to the front and interrupts the active turn", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: "request-1", result: { success: true } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ status: { type: "active" as const, activeFlags: [] }, turns: [createTurn()] }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "followUp/enqueued", conversationId: "thread-1", followUp: createQueuedFollowUp("follow-1", "first queued") });
      result.current.store.dispatch({ type: "followUp/enqueued", conversationId: "thread-1", followUp: createQueuedFollowUp("follow-2", "second queued") });
    });

    await act(async () => {
      await result.current.conversation.promoteQueuedFollowUp("follow-2");
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" } }));
    expect(result.current.conversation.queuedFollowUps.map((followUp) => followUp.id)).toEqual(["follow-2", "follow-1"]);
  });

  it("starts the promoted queued follow-up immediately when no active turn is present", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "request-1", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ status: { type: "active" as const, activeFlags: [] }, turns: [] }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "followUp/enqueued", conversationId: "thread-1", followUp: createQueuedFollowUp("follow-1", "first queued") });
      result.current.store.dispatch({ type: "followUp/enqueued", conversationId: "thread-1", followUp: createQueuedFollowUp("follow-2", "second queued") });
    });

    await act(async () => {
      await result.current.conversation.promoteQueuedFollowUp("follow-2");
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [{ type: "text", text: "second queued", text_elements: [] }],
      }),
    }));
    expect(result.current.conversation.queuedFollowUps.map((followUp) => followUp.id)).toEqual(["follow-1"]);
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

  it("expands managed file chips into text and mention inputs on turn start", async () => {
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
      await result.current.conversation.sendTurn(createSendOptions(
        serializeComposerFileReferenceDraft("读取文件内容", ["docs/notes.md"]),
      ));
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          { type: "text", text: "读取文件内容\n\ndocs/notes.md", text_elements: [] },
          { type: "mention", name: "notes.md", path: "docs/notes.md" },
        ],
      }),
    }));
  });

  it("starts a fresh turn immediately when steer mode is chosen without an active turn", async () => {
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
      await result.current.conversation.sendTurn({ ...createSendOptions("steer after idle"), followUpOverride: "steer" });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/start" }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "turn/steer" }));
    expect(result.current.conversation.queuedFollowUps).toHaveLength(0);
  });

  it("uses turn/steer for steer follow-ups while the current turn is active", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/steer") {
        return { requestId: "request-1", result: { turnId: "turn-1" } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ status: { type: "active" as const, activeFlags: [] }, turns: [createTurn()] }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "input/changed", value: "打断后继续" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ ...createSendOptions("steer from follow-up"), followUpOverride: "steer" });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "turn/steer",
      params: {
        threadId: "thread-1",
        expectedTurnId: "turn-1",
        input: [{ type: "text", text: "steer from follow-up", text_elements: [] }],
      },
    }));
    expect(result.current.conversation.queuedFollowUps).toHaveLength(0);
  });

  it("surfaces an explicit error when steer follow-ups are unavailable", async () => {
    const request = vi.fn(async () => ({ requestId: "noop", result: {} }));
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge, undefined, "E:/code/FPGA", true, false);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ status: { type: "active" as const, activeFlags: [] }, turns: [createTurn()] }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "input/changed", value: "继续排队" });
    });

    await expect(
      result.current.conversation.sendTurn({ ...createSendOptions("steer while unavailable"), followUpOverride: "steer" }),
    ).rejects.toThrow("当前 Codex 配置未启用 steer");

    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "turn/steer" }));
    expect(result.current.conversation.queuedFollowUps).toHaveLength(0);
  });

  it("reorders the queue without sending another interrupt when one is already pending", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: "request-1", result: { success: true } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ status: { type: "active" as const, activeFlags: [] }, turns: [createTurn()] }), { resumeState: "resumed" }) });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
      result.current.store.dispatch({ type: "followUp/enqueued", conversationId: "thread-1", followUp: createQueuedFollowUp("follow-1", "first queued") });
      result.current.store.dispatch({ type: "followUp/enqueued", conversationId: "thread-1", followUp: createQueuedFollowUp("follow-2", "second queued") });
      result.current.store.dispatch({ type: "turn/interruptRequested", conversationId: "thread-1", turnId: "turn-1" });
    });

    await act(async () => {
      await result.current.conversation.promoteQueuedFollowUp("follow-2");
    });

    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt" }));
    expect(result.current.conversation.queuedFollowUps.map((followUp) => followUp.id)).toEqual(["follow-2", "follow-1"]);
  });

  it("waits for the app server to become ready before resuming a selected thread", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/resume") {
        return { requestId: "request-1", result: { thread: createThread() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result, rerender } = renderConversation(hostBridge, undefined, "E:/code/FPGA", false);

    act(() => {
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread(), { resumeState: "needs_resume" }),
      });
      result.current.conversation.selectThread("thread-1");
    });

    expect(request).not.toHaveBeenCalled();

    rerender({ rootPath: "E:/code/FPGA", appServerReady: true });

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "thread/resume",
      params: { threadId: "thread-1", persistExtendedHistory: true },
    })));
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

  it("uses configured access-mode mappings for new threads and turns", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") {
        return createThreadStartResponse();
      }
      if (input.method === "turn/start") {
        return { requestId: "request-2", result: { turn: createTurn() } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderHook(() => {
      const store = useAppStore();
      const conversation = useWorkspaceConversation({
        agentEnvironment: "windowsNative",
        hostBridge,
        selectedRootPath: "E:/code/FPGA",
        collaborationModes: [{ name: "default", mode: "default", model: "gpt-5.2", reasoningEffort: null }],
        steerAvailable: true,
        followUpQueueMode: "queue",
        permissionSettings: {
          defaultApprovalPolicy: "on-failure",
          defaultSandboxMode: "read-only",
          fullApprovalPolicy: "untrusted",
          fullSandboxMode: "workspace-write",
        },
      });
      return { store, conversation };
    }, { wrapper: Wrapper });

    await act(async () => {
      await result.current.conversation.createThread();
      await result.current.conversation.sendTurn(createSendOptions("first turn"));
    });

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "thread/start",
      params: expect.objectContaining({ approvalPolicy: "on-failure", sandbox: "read-only" }),
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        approvalPolicy: "on-failure",
        sandboxPolicy: {
          type: "readOnly",
          access: { type: "restricted", includePlatformDefaults: true, readableRoots: [] },
          networkAccess: false,
        },
      }),
    }));
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

  it("interrupt button force-cleans descendants before unloading the selected thread", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: `interrupt-${String((input.params as { threadId: string }).threadId)}`, result: { success: true } };
      }
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: `clean-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: `unsubscribe-${String((input.params as { threadId: string }).threadId)}`, result: { status: "unsubscribed" } };
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
          status: { type: "active" as const, activeFlags: [] },
          turns: [createRunningCollabTurn("thread-1", ["thread-2"]), createTurn()],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          id: "thread-2",
          source: createSubAgentSource(),
          status: { type: "active" as const, activeFlags: [] },
          turns: [createTurn()],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    expect(result.current.conversation.isResponding).toBe(true);

    await act(async () => {
      await result.current.conversation.interruptActiveTurn();
    });

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-2", turnId: "turn-1" } })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } })));
    const childUnsubscribeCall = request.mock.calls.findIndex(([input]) => input.method === "thread/unsubscribe" && (input.params as { threadId: string }).threadId === "thread-2");
    const rootUnsubscribeCall = request.mock.calls.findIndex(([input]) => input.method === "thread/unsubscribe" && (input.params as { threadId: string }).threadId === "thread-1");
    expect(childUnsubscribeCall).toBeGreaterThanOrEqual(0);
    expect(rootUnsubscribeCall).toBeGreaterThanOrEqual(0);
    expect(request.mock.invocationCallOrder[childUnsubscribeCall]).toBeLessThan(request.mock.invocationCallOrder[rootUnsubscribeCall]);
    expect(result.current.conversation.selectedThreadId).toBe("thread-1");
    expect(result.current.conversation.selectedThread?.status).toBe("notLoaded");
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
    vi.useFakeTimers();
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

    try {
      act(() => {
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-1", turns: [createTurn("completed")] }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-2", preview: "thread 2" }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-2" });
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MAIN_THREAD_SOFT_DETACH_DELAY_MS);
      });

      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
      expect(result.current.store.state.conversationsById["thread-1"]?.resumeState).toBe("needs_resume");
      expect(result.current.store.state.conversationsById["thread-1"]?.status).toBe("notLoaded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("force cleans descendant agents when soft detaching an idle main thread", async () => {
    vi.useFakeTimers();
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

    try {
      act(() => {
        result.current.store.dispatch({
          type: "conversation/upserted",
          conversation: createConversationFromThread(createThread({
            id: "thread-1",
            turns: [createRunningCollabTurn("thread-1", ["thread-2"])],
          }), { resumeState: "resumed" })
        });
        result.current.store.dispatch({
          type: "conversation/upserted",
          conversation: createConversationFromThread(createThread({
            id: "thread-2",
            preview: "child",
            source: createSubAgentSource("thread-1"),
          }), { resumeState: "resumed" })
        });
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-3", preview: "thread 3" }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-3" });
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } }));
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MAIN_THREAD_SOFT_DETACH_DELAY_MS);
      });

      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } }));
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-2" } }));
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
      expect(result.current.store.state.conversationsById["thread-2"]?.resumeState).toBe("needs_resume");
      expect(result.current.store.state.conversationsById["thread-1"]?.resumeState).toBe("needs_resume");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels scheduled soft cleanup when the thread is selected again", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/start") {
        return { requestId: "turn-start", result: { turn: createTurn() } };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: "unsubscribe-1", result: { status: "unsubscribed" } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    try {
      act(() => {
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-1", turns: [createTurn("completed")] }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-2", preview: "thread 2" }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-2" });
      });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.conversation.selectThread("thread-1");
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.conversation.selectedThreadId).toBe("thread-1");
      await act(async () => {
        await result.current.conversation.sendTurn(createSendOptions("continue"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(MAIN_THREAD_SOFT_DETACH_DELAY_MS);
      });

      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ threadId: "thread-1" }) }));
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for in-flight soft cleanup before resuming and sending", async () => {
    vi.useFakeTimers();
    const unsubscribeDeferred = createDeferred<{ requestId: string; result: { status: "unsubscribed" } }>();
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/unsubscribe") {
        return unsubscribeDeferred.promise;
      }
      if (input.method === "thread/resume") {
        return { requestId: "resume-1", result: { thread: createThread({ id: "thread-1", turns: [createTurn("completed")] }) } };
      }
      if (input.method === "turn/start") {
        return { requestId: "turn-start", result: { turn: createTurn() } };
      }
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    try {
      act(() => {
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-1", turns: [createTurn("completed")] }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(createThread({ id: "thread-2", preview: "thread 2" }), { resumeState: "resumed" }) });
        result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-2" });
      });
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(MAIN_THREAD_SOFT_DETACH_DELAY_MS);
      });
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));

      let sendPromise: Promise<void> | null = null;
      act(() => {
        result.current.conversation.selectThread("thread-1");
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.conversation.selectedThreadId).toBe("thread-1");
      await act(async () => {
        sendPromise = result.current.conversation.sendTurn(createSendOptions("continue"));
        await Promise.resolve();
      });

      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/resume", params: expect.objectContaining({ threadId: "thread-1" }) }));
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ threadId: "thread-1" }) }));

      await act(async () => {
        unsubscribeDeferred.resolve({ requestId: "unsubscribe-1", result: { status: "unsubscribed" } });
        await sendPromise;
      });

      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/resume", params: expect.objectContaining({ threadId: "thread-1" }) }));
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/start", params: expect.objectContaining({ threadId: "thread-1" }) }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not unload a non-selected thread with pending user input", async () => {
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
      result.current.store.dispatch({
        type: "serverRequest/received",
        request: {
          kind: "userInput",
          id: "request-1",
          rpcId: 1,
          method: "item/tool/requestUserInput",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", questions: [] },
          questions: [],
        },
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-2" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
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

  it("force-cleans descendants when a selected main thread is naturally closed", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: `interrupt-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: `clean-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: `unsubscribe-${String((input.params as { threadId: string }).threadId)}`, result: { status: "unsubscribed" } };
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
          turns: [createRunningCollabTurn("thread-1", ["thread-2"])],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          id: "thread-2",
          source: createSubAgentSource(),
          status: { type: "active" as const, activeFlags: [] },
          turns: [createTurn()],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    });

    act(() => {
      applyAppServerNotification(createNotificationContext(result.current.store.dispatch), "thread/closed", { threadId: "thread-1" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-2", turnId: "turn-1" } })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-2" } })));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
  });

  it("force-cleans hidden main threads even with pending user input", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: `interrupt-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: `clean-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: `unsubscribe-${String((input.params as { threadId: string }).threadId)}`, result: { status: "unsubscribed" } };
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
          status: { type: "active" as const, activeFlags: ["waitingOnUserInput"] },
          turns: [createRunningCollabTurn("thread-1", ["thread-2"]), createTurn()],
        }), { hidden: true, resumeState: "resumed" })
      });
      result.current.store.dispatch({
        type: "conversation/upserted",
        conversation: createConversationFromThread(createThread({
          id: "thread-2",
          source: createSubAgentSource(),
          status: { type: "active" as const, activeFlags: [] },
          turns: [createTurn()],
        }), { resumeState: "resumed" })
      });
      result.current.store.dispatch({
        type: "serverRequest/received",
        request: {
          kind: "userInput",
          id: "request-1",
          rpcId: 1,
          method: "item/tool/requestUserInput",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", questions: [] },
          questions: [],
        },
      });
      result.current.store.dispatch({ type: "conversation/selected", conversationId: null });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-2", turnId: "turn-1" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-2" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" } }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-1" } }));
  });

  it("cleans up completed sub-agent threads", async () => {
    vi.useFakeTimers();
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

    try {
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

      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(FINAL_SUBAGENT_CLEANUP_DELAY_MS);
      });

      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-2" } }));
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-2" } }));
      expect(result.current.store.state.conversationsById["thread-2"]?.resumeState).toBe("needs_resume");
    } finally {
      vi.useRealTimers();
    }
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
