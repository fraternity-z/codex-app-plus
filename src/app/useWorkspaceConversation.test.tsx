import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../bridge/types";
import type { ThreadSummary } from "../domain/types";
import { AppStoreProvider, useAppStore } from "../state/store";
import { useWorkspaceConversation } from "./useWorkspaceConversation";

function Wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

function createThread(overrides?: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-1",
    title: "First thread",
    cwd: "E:/code/FPGA",
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z",
    source: "rpc",
    status: "idle",
    activeFlags: [],
    queuedCount: 0,
    ...overrides
  };
}

function createThreadStartResult() {
  return {
    thread: {
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
      turns: []
    }
  };
}

function createTurnStartResult() {
  return { turn: { id: "turn-1", items: [], status: "inProgress" as const, error: null } };
}

function createThreadReadResult() {
  return {
    thread: {
      ...createThreadStartResult().thread,
      id: "thread-1",
      turns: []
    }
  };
}

function renderConversation(hostBridge: HostBridge, threads: ReadonlyArray<ThreadSummary> = []) {
  const reloadCodexSessions = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    () => {
      const store = useAppStore();
      const conversation = useWorkspaceConversation({
        hostBridge,
        threads,
        codexSessions: [],
        selectedRootPath: "E:/code/FPGA",
        collaborationModes: [{ name: "plan", mode: "plan", model: "gpt-5.2", reasoningEffort: "medium" }],
        followUpQueueMode: "queue",
        reloadCodexSessions
      });
      return { store, conversation, reloadCodexSessions };
    },
    { wrapper: Wrapper }
  );
  return hook;
}

describe("useWorkspaceConversation", () => {
  it("starts a new thread and turn when idle", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/start") return { requestId: "request-1", result: createThreadStartResult() };
      if (input.method === "turn/start") return { requestId: "request-2", result: createTurnStartResult() };
      if (input.method === "thread/resume") return { requestId: "request-3", result: createThreadStartResult() };
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: { readCodexSession: vi.fn() } } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge);

    act(() => {
      result.current.store.dispatch({ type: "input/changed", value: "请分析当前工作区" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, planModeEnabled: false });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/start" }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/start" }));
    expect(result.current.reloadCodexSessions).toHaveBeenCalledTimes(2);
  });

  it("queues follow-ups when the thread is active", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/read") return { requestId: "read", result: createThreadReadResult() };
      if (input.method === "thread/resume") return { requestId: "resume", result: createThreadStartResult() };
      return { requestId: "noop", result: {} };
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: { readCodexSession: vi.fn() } } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge, [createThread()]);

    act(() => {
      result.current.store.dispatch({ type: "thread/selected", threadId: "thread-1" });
      result.current.store.dispatch({ type: "turn/started", threadId: "thread-1", turnId: "turn-1" });
      result.current.store.dispatch({ type: "thread/statusChanged", threadId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "继续修测试" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, planModeEnabled: false });
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/read" }));
    expect(result.current.store.state.threadRuntime["thread-1"]?.queuedFollowUps).toHaveLength(1);
  });

  it("steers the active turn when requested", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/read") return { requestId: "read", result: createThreadReadResult() };
      if (input.method === "turn/steer") return { requestId: "request-1", result: { turnId: "turn-1" } };
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: { readCodexSession: vi.fn() } } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge, [createThread()]);

    act(() => {
      result.current.store.dispatch({ type: "thread/selected", threadId: "thread-1" });
      result.current.store.dispatch({ type: "turn/started", threadId: "thread-1", turnId: "turn-1" });
      result.current.store.dispatch({ type: "thread/statusChanged", threadId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "先看失败测试" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, planModeEnabled: false, followUpOverride: "steer" });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/steer" }));
  });

  it("interrupts the active turn before processing interrupt-mode follow-up", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "thread/read") return { requestId: "read", result: createThreadReadResult() };
      if (input.method === "turn/interrupt") return { requestId: "request-1", result: {} };
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = { rpc: { request, notify: vi.fn(), cancel: vi.fn() }, app: { readCodexSession: vi.fn() } } as unknown as HostBridge;
    const { result } = renderConversation(hostBridge, [createThread()]);

    act(() => {
      result.current.store.dispatch({ type: "thread/selected", threadId: "thread-1" });
      result.current.store.dispatch({ type: "turn/started", threadId: "thread-1", turnId: "turn-1" });
      result.current.store.dispatch({ type: "thread/statusChanged", threadId: "thread-1", status: "active", activeFlags: [] });
      result.current.store.dispatch({ type: "input/changed", value: "改成先中断" });
    });

    await act(async () => {
      await result.current.conversation.sendTurn({ selection: { model: "gpt-5.2", effort: "medium" }, planModeEnabled: false, followUpOverride: "interrupt" });
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt" }));
    expect(result.current.store.state.threadRuntime["thread-1"]?.queuedFollowUps).toHaveLength(1);
  });
});
