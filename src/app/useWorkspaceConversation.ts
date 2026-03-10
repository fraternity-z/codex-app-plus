import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CollaborationMode } from "../protocol/generated/CollaborationMode";
import type { ComposerSelection } from "./composerPreferences";
import type { HostBridge } from "../bridge/types";
import type {
  CollaborationModePreset,
  ComposerAttachment,
  FollowUpMode,
  QueuedFollowUp,
  ThreadSummary,
  TimelineEntry,
} from "../domain/timeline";
import type { ThreadResumeResponse } from "../protocol/generated/v2/ThreadResumeResponse";
import type { ThreadStartResponse } from "../protocol/generated/v2/ThreadStartResponse";
import type { ThreadMetadataUpdateResponse } from "../protocol/generated/v2/ThreadMetadataUpdateResponse";
import type { TurnStartParams } from "../protocol/generated/v2/TurnStartParams";
import type { TurnStartResponse } from "../protocol/generated/v2/TurnStartResponse";
import type { TurnSteerParams } from "../protocol/generated/v2/TurnSteerParams";
import type { TurnInterruptParams } from "../protocol/generated/v2/TurnInterruptParams";
import type { UserInput } from "../protocol/generated/v2/UserInput";
import { createConversationFromThread } from "./conversationState";
import { mapConversationToThreadSummary, getActiveTurnId, isConversationStreaming } from "./conversationSelectors";
import { mapConversationToTimelineEntries } from "./conversationTimeline";
import { consumePrewarmedThread } from "./prewarmedThreadManager";
import { useAppStore } from "../state/store";
import {
  createThreadPermissionOverrides,
  createTurnPermissionOverrides,
  type ComposerPermissionLevel,
} from "./composerPermission";
import { buildComposerUserInputs } from "./composerAttachments";
import { listThreadsForWorkspace } from "./workspaceThread";
export interface SendTurnOptions {
  readonly text: string;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly selection: ComposerSelection;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly planModeEnabled: boolean;
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
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly collaborationModes: ReadonlyArray<CollaborationModePreset>;
  readonly followUpQueueMode: FollowUpMode;
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
    permissionLevel: options.permissionLevel,
    planModeEnabled: options.planModeEnabled,
    mode: options.followUpOverride ?? "queue",
    createdAt: new Date().toISOString(),
  };
}
function resolvePlanMode(modes: ReadonlyArray<CollaborationModePreset>, selection: ComposerSelection): CollaborationMode | undefined {
  const preset = modes.find((mode) => mode.mode === "plan") ?? null;
  if (preset === null) {
    throw new Error("当前 app-server 未暴露 plan 模式 preset。");
  }
  return { mode: "plan", settings: { model: preset.model ?? selection.model ?? "", reasoning_effort: preset.reasoningEffort ?? selection.effort ?? null, developer_instructions: null } };
}
export function useWorkspaceConversation(options: UseWorkspaceConversationOptions): WorkspaceConversationController {
  const { state, dispatch } = useAppStore();
  const resumingConversationIds = useRef(new Set<string>());
  const drainingConversationIds = useRef(new Set<string>());
  const interruptRequestKeys = useRef(new Set<string>());
  const visibleConversations = useMemo(() => state.orderedConversationIds.map((conversationId) => state.conversationsById[conversationId]).filter((conversation): conversation is NonNullable<typeof conversation> => conversation !== undefined && conversation.hidden === false), [state.conversationsById, state.orderedConversationIds]);
  const allThreadSummaries = useMemo(() => visibleConversations.map(mapConversationToThreadSummary), [visibleConversations]);
  const workspaceThreads = useMemo(() => listThreadsForWorkspace(allThreadSummaries, options.selectedRootPath), [allThreadSummaries, options.selectedRootPath]);
  const selectedConversation = state.selectedConversationId === null ? null : state.conversationsById[state.selectedConversationId] ?? null;
  const selectedThread = useMemo(() => selectedConversation === null ? null : mapConversationToThreadSummary(selectedConversation), [selectedConversation]);
  const activeTurnId = useMemo(() => getActiveTurnId(selectedConversation), [selectedConversation]);
  const selectedRequests = selectedConversation === null ? [] : state.pendingRequestsByConversationId[selectedConversation.id] ?? [];
  const selectedRealtime = selectedConversation === null ? null : state.realtimeByThreadId[selectedConversation.id] ?? null;
  const fuzzySessions = useMemo(() => Object.values(state.fuzzySearchSessionsById), [state.fuzzySearchSessionsById]);
  const activities = useMemo(() => mapConversationToTimelineEntries(selectedConversation, selectedRequests, { realtime: selectedRealtime, fuzzySessions }), [fuzzySessions, selectedConversation, selectedRealtime, selectedRequests]);
  const queuedFollowUps = selectedConversation?.queuedFollowUps ?? [];
  const isResponding = activeTurnId !== null;
  const interruptPending = activeTurnId !== null && selectedConversation?.interruptRequestedTurnId === activeTurnId;
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
    const conversation = state.conversationsById[conversationId] ?? null;
    if (conversation === null || conversation.resumeState === "resumed" || resumingConversationIds.current.has(conversationId)) {
      return;
    }
    resumingConversationIds.current.add(conversationId);
    dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "resuming" });
    try {
      const response = (await options.hostBridge.rpc.request({ method: "thread/resume", params: { threadId: conversationId, persistExtendedHistory: true } })).result as ThreadResumeResponse;
      dispatch({ type: "conversation/loaded", conversationId, thread: response.thread });
    } finally {
      resumingConversationIds.current.delete(conversationId);
    }
  }, [dispatch, options.hostBridge.rpc, state.conversationsById]);
  useEffect(() => {
    if (selectedConversation !== null && selectedConversation.resumeState === "needs_resume") {
      void ensureConversationResumed(selectedConversation.id);
    }
  }, [ensureConversationResumed, selectedConversation]);
  const createThread = useCallback(async () => {
    if (options.selectedRootPath === null) {
      throw new Error("请先选择工作区。");
    }
    dispatch({ type: "conversation/draftOpened", draft: { workspacePath: options.selectedRootPath, createdAt: new Date().toISOString() } });
  }, [dispatch, options.selectedRootPath]);
  const startTurn = useCallback(async (conversationId: string, sendOptions: SendTurnOptions, cwdOverride: string | null) => {
    const collaborationMode = sendOptions.planModeEnabled ? resolvePlanMode(options.collaborationModes, sendOptions.selection) : undefined;
    const input = createInput(sendOptions.text, sendOptions.attachments);
    dispatch({ type: "conversation/turnPlaceholderAdded", conversationId, params: { input, cwd: cwdOverride, model: sendOptions.selection.model, effort: sendOptions.selection.effort, collaborationMode: collaborationMode ?? null } });
    const params: TurnStartParams = { threadId: conversationId, model: sendOptions.selection.model ?? undefined, effort: sendOptions.selection.effort ?? undefined, cwd: cwdOverride ?? undefined, input, collaborationMode, ...createTurnPermissionOverrides(sendOptions.permissionLevel) };
    const response = (await options.hostBridge.rpc.request({ method: "turn/start", params })).result as TurnStartResponse;
    dispatch({ type: "conversation/turnStarted", conversationId, turn: response.turn });
    dispatch({ type: "conversation/touched", conversationId, updatedAt: new Date().toISOString() });
  }, [dispatch, options.collaborationModes, options.hostBridge.rpc]);
  const startNewConversation = useCallback(async (sendOptions: SendTurnOptions) => {
    const workspacePath = options.selectedRootPath ?? state.draftConversation?.workspacePath ?? null;
    if (workspacePath === null) {
      throw new Error("请先选择工作区。");
    }
    const prewarmedResponse = await consumePrewarmedThread(workspacePath);
    const response = prewarmedResponse ?? (await options.hostBridge.rpc.request({ method: "thread/start", params: { model: sendOptions.selection.model ?? undefined, cwd: workspacePath, experimentalRawEvents: false, persistExtendedHistory: true, ...createThreadPermissionOverrides(sendOptions.permissionLevel) } })).result as ThreadStartResponse;
    const conversation = createConversationFromThread(response.thread, { hidden: false, resumeState: "resumed" });
    dispatch({ type: "conversation/upserted", conversation });
    dispatch({ type: "conversation/selected", conversationId: conversation.id });
    await startTurn(conversation.id, sendOptions, response.thread.cwd || response.cwd || workspacePath);
  }, [dispatch, options.hostBridge.rpc, options.selectedRootPath, startTurn, state.draftConversation]);
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
  const processQueuedFollowUp = useCallback(async (conversationId: string) => {
    if (drainingConversationIds.current.has(conversationId)) {
      return;
    }
    const conversation = state.conversationsById[conversationId] ?? null;
    const queued = conversation?.queuedFollowUps[0] ?? null;
    if (conversation === null || queued === null || isConversationStreaming(conversation)) {
      return;
    }
    drainingConversationIds.current.add(conversationId);
    try {
      await ensureConversationResumed(conversationId);
      await startTurn(conversationId, { text: queued.text, attachments: queued.attachments, selection: { model: queued.model, effort: queued.effort }, permissionLevel: queued.permissionLevel, planModeEnabled: queued.planModeEnabled, followUpOverride: queued.mode }, conversation.cwd ?? options.selectedRootPath);
      dispatch({ type: "followUp/dequeued", conversationId, followUpId: queued.id });
    } finally {
      drainingConversationIds.current.delete(conversationId);
    }
  }, [dispatch, ensureConversationResumed, options.selectedRootPath, startTurn, state.conversationsById]);
  useEffect(() => {
    const nextConversation = visibleConversations.find((conversation) => conversation.queuedFollowUps.length > 0 && isConversationStreaming(conversation) === false) ?? null;
    if (nextConversation !== null) {
      void processQueuedFollowUp(nextConversation.id);
    }
  }, [processQueuedFollowUp, visibleConversations]);
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
    const activeTurnId = getActiveTurnId(state.conversationsById[selectedConversation.id] ?? selectedConversation);
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
  }, [dispatch, ensureConversationResumed, interruptTurn, options.followUpQueueMode, options.selectedRootPath, selectedConversation, startNewConversation, startTurn, state.conversationsById, steerTurn]);
  const interruptActiveTurn = useCallback(async () => {
    if (selectedConversation === null || activeTurnId === null || selectedConversation.interruptRequestedTurnId === activeTurnId) {
      return;
    }
    await interruptTurn(selectedConversation.id, activeTurnId);
  }, [activeTurnId, interruptTurn, selectedConversation]);
  const selectThread = useCallback((threadId: string | null) => {
    dispatch({ type: "conversation/selected", conversationId: threadId });
  }, [dispatch]);
  const updateThreadBranch = useCallback(async (branch: string) => {
    if (selectedConversation === null) {
      return;
    }
    const response = (await options.hostBridge.rpc.request({ method: "thread/metadata/update", params: { threadId: selectedConversation.id, gitInfo: { branch } } })).result as ThreadMetadataUpdateResponse;
    dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(response.thread, { hidden: selectedConversation.hidden, resumeState: selectedConversation.resumeState }) });
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
    draftActive: state.draftConversation !== null,
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
