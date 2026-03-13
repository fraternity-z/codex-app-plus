import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CollaborationMode } from "../../../protocol/generated/CollaborationMode";
import type { ComposerSelection } from "../../composer/model/composerPreferences";
import type { AgentEnvironment, HostBridge } from "../../../bridge/types";
import type { ConversationState } from "../../../domain/conversation";
import type {
  CollaborationModePreset,
  CollaborationPreset,
  ComposerAttachment,
  FollowUpMode,
  QueuedFollowUp,
  ThreadSummary,
  TimelineEntry,
} from "../../../domain/timeline";
import type { ThreadResumeResponse } from "../../../protocol/generated/v2/ThreadResumeResponse";
import type { ThreadStartResponse } from "../../../protocol/generated/v2/ThreadStartResponse";
import type { ThreadMetadataUpdateResponse } from "../../../protocol/generated/v2/ThreadMetadataUpdateResponse";
import type { TurnStartParams } from "../../../protocol/generated/v2/TurnStartParams";
import type { TurnStartResponse } from "../../../protocol/generated/v2/TurnStartResponse";
import type { TurnSteerParams } from "../../../protocol/generated/v2/TurnSteerParams";
import type { TurnInterruptParams } from "../../../protocol/generated/v2/TurnInterruptParams";
import type { Turn } from "../../../protocol/generated/v2/Turn";
import type { UserInput } from "../../../protocol/generated/v2/UserInput";
import { createConversationFromThread } from "../model/conversationState";
import { deriveConversationPreviewTitle, pickConversationTitle } from "../model/conversationTitle";
import { getActiveTurnId, hasInProgressTurn, isConversationStreaming } from "../model/conversationSelectors";
import { createConversationTimelineMemo } from "../model/conversationTimelineMemo";
import { consumePrewarmedThread } from "../service/prewarmedThreadManager";
import { useAppDispatch, useAppSelector, useAppStoreApi } from "../../../state/store";
import {
  createThreadPermissionOverrides,
  createTurnPermissionOverrides,
  type ComposerPermissionLevel,
} from "../../composer/model/composerPermission";
import { buildComposerUserInputs } from "../../composer/model/composerAttachments";
import { resolveCollaborationModePreset } from "../model/collaborationModeResolver";
import { resolveAgentWorkspacePath } from "../../workspace/model/workspacePath";
import { useThreadResourceCleanup } from "./useThreadResourceCleanup";
import { collectDescendantThreadIds, createRpcThreadRuntimeCleanupTransport, forceCloseThreadRuntime, reportThreadCleanupError } from "../service/threadRuntimeCleanup";
import {
  createNonComposerFuzzySessionsSelector,
  createQueuedConversationIdSelector,
  createThreadSummaryMemo,
  createWorkspaceThreadsSelector,
} from "../model/workspaceConversationSelectors";

const EMPTY_REQUESTS: ReadonlyArray<import("../../../domain/serverRequests").ReceivedServerRequest> = [];
export interface SendTurnOptions {
  readonly text: string;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly selection: ComposerSelection;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly collaborationPreset: CollaborationPreset;
  readonly collaborationModeOverridePreset?: CollaborationPreset | null;
  readonly followUpOverride?: FollowUpMode | null;
}
interface WorkspaceConversationController {
  readonly selectedThreadId: string | null;
  readonly selectedThread: ThreadSummary | null;
  readonly activeTurnId: string | null;
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly workspaceThreads: ReadonlyArray<ThreadSummary>;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly draftActive: boolean;
  readonly selectedConversationLoading: boolean;
  createThread: () => Promise<void>;
  selectThread: (threadId: string | null) => void;
  sendTurn: (options: SendTurnOptions) => Promise<void>;
  interruptActiveTurn: () => Promise<void>;
  updateThreadBranch: (branch: string) => Promise<void>;
  removeQueuedFollowUp: (followUpId: string) => void;
  clearQueuedFollowUps: () => void;
}
interface UseWorkspaceConversationOptions {
  readonly agentEnvironment: AgentEnvironment;
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly collaborationModes: ReadonlyArray<CollaborationModePreset>;
  readonly followUpQueueMode: FollowUpMode;
}

function resolveConversationCwd(
  cwd: string | null,
  agentEnvironment: AgentEnvironment
): string | null {
  return cwd === null ? null : resolveAgentWorkspacePath(cwd, agentEnvironment);
}
function createInput(text: string, attachments: ReadonlyArray<ComposerAttachment>): Array<UserInput> {
  return buildComposerUserInputs(text, attachments);
}
function createQueuedFollowUp(options: SendTurnOptions): QueuedFollowUp {
  return {
    id: `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    text: options.text.trim(),
    attachments: options.attachments,
    model: options.selection.model,
    effort: options.selection.effort,
    serviceTier: options.selection.serviceTier,
    permissionLevel: options.permissionLevel,
    collaborationPreset: options.collaborationPreset,
    mode: options.followUpOverride ?? "queue",
    createdAt: new Date().toISOString(),
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildInterruptedTurn(conversation: ConversationState | null, turnId: string): Turn | null {
  const turn = conversation?.turns.find((entry) => entry.turnId === turnId) ?? null;
  if (turn === null || turn.turnId === null) {
    return null;
  }
  return {
    id: turn.turnId,
    items: turn.items.map((itemState) => itemState.item),
    status: "interrupted",
    error: null,
  };
}

function resolvePlanMode(modes: ReadonlyArray<CollaborationModePreset>, selection: ComposerSelection): CollaborationMode | undefined {
  const preset = modes.find((mode) => mode.mode === "plan") ?? null;
  if (preset === null) {
    throw new Error("当前 app-server 未暴露 plan 模式 preset。");
  }
  return { mode: "plan", settings: { model: preset.model ?? selection.model ?? "", reasoning_effort: preset.reasoningEffort ?? selection.effort ?? null, developer_instructions: null } };
}
function resolveRequestedCollaborationMode(
  modes: ReadonlyArray<CollaborationModePreset>,
  sendOptions: SendTurnOptions,
): CollaborationMode | undefined {
  const overridePreset = sendOptions.collaborationModeOverridePreset;
  if (overridePreset) {
    return resolveCollaborationModePreset(modes, overridePreset, sendOptions.selection);
  }
  if (sendOptions.collaborationPreset !== "plan") {
    return undefined;
  }
  return resolvePlanMode(modes, sendOptions.selection);
}

export function useWorkspaceConversation(options: UseWorkspaceConversationOptions): WorkspaceConversationController {
  const store = useAppStoreApi();
  const dispatch = useAppDispatch();
  const resumingConversationIds = useRef(new Set<string>());
  const drainingConversationIds = useRef(new Set<string>());
  const interruptRequestKeys = useRef(new Set<string>());
  const deferredResumeConversationIds = useRef(new Set<string>());
  const mapThreadSummary = useMemo(() => createThreadSummaryMemo(), []);
  const mapActivities = useMemo(() => createConversationTimelineMemo(), []);
  const workspaceThreadsSelector = useMemo(
    () => createWorkspaceThreadsSelector(options.agentEnvironment, options.selectedRootPath),
    [options.agentEnvironment, options.selectedRootPath],
  );
  const fuzzySessionsSelector = useMemo(() => createNonComposerFuzzySessionsSelector(), []);
  const queuedConversationIdSelector = useMemo(
    () => createQueuedConversationIdSelector(options.agentEnvironment),
    [options.agentEnvironment],
  );
  const selectedConversationSelector = useMemo(
    () => (currentState: ReturnType<typeof store.getState>) => {
      if (currentState.selectedConversationId === null) {
        return null;
      }
      const conversation = currentState.conversationsById[currentState.selectedConversationId] ?? null;
      return conversation?.agentEnvironment === options.agentEnvironment ? conversation : null;
    },
    [options.agentEnvironment, store],
  );
  const workspaceThreads = useAppSelector(workspaceThreadsSelector);
  const selectedConversation = useAppSelector(selectedConversationSelector);
  const selectedThread = useMemo(() => selectedConversation === null ? null : mapThreadSummary(selectedConversation), [mapThreadSummary, selectedConversation]);
  const activeTurnId = useMemo(() => getActiveTurnId(selectedConversation), [selectedConversation]);
  const selectedRequests = useAppSelector(
    useMemo(
      () => (currentState: ReturnType<typeof store.getState>) => (
        selectedConversation === null
          ? EMPTY_REQUESTS
          : currentState.pendingRequestsByConversationId[selectedConversation.id] ?? EMPTY_REQUESTS
      ),
      [selectedConversation, store],
    ),
  );
  const selectedRealtime = useAppSelector(
    useMemo(
      () => (currentState: ReturnType<typeof store.getState>) => (
        selectedConversation === null
          ? null
          : currentState.realtimeByThreadId[selectedConversation.id] ?? null
      ),
      [selectedConversation, store],
    ),
  );
  const fuzzySessions = useAppSelector(fuzzySessionsSelector);
  const activities = useMemo(
    () => mapActivities(selectedConversation, selectedRequests, { realtime: selectedRealtime, fuzzySessions }),
    [fuzzySessions, mapActivities, selectedConversation, selectedRealtime, selectedRequests],
  );
  const nextQueuedConversationId = useAppSelector(queuedConversationIdSelector);
  const draftActive = useAppSelector((currentState) => currentState.draftConversation !== null);
  const queuedFollowUps = selectedConversation?.queuedFollowUps ?? [];
  const isResponding = hasInProgressTurn(selectedConversation) || selectedConversation?.status === "active";
  const interruptPending = activeTurnId !== null && selectedConversation?.interruptRequestedTurnId === activeTurnId;
  useThreadResourceCleanup({
    hostBridge: options.hostBridge,
    store,
    dispatch,
  });
  const getConversation = useCallback((conversationId: string) => {
    const conversation = store.getState().conversationsById[conversationId] ?? null;
    return conversation?.agentEnvironment === options.agentEnvironment ? conversation : null;
  }, [options.agentEnvironment, store]);
  const cleanupTransport = useMemo(() => createRpcThreadRuntimeCleanupTransport(options.hostBridge), [options.hostBridge]);
  useEffect(() => {
    const activeKey = selectedConversation === null || activeTurnId === null ? null : `${selectedConversation.id}:${activeTurnId}`;
    if (interruptPending) {
      interruptRequestKeys.current.clear();
      return;
    }
    if (activeKey === null) {
      interruptRequestKeys.current.clear();
      return;
    }
    for (const requestKey of interruptRequestKeys.current) {
      if (requestKey !== activeKey) {
        interruptRequestKeys.current.delete(requestKey);
      }
    }
  }, [activeTurnId, interruptPending, selectedConversation]);
  const ensureConversationResumed = useCallback(async (conversationId: string) => {
    deferredResumeConversationIds.current.delete(conversationId);
    const conversation = getConversation(conversationId);
    if (
      conversation === null
      || conversation.resumeState === "resumed"
      || conversation.resumeState === "resume_failed"
      || resumingConversationIds.current.has(conversationId)
    ) {
      return;
    }
    resumingConversationIds.current.add(conversationId);
    dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "resuming" });
    try {
      const response = (await options.hostBridge.rpc.request({ method: "thread/resume", params: { threadId: conversationId, persistExtendedHistory: true } })).result as ThreadResumeResponse;
      dispatch({ type: "conversation/loaded", conversationId, thread: response.thread });
    } catch (error) {
      dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "resume_failed" });
      dispatch({
        type: "conversation/systemNoticeAdded",
        conversationId,
        turnId: null,
        title: "恢复工作区会话失败",
        detail: toErrorMessage(error),
        level: "error",
        source: "thread/resume",
      });
    } finally {
      resumingConversationIds.current.delete(conversationId);
    }
  }, [dispatch, getConversation, options.hostBridge.rpc]);
  useEffect(() => {
    if (selectedConversation === null || selectedConversation.resumeState !== "needs_resume") {
      return;
    }
    if (deferredResumeConversationIds.current.has(selectedConversation.id)) {
      return;
    }
    void ensureConversationResumed(selectedConversation.id);
  }, [ensureConversationResumed, selectedConversation]);
  const createThread = useCallback(async () => {
    if (options.selectedRootPath === null) {
      throw new Error("请先选择工作区。");
    }
    dispatch({ type: "conversation/draftOpened", draft: { workspacePath: options.selectedRootPath, createdAt: new Date().toISOString() } });
  }, [dispatch, options.selectedRootPath]);
  const startTurn = useCallback(async (conversationId: string, sendOptions: SendTurnOptions, cwdOverride: string | null) => {
    const collaborationMode = resolveRequestedCollaborationMode(options.collaborationModes, sendOptions);
    const input = createInput(sendOptions.text, sendOptions.attachments);
    const resolvedCwd = resolveConversationCwd(cwdOverride, options.agentEnvironment);
    dispatch({ type: "conversation/turnPlaceholderAdded", conversationId, params: { input, cwd: resolvedCwd, model: sendOptions.selection.model, effort: sendOptions.selection.effort, serviceTier: sendOptions.selection.serviceTier, collaborationMode: collaborationMode ?? null } });
    const params: TurnStartParams = {
      threadId: conversationId,
      model: sendOptions.selection.model ?? undefined,
      effort: sendOptions.selection.effort ?? undefined,
      serviceTier: sendOptions.selection.serviceTier ?? null,
      cwd: resolvedCwd ?? undefined,
      input,
      collaborationMode,
      ...createTurnPermissionOverrides(sendOptions.permissionLevel)
    };
    const response = (await options.hostBridge.rpc.request({ method: "turn/start", params })).result as TurnStartResponse;
    dispatch({ type: "conversation/turnStarted", conversationId, turn: response.turn });
    dispatch({ type: "conversation/touched", conversationId, updatedAt: new Date().toISOString() });
  }, [dispatch, options.agentEnvironment, options.collaborationModes, options.hostBridge.rpc]);
  const startNewConversation = useCallback(async (sendOptions: SendTurnOptions) => {
    const workspacePath = options.selectedRootPath ?? store.getState().draftConversation?.workspacePath ?? null;
    if (workspacePath === null) {
      throw new Error("请先选择工作区。");
    }
    const agentWorkspacePath = resolveAgentWorkspacePath(workspacePath, options.agentEnvironment);
    const prewarmedResponse = await consumePrewarmedThread(workspacePath);
    const response = prewarmedResponse ?? (await options.hostBridge.rpc.request({ method: "thread/start", params: { model: sendOptions.selection.model ?? undefined, serviceTier: sendOptions.selection.serviceTier ?? null, cwd: agentWorkspacePath, experimentalRawEvents: false, persistExtendedHistory: true, ...createThreadPermissionOverrides(sendOptions.permissionLevel) } })).result as ThreadStartResponse;
    const conversation = createConversationFromThread(response.thread, { hidden: false, resumeState: "resumed", agentEnvironment: options.agentEnvironment });
    const localPreviewTitle = pickConversationTitle(conversation.title, deriveConversationPreviewTitle(createInput(sendOptions.text, sendOptions.attachments)));
    dispatch({ type: "conversation/upserted", conversation });
    if (localPreviewTitle !== null && localPreviewTitle !== conversation.title) {
      dispatch({ type: "conversation/titleChanged", conversationId: conversation.id, title: localPreviewTitle });
    }
    dispatch({ type: "conversation/selected", conversationId: conversation.id });
    await startTurn(conversation.id, sendOptions, response.thread.cwd || response.cwd || agentWorkspacePath);
  }, [dispatch, options.agentEnvironment, options.hostBridge.rpc, options.selectedRootPath, startTurn, store]);
  const steerTurn = useCallback(async (conversationId: string, turnId: string, sendOptions: SendTurnOptions) => {
    const input = createInput(sendOptions.text, sendOptions.attachments);
    const params: TurnSteerParams = { threadId: conversationId, input, expectedTurnId: turnId };
    await options.hostBridge.rpc.request({ method: "turn/steer", params });
    dispatch({ type: "conversation/itemCompleted", conversationId, turnId, item: { type: "userMessage", id: `steer-${Date.now()}`, content: input } });
  }, [dispatch, options.hostBridge.rpc]);
  const interruptTurn = useCallback(async (conversationId: string, turnId: string) => {
    const requestKey = `${conversationId}:${turnId}`;
    if (interruptRequestKeys.current.has(requestKey)) {
      return;
    }
    interruptRequestKeys.current.add(requestKey);
    const params: TurnInterruptParams = { threadId: conversationId, turnId };
    try {
      await options.hostBridge.rpc.request({ method: "turn/interrupt", params });
      dispatch({ type: "turn/interruptRequested", conversationId, turnId });
    } catch (error) {
      interruptRequestKeys.current.delete(requestKey);
      throw error;
    }
  }, [dispatch, options.hostBridge.rpc]);
  const interruptAndUnloadConversation = useCallback(async (conversationId: string, turnId: string) => {
    const descendantThreadIds = collectDescendantThreadIds(conversationId, store.getState().conversationsById);
    try {
      for (const threadId of descendantThreadIds) {
        await forceCloseThreadRuntime(threadId, getConversation(threadId), cleanupTransport);
      }
      await forceCloseThreadRuntime(conversationId, getConversation(conversationId), cleanupTransport);
    } catch (error) {
      reportThreadCleanupError(dispatch, getConversation(conversationId), error);
      throw error;
    }

    deferredResumeConversationIds.current.add(conversationId);
    const nextConversation = getConversation(conversationId);
    const interruptedTurn = buildInterruptedTurn(nextConversation, turnId);
    if (interruptedTurn !== null) {
      dispatch({ type: "conversation/turnCompleted", conversationId, turn: interruptedTurn });
    }
    dispatch({ type: "conversation/statusChanged", conversationId, status: "notLoaded", activeFlags: [] });
    dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "needs_resume" });
  }, [cleanupTransport, dispatch, getConversation, store]);

  const processQueuedFollowUp = useCallback(async (conversationId: string) => {
    if (drainingConversationIds.current.has(conversationId)) {
      return;
    }
    const conversation = getConversation(conversationId);
    const queued = conversation?.queuedFollowUps[0] ?? null;
    if (conversation === null || queued === null || isConversationStreaming(conversation)) {
      return;
    }
    drainingConversationIds.current.add(conversationId);
    try {
      await ensureConversationResumed(conversationId);
      await startTurn(conversationId, { text: queued.text, attachments: queued.attachments, selection: { model: queued.model, effort: queued.effort, serviceTier: queued.serviceTier }, permissionLevel: queued.permissionLevel, collaborationPreset: queued.collaborationPreset, followUpOverride: queued.mode }, conversation.cwd ?? options.selectedRootPath);
      dispatch({ type: "followUp/dequeued", conversationId, followUpId: queued.id });
    } finally {
      drainingConversationIds.current.delete(conversationId);
    }
  }, [dispatch, ensureConversationResumed, getConversation, options.selectedRootPath, startTurn]);
  useEffect(() => {
    if (nextQueuedConversationId !== null) {
      void processQueuedFollowUp(nextQueuedConversationId);
    }
  }, [nextQueuedConversationId, processQueuedFollowUp]);
  const sendTurn = useCallback(async (sendOptions: SendTurnOptions) => {
    const text = sendOptions.text.trim();
    if (text.length === 0 && sendOptions.attachments.length === 0) {
      return;
    }
    if (selectedConversation === null) {
      await startNewConversation(sendOptions);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    await ensureConversationResumed(selectedConversation.id);
    const activeTurnId = getActiveTurnId(getConversation(selectedConversation.id) ?? selectedConversation);
    if (activeTurnId === null) {
      await startTurn(selectedConversation.id, sendOptions, selectedConversation.cwd ?? options.selectedRootPath);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    const mode = sendOptions.followUpOverride ?? options.followUpQueueMode;
    if (mode === "steer") {
      await steerTurn(selectedConversation.id, activeTurnId, sendOptions);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    const followUp = createQueuedFollowUp({ ...sendOptions, followUpOverride: mode });
    dispatch({ type: "followUp/enqueued", conversationId: selectedConversation.id, followUp });
    dispatch({ type: "input/changed", value: "" });
    if (mode === "interrupt" && selectedConversation.interruptRequestedTurnId !== activeTurnId) {
      await interruptTurn(selectedConversation.id, activeTurnId);
    }
  }, [dispatch, ensureConversationResumed, getConversation, interruptTurn, options.followUpQueueMode, options.selectedRootPath, selectedConversation, startNewConversation, startTurn, steerTurn]);
  const interruptActiveTurn = useCallback(async () => {
    if (selectedConversation === null || activeTurnId === null || selectedConversation.interruptRequestedTurnId === activeTurnId) {
      return;
    }
    await interruptAndUnloadConversation(selectedConversation.id, activeTurnId);
  }, [activeTurnId, interruptAndUnloadConversation, selectedConversation]);
  const selectThread = useCallback((threadId: string | null) => {
    if (threadId !== null && getConversation(threadId)?.resumeState === "resume_failed") {
      dispatch({ type: "conversation/resumeStateChanged", conversationId: threadId, resumeState: "needs_resume" });
    }
    dispatch({ type: "conversation/selected", conversationId: threadId });
  }, [dispatch, getConversation]);
  const updateThreadBranch = useCallback(async (branch: string) => {
    if (selectedConversation === null) {
      return;
    }
    const response = (await options.hostBridge.rpc.request({ method: "thread/metadata/update", params: { threadId: selectedConversation.id, gitInfo: { branch } } })).result as ThreadMetadataUpdateResponse;
    dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(response.thread, { hidden: selectedConversation.hidden, resumeState: selectedConversation.resumeState, agentEnvironment: options.agentEnvironment }) });
  }, [dispatch, options.hostBridge.rpc, selectedConversation]);
  const removeQueuedFollowUp = useCallback((followUpId: string) => {
    if (selectedConversation !== null) {
      dispatch({ type: "followUp/removed", conversationId: selectedConversation.id, followUpId });
    }
  }, [dispatch, selectedConversation]);
  const clearQueuedFollowUps = useCallback(() => {
    if (selectedConversation !== null) {
      dispatch({ type: "followUp/cleared", conversationId: selectedConversation.id });
    }
  }, [dispatch, selectedConversation]);
  return {
    selectedThreadId: selectedConversation?.id ?? null,
    selectedThread,
    activeTurnId,
    isResponding,
    interruptPending,
    workspaceThreads,
    activities,
    queuedFollowUps,
    draftActive,
    selectedConversationLoading: selectedConversation?.resumeState === "resuming",
    createThread,
    selectThread,
    sendTurn,
    interruptActiveTurn,
    updateThreadBranch,
    removeQueuedFollowUp,
    clearQueuedFollowUps
  };
}
