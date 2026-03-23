import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { AppStoreProvider, useAppStore } from "../../../state/store";
import { applyAppServerNotification } from "../../../app/controller/appControllerNotifications";
import { FrameTextDeltaQueue } from "./frameTextDeltaQueue";
import { OutputDeltaQueue } from "./outputDeltaQueue";
import { DEFAULT_COMPOSER_PERMISSION_SETTINGS } from "../../composer/model/composerPermission";
import { useWorkspaceConversation } from "../hooks/useWorkspaceConversation";

function Wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

function createThreadData(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    preview: "",
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

function createTurnData(id: string) {
  return { id, items: [], status: "inProgress" as const, error: null };
}

function createSendOptions(text: string) {
  return {
    text,
    attachments: [],
    selection: { model: "gpt-5.2", effort: "medium" as const, serviceTier: null },
    permissionLevel: "default" as const,
    collaborationPreset: "default" as const,
  };
}

function renderConversation(hostBridge: HostBridge) {
  return renderHook(
    () => {
      const store = useAppStore();
      const conversation = useWorkspaceConversation({
        agentEnvironment: "windowsNative",
        hostBridge,
        selectedRootPath: "E:/code/FPGA",
        collaborationModes: [{ name: "plan", mode: "plan", model: "gpt-5.2", reasoningEffort: "medium" }],
        steerAvailable: true,
        followUpQueueMode: "queue",
        permissionSettings: DEFAULT_COMPOSER_PERMISSION_SETTINGS,
      });
      return { store, conversation };
    },
    { wrapper: Wrapper },
  );
}

function createNotificationContext(dispatch: ReturnType<typeof useAppStore>["dispatch"]) {
  return {
    dispatch,
    textDeltaQueue: new FrameTextDeltaQueue({ onFlush: () => undefined }),
    outputDeltaQueue: new OutputDeltaQueue({ onFlush: () => undefined }),
  };
}

describe("useWorkspaceConversation realtime title", () => {
  it("updates the new thread title immediately after the first message", async () => {
    const request = vi.fn(async (input: { readonly method: string }) => {
      if (input.method === "thread/start") {
        return { requestId: "request-thread", result: { thread: createThreadData("thread-1"), cwd: "E:/code/FPGA" } };
      }
      if (input.method === "turn/start") {
        return { requestId: "request-turn", result: { turn: createTurnData("turn-1") } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
      await result.current.conversation.sendTurn(createSendOptions("  请修复聊天标题来源  "));
    });

    expect(result.current.conversation.selectedThread?.title).toBe("请修复聊天标题来源");
    expect(result.current.conversation.workspaceThreads[0]?.title).toBe("请修复聊天标题来源");
  });

  it("replaces the local preview title when the server sends a formal title", async () => {
    const request = vi.fn(async (input: { readonly method: string }) => {
      if (input.method === "thread/start") {
        return { requestId: "request-thread", result: { thread: createThreadData("thread-1"), cwd: "E:/code/FPGA" } };
      }
      if (input.method === "turn/start") {
        return { requestId: "request-turn", result: { turn: createTurnData("turn-1") } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
      await result.current.conversation.sendTurn(createSendOptions("请先用本地标题展示"));
    });

    act(() => {
      applyAppServerNotification(createNotificationContext(result.current.store.dispatch), "thread/name/updated", { threadId: "thread-1", threadName: "服务端正式标题" });
    });

    expect(result.current.conversation.selectedThread?.title).toBe("服务端正式标题");
    expect(result.current.conversation.workspaceThreads[0]?.title).toBe("服务端正式标题");
  });

  it("starts a second thread while the first thread is still active", async () => {
    let threadCounter = 0;
    const request = vi.fn(async (input: { readonly method: string; readonly params?: { readonly threadId?: string } }) => {
      if (input.method === "thread/start") {
        threadCounter += 1;
        return {
          requestId: `request-thread-${threadCounter}`,
          result: { thread: createThreadData(`thread-${threadCounter}`, { createdAt: threadCounter, updatedAt: threadCounter }), cwd: "E:/code/FPGA" },
        };
      }
      if (input.method === "turn/start") {
        const turnId = input.params?.threadId === "thread-1" ? "turn-1" : "turn-2";
        return { requestId: `request-turn-${turnId}`, result: { turn: createTurnData(turnId) } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: {} } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    await act(async () => {
      await result.current.conversation.createThread();
    });
    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("线程 A 正在运行"));
    });

    await act(async () => {
      await result.current.conversation.createThread();
    });
    await act(async () => {
      await result.current.conversation.sendTurn(createSendOptions("线程 B 继续执行"));
    });

    const turnStarts = request.mock.calls
      .map(([call]) => call as { readonly method: string; readonly params?: { readonly threadId?: string } })
      .filter((call) => call.method === "turn/start");

    expect(turnStarts).toHaveLength(2);
    expect(turnStarts[0]?.params?.threadId).toBe("thread-1");
    expect(turnStarts[1]?.params?.threadId).toBe("thread-2");
    expect(result.current.store.state.conversationsById["thread-1"]?.turns[0]?.status).toBe("inProgress");
    expect(result.current.conversation.selectedThreadId).toBe("thread-2");
  });
});
