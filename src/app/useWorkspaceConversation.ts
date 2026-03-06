import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CollaborationMode } from "../protocol/generated/CollaborationMode";
import type { ComposerSelection } from "./composerPreferences";
import type { HostBridge } from "../bridge/types";
import type { CollaborationModePreset, FollowUpMode, QueuedFollowUp, ThreadSummary } from "../domain/timeline";
import { createUserMessageEntry, mapCodexSessionToActivities, mapThreadHistoryToActivities } from "./threadActivities";
import type { ThreadReadParams } from "../protocol/generated/v2/ThreadReadParams";
import type { ThreadReadResponse } from "../protocol/generated/v2/ThreadReadResponse";
import type { ThreadResumeParams } from "../protocol/generated/v2/ThreadResumeParams";
import type { ThreadStartParams } from "../protocol/generated/v2/ThreadStartParams";
import type { ThreadStartResponse } from "../protocol/generated/v2/ThreadStartResponse";
import type { TurnInterruptParams } from "../protocol/generated/v2/TurnInterruptParams";
import type { TurnStartParams } from "../protocol/generated/v2/TurnStartParams";
import type { TurnStartResponse } from "../protocol/generated/v2/TurnStartResponse";
import type { TurnSteerParams } from "../protocol/generated/v2/TurnSteerParams";
import type { UserInput } from "../protocol/generated/v2/UserInput";
import { mapThreadToSummary } from "../protocol/mappers";
import { useAppStore } from "../state/store";
import { mergeThreadCatalogs } from "./threadCatalog";
import { listThreadsForWorkspace } from "./workspaceThread";

export interface SendTurnOptions {
  readonly selection: ComposerSelection;
  readonly planModeEnabled: boolean;
  readonly followUpOverride?: FollowUpMode | null;
}

interface WorkspaceConversationController {
  readonly selectedThreadId: string | null;
  readonly workspaceThreads: ReadonlyArray<ThreadSummary>;
  createThread: (model?: string | null) => Promise<string>;
  selectThread: (threadId: string | null) => void;
  sendTurn: (options: SendTurnOptions) => Promise<void>;
  removeQueuedFollowUp: (followUpId: string) => void;
  clearQueuedFollowUps: () => void;
}

interface UseWorkspaceConversationOptions {
  readonly hostBridge: HostBridge;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly selectedRootPath: string | null;
  readonly collaborationModes: ReadonlyArray<CollaborationModePreset>;
  readonly followUpQueueMode: FollowUpMode;
  readonly reloadCodexSessions: () => Promise<void>;
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createInput(text: string): Array<UserInput> {
  return [{ type: "text", text, text_elements: [] }];
}

function createQueuedFollowUp(text: string, options: SendTurnOptions): QueuedFollowUp {
  return {
    id: createLocalId("follow-up"),
    text,
    model: options.selection.model,
    effort: options.selection.effort,
    planModeEnabled: options.planModeEnabled,
    mode: options.followUpOverride ?? "queue",
    createdAt: new Date().toISOString()
  };
}

function resolvePlanPreset(modes: ReadonlyArray<CollaborationModePreset>): CollaborationModePreset | null {
  return modes.find((mode) => mode.mode === "plan") ?? null;
}

function createPlanMode(preset: CollaborationModePreset, selection: ComposerSelection): CollaborationMode {
  const model = preset.model ?? selection.model;
  if (model === null) {
    throw new Error("计划模式缺少可用模型，无法发送请求。");
  }
  return {
    mode: "plan",
    settings: {
      model,
      reasoning_effort: preset.reasoningEffort ?? selection.effort,
      developer_instructions: null
    }
  };
}

export function useWorkspaceConversation(options: UseWorkspaceConversationOptions): WorkspaceConversationController {
  const { dispatch, state } = useAppStore();
  const loadedThreadKeys = useRef(new Set<string>());
  const resumedThreadIds = useRef(new Set<string>());
  const drainingThreads = useRef(new Set<string>());
  const workspaceThreads = useMemo(() => listThreadsForWorkspace(options.codexSessions, options.selectedRootPath), [options.codexSessions, options.selectedRootPath]);
  const knownThreads = useMemo(() => mergeThreadCatalogs(options.threads, options.codexSessions), [options.codexSessions, options.threads]);
  const selectableThreads = useMemo(
    () => (options.selectedRootPath === null ? knownThreads : listThreadsForWorkspace(knownThreads, options.selectedRootPath)),
    [knownThreads, options.selectedRootPath]
  );
  const selectedThreadId = useMemo(() => state.selectedThreadId !== null && selectableThreads.some((thread) => thread.id === state.selectedThreadId) ? state.selectedThreadId : null, [selectableThreads, state.selectedThreadId]);
  const planPreset = useMemo(() => resolvePlanPreset(options.collaborationModes), [options.collaborationModes]);

  useEffect(() => {
    if (state.selectedThreadId !== selectedThreadId) {
      dispatch({ type: "thread/selected", threadId: selectedThreadId });
    }
  }, [dispatch, selectedThreadId, state.selectedThreadId]);

  const loadThreadHistory = useCallback(async (thread: ThreadSummary) => {
    const threadKey = `${thread.source ?? "rpc"}:${thread.id}`;
    if (loadedThreadKeys.current.has(threadKey)) {
      return;
    }
    if (thread.source === "codexData") {
      const response = await options.hostBridge.app.readCodexSession({ threadId: thread.id });
      dispatch({ type: "thread/activitiesLoaded", threadId: thread.id, activities: mapCodexSessionToActivities(thread.id, response) });
      loadedThreadKeys.current.add(threadKey);
      return;
    }
    const params: ThreadReadParams = { threadId: thread.id, includeTurns: true };
    const response = (await options.hostBridge.rpc.request({ method: "thread/read", params })).result as ThreadReadResponse;
    dispatch({ type: "thread/upserted", thread: mapThreadToSummary(response.thread) });
    dispatch({ type: "thread/activitiesLoaded", threadId: thread.id, activities: mapThreadHistoryToActivities(response.thread) });
    loadedThreadKeys.current.add(threadKey);
  }, [dispatch, options.hostBridge.app, options.hostBridge.rpc]);

  useEffect(() => {
    const selectedThread = knownThreads.find((thread) => thread.id === selectedThreadId) ?? null;
    if (selectedThread === null) {
      return;
    }
    void loadThreadHistory(selectedThread).catch((error) => {
      dispatch({ type: "fatal/error", message: String(error) });
    });
  }, [dispatch, knownThreads, loadThreadHistory, selectedThreadId]);

  useEffect(() => {
    const lastNotification = state.notifications[state.notifications.length - 1] ?? null;
    if (lastNotification?.method === "turn/completed") {
      void options.reloadCodexSessions();
    }
  }, [options.reloadCodexSessions, state.notifications]);

  const ensureThreadResumed = useCallback(async (threadId: string) => {
    if (resumedThreadIds.current.has(threadId)) {
      return;
    }
    const params: ThreadResumeParams = { threadId, persistExtendedHistory: true };
    await options.hostBridge.rpc.request({ method: "thread/resume", params });
    resumedThreadIds.current.add(threadId);
  }, [options.hostBridge.rpc]);

  const startTurn = useCallback(async (threadId: string, text: string, sendOptions: SendTurnOptions, selectAfterStart: boolean) => {
    await ensureThreadResumed(threadId);
    const collaborationMode = sendOptions.planModeEnabled
      ? createPlanMode(
          planPreset ?? (() => {
            throw new Error("当前 app-server 未暴露计划模式 preset。");
          })(),
          sendOptions.selection
        )
      : undefined;
    const params: TurnStartParams = {
      threadId,
      model: sendOptions.selection.model ?? undefined,
      effort: sendOptions.selection.effort ?? undefined,
      cwd: options.selectedRootPath ?? undefined,
      input: createInput(text),
      collaborationMode
    };
    const response = (await options.hostBridge.rpc.request({ method: "turn/start", params })).result as TurnStartResponse;
    dispatch({ type: "thread/touched", threadId, updatedAt: new Date().toISOString() });
    dispatch({ type: "message/added", message: createUserMessageEntry(threadId, response.turn.id, createLocalId("user"), text) });
    if (selectAfterStart) {
      dispatch({ type: "thread/selected", threadId });
    }
    return response.turn.id;
  }, [dispatch, ensureThreadResumed, options.hostBridge.rpc, options.selectedRootPath, planPreset]);

  const steerTurn = useCallback(async (threadId: string, activeTurnId: string, text: string) => {
    const params: TurnSteerParams = { threadId, input: createInput(text), expectedTurnId: activeTurnId };
    await options.hostBridge.rpc.request({ method: "turn/steer", params });
    dispatch({ type: "message/added", message: createUserMessageEntry(threadId, activeTurnId, createLocalId("steer"), text) });
  }, [dispatch, options.hostBridge.rpc]);

  const interruptTurn = useCallback(async (threadId: string, activeTurnId: string) => {
    const params: TurnInterruptParams = { threadId, turnId: activeTurnId };
    await options.hostBridge.rpc.request({ method: "turn/interrupt", params });
    dispatch({ type: "turn/interruptRequested", threadId, turnId: activeTurnId });
  }, [dispatch, options.hostBridge.rpc]);

  const createThread = useCallback(async (model: string | null = null) => {
    const params: ThreadStartParams = { model: model ?? undefined, cwd: options.selectedRootPath ?? undefined, experimentalRawEvents: false, persistExtendedHistory: true };
    const response = (await options.hostBridge.rpc.request({ method: "thread/start", params })).result as ThreadStartResponse;
    const summary = mapThreadToSummary(response.thread);
    dispatch({ type: "thread/upserted", thread: summary });
    dispatch({ type: "thread/selected", threadId: response.thread.id });
    dispatch({ type: "thread/activitiesLoaded", threadId: response.thread.id, activities: [] });
    loadedThreadKeys.current.add(`rpc:${response.thread.id}`);
    resumedThreadIds.current.add(response.thread.id);
    await options.reloadCodexSessions();
    return response.thread.id;
  }, [dispatch, options.hostBridge.rpc, options.reloadCodexSessions, options.selectedRootPath]);

  const processQueuedFollowUp = useCallback(async (threadId: string) => {
    if (drainingThreads.current.has(threadId)) {
      return;
    }
    const runtime = state.threadRuntime[threadId];
    const queued = runtime?.queuedFollowUps[0];
    if (queued === undefined || runtime.activeTurnId !== null || runtime.status === "active") {
      return;
    }
    drainingThreads.current.add(threadId);
    try {
      await startTurn(
        threadId,
        queued.text,
        { selection: { model: queued.model, effort: queued.effort }, planModeEnabled: queued.planModeEnabled, followUpOverride: queued.mode },
        false
      );
      dispatch({ type: "followUp/dequeued", threadId, followUpId: queued.id });
      await options.reloadCodexSessions();
    } catch (error) {
      dispatch({ type: "followUp/removed", threadId, followUpId: queued.id });
      dispatch({ type: "fatal/error", message: String(error) });
    } finally {
      drainingThreads.current.delete(threadId);
    }
  }, [dispatch, options.reloadCodexSessions, startTurn, state.threadRuntime]);

  useEffect(() => {
    const nextThreadId = Object.values(state.threadRuntime).find((runtime) => runtime.queuedFollowUps.length > 0 && runtime.activeTurnId === null && runtime.status !== "active")?.threadId;
    if (nextThreadId !== undefined) {
      void processQueuedFollowUp(nextThreadId);
    }
  }, [processQueuedFollowUp, state.threadRuntime]);

  const sendTurn = useCallback(async (sendOptions: SendTurnOptions) => {
    const text = state.inputText.trim();
    if (text.length === 0) {
      return;
    }
    const threadId = selectedThreadId ?? (await createThread(sendOptions.selection.model));
    const runtime = state.threadRuntime[threadId];
    const activeTurnId = runtime?.activeTurnId ?? null;
    if (activeTurnId === null || runtime?.status !== "active") {
      await startTurn(threadId, text, sendOptions, true);
      dispatch({ type: "input/changed", value: "" });
      await options.reloadCodexSessions();
      return;
    }

    const mode = sendOptions.followUpOverride ?? options.followUpQueueMode;
    if (mode === "steer") {
      await steerTurn(threadId, activeTurnId, text);
      dispatch({ type: "input/changed", value: "" });
      return;
    }

    const followUp = createQueuedFollowUp(text, { ...sendOptions, followUpOverride: mode });
    dispatch({ type: "followUp/enqueued", threadId, followUp });
    dispatch({ type: "input/changed", value: "" });
    if (mode === "interrupt" && runtime.interruptRequestedTurnId !== activeTurnId) {
      await interruptTurn(threadId, activeTurnId);
    }
  }, [createThread, dispatch, interruptTurn, options.followUpQueueMode, options.reloadCodexSessions, selectedThreadId, startTurn, state.inputText, state.threadRuntime, steerTurn]);

  const selectThread = useCallback((threadId: string | null) => {
    if (threadId === null) {
      dispatch({ type: "thread/selected", threadId: null });
      return;
    }
    const localThread = options.codexSessions.find((thread) => thread.id === threadId);
    const nextThread = localThread ?? knownThreads.find((thread) => thread.id === threadId);
    if (nextThread !== undefined) {
      dispatch({ type: "thread/upserted", thread: nextThread });
    }
    dispatch({ type: "thread/selected", threadId });
  }, [dispatch, knownThreads, options.codexSessions]);

  const removeQueuedFollowUp = useCallback((followUpId: string) => {
    if (selectedThreadId !== null) {
      dispatch({ type: "followUp/removed", threadId: selectedThreadId, followUpId });
    }
  }, [dispatch, selectedThreadId]);

  const clearQueuedFollowUps = useCallback(() => {
    if (selectedThreadId !== null) {
      dispatch({ type: "followUp/cleared", threadId: selectedThreadId });
    }
  }, [dispatch, selectedThreadId]);

  return { selectedThreadId, workspaceThreads, createThread, selectThread, sendTurn, removeQueuedFollowUp, clearQueuedFollowUps };
}
