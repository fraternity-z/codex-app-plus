import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ConversationState, GoalSubmissionHistoryEntry } from "../../../domain/conversation";
import type { CollaborationPreset } from "../../../domain/timeline";
import type { ThreadGoal } from "../../../protocol/generated/v2/ThreadGoal";
import type { ThreadMetadataUpdateResponse } from "../../../protocol/generated/v2/ThreadMetadataUpdateResponse";
import type { ThreadGoalClearResponse } from "../../../protocol/generated/v2/ThreadGoalClearResponse";
import type { ThreadGoalGetResponse } from "../../../protocol/generated/v2/ThreadGoalGetResponse";
import type { ThreadGoalSetResponse } from "../../../protocol/generated/v2/ThreadGoalSetResponse";
import type { ThreadResumeResponse } from "../../../protocol/generated/v2/ThreadResumeResponse";
import type { ThreadRollbackResponse } from "../../../protocol/generated/v2/ThreadRollbackResponse";
import type { ThreadStartResponse } from "../../../protocol/generated/v2/ThreadStartResponse";
import type { TurnInterruptParams } from "../../../protocol/generated/v2/TurnInterruptParams";
import type { TurnStartParams } from "../../../protocol/generated/v2/TurnStartParams";
import type { TurnStartResponse } from "../../../protocol/generated/v2/TurnStartResponse";
import type { TurnSteerParams } from "../../../protocol/generated/v2/TurnSteerParams";
import type { TurnSteerResponse } from "../../../protocol/generated/v2/TurnSteerResponse";
import { useAppDispatch, useAppStoreApi } from "../../../state/store";
import {
  createThreadPermissionOverrides,
  createTurnPermissionOverrides,
} from "../../composer/model/composerPermission";
import { createComposerAttachmentsFromConversationAttachments } from "../../composer/model/composerAttachments";
import { expandCustomPromptCommand } from "../../composer/model/customPromptTemplate";
import { resolveAgentWorkspacePath } from "../../workspace/model/workspacePath";
import { createConversationFromThread } from "../model/conversationState";
import { deriveConversationPreviewTitle, pickConversationTitle } from "../model/conversationTitle";
import { getActiveTurnId, isConversationStreaming } from "../model/conversationSelectors";
import { createGoalSubmissionHistoryEntry, readGoalSubmissionHistory, saveGoalSubmissionHistoryEntry } from "../model/goalSubmissionHistory";
import { parseThreadGoalSlashCommand, resolveEditedThreadGoalStatus, resolveToggledThreadGoalStatus } from "../model/threadGoal";
import { consumePrewarmedThread } from "../service/prewarmedThreadManager";
import { collectDescendantThreadIds, createRpcThreadRuntimeCleanupTransport, forceCloseThreadRuntime, reportThreadCleanupError } from "../service/threadRuntimeCleanup";
import { ThreadLifecycleCoordinator } from "../service/threadLifecycleCoordinator";
import { useThreadResourceCleanup } from "./useThreadResourceCleanup";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import type { SkillMetadata } from "../../../protocol/generated/v2/SkillMetadata";
import { buildInterruptedTurn, createInput, createQueuedFollowUp, mergeSkillsListResponses, resolveConversationCwd, resolveRequestedCollaborationMode, toErrorMessage } from "./workspaceConversationHelpers";
import type { CreateThreadOptions, RegenerateEditedUserMessageOptions, SendTurnOptions, UseWorkspaceConversationOptions, WorkspaceConversationController } from "./workspaceConversationTypes";
import { createHostBridgeAppServerClient } from "../../../protocol/appServerClient";

type AppDispatch = ReturnType<typeof useAppDispatch>;
type AppStoreApi = ReturnType<typeof useAppStoreApi>;

interface UseWorkspaceConversationControllerArgs {
  readonly options: UseWorkspaceConversationOptions;
  readonly dispatch: AppDispatch;
  readonly store: AppStoreApi;
  readonly selectedConversation: ConversationState | null;
  readonly activeTurnId: string | null;
  readonly nextQueuedConversationId: string | null;
}

type WorkspaceConversationActions = Pick<
  WorkspaceConversationController,
  | "clearQueuedFollowUps"
  | "clearThreadGoal"
  | "createThread"
  | "editThreadGoal"
  | "interruptActiveTurn"
  | "promoteQueuedFollowUp"
  | "regenerateFromEditedUserMessage"
  | "removeQueuedFollowUp"
  | "selectCollaborationPreset"
  | "selectThread"
  | "sendTurn"
  | "toggleThreadGoalStatus"
  | "updateThreadBranch"
>;

const APP_SERVER_NOT_READY_MESSAGE = "Codex is still starting or not connected. Wait for the connection before sending.";
const STEER_UNAVAILABLE_MESSAGE = "当前 Codex 配置未启用 steer，无法发送活动中的后续消息。";
const GOAL_ATTACHMENTS_UNSUPPORTED_MESSAGE = "目标命令不支持附件。请只发送 /goal <目标>。";
const GOAL_THREAD_REQUIRED_MESSAGE = "当前没有线程。请使用 /goal <目标> 创建新的长任务目标。";
const SKILL_MENTION_PATTERN = /(?:^|[\s])\$[A-Za-z0-9_-]+/;

function createAppServerNotReadyError(): Error {
  return new Error(APP_SERVER_NOT_READY_MESSAGE);
}

function createSteerUnavailableError(): Error {
  return new Error(STEER_UNAVAILABLE_MESSAGE);
}

export function useWorkspaceConversationController({
  options,
  dispatch,
  store,
  selectedConversation,
  activeTurnId,
  nextQueuedConversationId,
}: UseWorkspaceConversationControllerArgs): WorkspaceConversationActions {
  const resumingConversationIds = useRef(new Set<string>());
  const drainingConversationIds = useRef(new Set<string>());
  const interruptRequestKeys = useRef(new Set<string>());
  const deferredResumeConversationIds = useRef(new Set<string>());
  const lifecycle = useMemo(() => new ThreadLifecycleCoordinator(), []);
  const appServerClient = useMemo(
    () => options.appServerClient ?? createHostBridgeAppServerClient(options.hostBridge),
    [options.appServerClient, options.hostBridge],
  );
  const appServerReady = options.appServerReady !== false;

  const listAvailableSkills = useCallback(async (cwd: string | null): Promise<ReadonlyArray<SkillMetadata>> => {
    if (!appServerReady) {
      return [];
    }
    const response = await appServerClient.request("skills/list", {
      cwds: cwd === null ? undefined : [cwd],
      forceReload: false,
    }) as SkillsListResponse;
    return mergeSkillsListResponses([response]);
  }, [appServerClient, appServerReady]);

  const resolveInputSkills = useCallback(async (
    text: string,
    cwd: string | null,
  ): Promise<ReadonlyArray<SkillMetadata>> => {
    if (!SKILL_MENTION_PATTERN.test(text)) {
      return [];
    }
    return listAvailableSkills(cwd);
  }, [listAvailableSkills]);

  useThreadResourceCleanup({ appServerClient, store, dispatch, lifecycle });

  useEffect(() => () => {
    lifecycle.dispose();
  }, [lifecycle]);

  const getConversation = useCallback((conversationId: string) => {
    const conversation = store.getState().conversationsById[conversationId] ?? null;
    return conversation?.agentEnvironment === options.agentEnvironment ? conversation : null;
  }, [options.agentEnvironment, store]);

  const cleanupTransport = useMemo(
    () => createRpcThreadRuntimeCleanupTransport(appServerClient),
    [appServerClient],
  );
  const interruptPending = activeTurnId !== null && selectedConversation?.interruptRequestedTurnId === activeTurnId;

  useEffect(() => {
    const activeKey = selectedConversation === null || activeTurnId === null ? null : `${selectedConversation.id}:${activeTurnId}`;
    if (interruptPending || activeKey === null) {
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
    await lifecycle.runWithResume(conversationId, async () => {
      if (!appServerReady) {
        return;
      }
      deferredResumeConversationIds.current.delete(conversationId);
      const conversation = getConversation(conversationId);
      if (
        conversation === null
        || (conversation.resumeState === "resumed" && conversation.status !== "notLoaded")
        || conversation.resumeState === "resume_failed"
        || resumingConversationIds.current.has(conversationId)
      ) {
        return;
      }
      resumingConversationIds.current.add(conversationId);
      dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "resuming" });
      try {
        const response = await appServerClient.request("thread/resume", {
          threadId: conversationId,
          persistExtendedHistory: false,
        }) as ThreadResumeResponse;
        dispatch({ type: "conversation/loaded", conversationId, thread: response.thread });
        dispatch({ type: "conversation/goalSubmissionHistoryLoaded", conversationId, entries: readGoalSubmissionHistory(conversationId) });
      } catch (error) {
        dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "resume_failed" });
        dispatch({
          type: "conversation/systemNoticeAdded",
          conversationId,
          turnId: null,
          title: "Failed to resume workspace conversation",
          detail: toErrorMessage(error),
          level: "error",
          source: "thread/resume",
        });
      } finally {
        resumingConversationIds.current.delete(conversationId);
      }
    });
  }, [appServerClient, appServerReady, dispatch, getConversation, lifecycle]);

  useEffect(() => {
    if (!appServerReady) {
      return;
    }
    if (selectedConversation === null || selectedConversation.resumeState !== "needs_resume") {
      return;
    }
    if (deferredResumeConversationIds.current.has(selectedConversation.id)) {
      return;
    }
    void ensureConversationResumed(selectedConversation.id);
  }, [appServerReady, ensureConversationResumed, selectedConversation]);

  const ensureConversationReadyForGoalMutation = useCallback(async (conversationId: string) => {
    await ensureConversationResumed(conversationId);
    const conversation = getConversation(conversationId);
    if (conversation === null || conversation.resumeState === "resume_failed") {
      throw new Error("线程恢复失败，目标操作没有执行。");
    }
  }, [ensureConversationResumed, getConversation]);

  const createThread = useCallback(async (createOptions?: CreateThreadOptions) => {
    const workspacePath = createOptions?.workspacePath ?? options.selectedRootPath;
    if (workspacePath === null) {
      throw new Error("Please choose a workspace first.");
    }
    dispatch({ type: "conversation/draftOpened", draft: { workspacePath, createdAt: new Date().toISOString() } });
  }, [dispatch, options.selectedRootPath]);

  const startTurn = useCallback(async (conversationId: string, sendOptions: SendTurnOptions, cwdOverride: string | null) => {
    await lifecycle.runWithActivity(conversationId, async () => {
      if (!appServerReady) {
        throw createAppServerNotReadyError();
      }
      const collaborationMode = resolveRequestedCollaborationMode(options.collaborationModes, sendOptions);
      const availableSkills = await resolveInputSkills(sendOptions.text, cwdOverride ?? options.selectedRootPath);
      const input = createInput(sendOptions.text, sendOptions.attachments, options.agentEnvironment, availableSkills);
      const resolvedCwd = resolveConversationCwd(cwdOverride, options.agentEnvironment);
      dispatch({
        type: "conversation/turnPlaceholderAdded",
        conversationId,
        params: {
          input,
          cwd: resolvedCwd,
          model: sendOptions.selection.model,
          effort: sendOptions.selection.effort,
          serviceTier: sendOptions.selection.serviceTier,
          collaborationMode: collaborationMode ?? null,
        },
      });
      const params: TurnStartParams = {
        threadId: conversationId,
        model: sendOptions.selection.model ?? undefined,
        effort: sendOptions.selection.effort ?? undefined,
        serviceTier: sendOptions.selection.serviceTier ?? null,
        cwd: resolvedCwd ?? undefined,
        input,
        collaborationMode,
        ...createTurnPermissionOverrides(sendOptions.permissionLevel, options.permissionSettings),
      };
      const response = await appServerClient.request("turn/start", params) as TurnStartResponse;
      dispatch({ type: "conversation/turnStarted", conversationId, turn: response.turn });
      dispatch({ type: "conversation/touched", conversationId, updatedAt: new Date().toISOString() });
    });
  }, [appServerClient, appServerReady, dispatch, lifecycle, options.agentEnvironment, options.collaborationModes, options.permissionSettings, options.selectedRootPath, resolveInputSkills]);

  const materializeConversation = useCallback(async (
    sendOptions: SendTurnOptions,
    previewText: string,
  ): Promise<{ readonly conversation: ConversationState; readonly cwd: string | null }> => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    const workspacePath = options.selectedRootPath ?? store.getState().draftConversation?.workspacePath ?? null;
    if (workspacePath === null) {
      throw new Error("Please choose a workspace first.");
    }
    const agentWorkspacePath = resolveAgentWorkspacePath(workspacePath, options.agentEnvironment);
    const prewarmedResponse = await consumePrewarmedThread(workspacePath);
    const response = prewarmedResponse ?? (
      await appServerClient.request("thread/start", {
        model: sendOptions.selection.model ?? undefined,
        serviceTier: sendOptions.selection.serviceTier ?? null,
        cwd: agentWorkspacePath,
        threadSource: "user",
        experimentalRawEvents: false,
        persistExtendedHistory: false,
        ...createThreadPermissionOverrides(sendOptions.permissionLevel, options.permissionSettings),
      }) as ThreadStartResponse
    );
    const conversation = createConversationFromThread(response.thread, { hidden: false, resumeState: "resumed", agentEnvironment: options.agentEnvironment });
    const availableSkills = await resolveInputSkills(previewText, workspacePath);
    const localPreviewTitle = pickConversationTitle(
      conversation.title,
      deriveConversationPreviewTitle(createInput(previewText, sendOptions.attachments, options.agentEnvironment, availableSkills)),
    );
    dispatch({ type: "conversation/upserted", conversation });
    if (localPreviewTitle !== null && localPreviewTitle !== conversation.title) {
      dispatch({ type: "conversation/titleChanged", conversationId: conversation.id, title: localPreviewTitle });
    }
    dispatch({ type: "composer/draftCollaborationPresetTransferred", conversationId: conversation.id });
    dispatch({ type: "conversation/selected", conversationId: conversation.id });
    return { conversation, cwd: response.thread.cwd || response.cwd || agentWorkspacePath };
  }, [appServerClient, appServerReady, dispatch, options.agentEnvironment, options.permissionSettings, options.selectedRootPath, resolveInputSkills, store]);

  const startNewConversation = useCallback(async (sendOptions: SendTurnOptions) => {
    const materialized = await materializeConversation(sendOptions, sendOptions.text);
    await startTurn(materialized.conversation.id, sendOptions, materialized.cwd);
  }, [materializeConversation, startTurn]);

  const interruptTurn = useCallback(async (conversationId: string, turnId: string) => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    const requestKey = `${conversationId}:${turnId}`;
    if (interruptRequestKeys.current.has(requestKey)) {
      return;
    }
    interruptRequestKeys.current.add(requestKey);
    const params: TurnInterruptParams = { threadId: conversationId, turnId };
    try {
      await appServerClient.request("turn/interrupt", params);
      dispatch({ type: "turn/interruptRequested", conversationId, turnId });
    } catch (error) {
      interruptRequestKeys.current.delete(requestKey);
      throw error;
    }
  }, [appServerClient, appServerReady, dispatch]);

  const steerTurn = useCallback(async (
    conversationId: string,
    turnId: string,
    sendOptions: SendTurnOptions,
  ) => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    if (!options.steerAvailable) {
      throw createSteerUnavailableError();
    }

    const availableSkills = await resolveInputSkills(sendOptions.text, options.selectedRootPath);
    const params: TurnSteerParams = {
      threadId: conversationId,
      expectedTurnId: turnId,
      input: createInput(sendOptions.text, sendOptions.attachments, options.agentEnvironment, availableSkills),
    };
    const response = await appServerClient.request("turn/steer", params) as TurnSteerResponse;
    dispatch({ type: "conversation/touched", conversationId, updatedAt: new Date().toISOString() });
    return response.turnId;
  }, [appServerClient, appServerReady, dispatch, options.selectedRootPath, options.steerAvailable, resolveInputSkills]);

  const showThreadGoal = useCallback(async (conversationId: string) => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    const response = await appServerClient.request("thread/goal/get", {
      threadId: conversationId,
    }) as ThreadGoalGetResponse;
    if (response.goal === null) {
      dispatch({
        type: "conversation/systemNoticeAdded",
        conversationId,
        turnId: null,
        title: "当前没有目标",
        detail: "用法：/goal <目标>。",
        level: "info",
        source: "thread/goal/get",
      });
      return;
    }
    dispatch({ type: "conversation/goalUpdated", conversationId, goal: response.goal });
  }, [appServerClient, appServerReady, dispatch]);

  const markConversationActiveForGoal = useCallback((conversationId: string, goal: ThreadGoal) => {
    if (goal.status !== "active") {
      return;
    }
    const conversation = getConversation(conversationId);
    dispatch({
      type: "conversation/statusChanged",
      conversationId,
      status: "active",
      activeFlags: conversation?.status === "active" ? conversation.activeFlags : [],
    });
  }, [dispatch, getConversation]);

  const clearThreadGoal = useCallback(async (conversationId: string) => {
    await lifecycle.runWithActivity(conversationId, async () => {
      if (!appServerReady) {
        throw createAppServerNotReadyError();
      }
      await ensureConversationReadyForGoalMutation(conversationId);
      const response = await appServerClient.request("thread/goal/clear", {
        threadId: conversationId,
      }) as ThreadGoalClearResponse;
      if (response.cleared) {
        dispatch({ type: "conversation/goalCleared", conversationId });
      }
      dispatch({
        type: "conversation/systemNoticeAdded",
        conversationId,
        turnId: null,
        title: response.cleared ? "已清除目标" : "当前没有目标",
        detail: response.cleared ? null : "可用 /goal <目标> 创建新的长任务目标。",
        level: "info",
        source: "thread/goal/clear",
      });
    });
  }, [appServerClient, appServerReady, dispatch, ensureConversationReadyForGoalMutation, lifecycle]);

  const setThreadGoalStatus = useCallback(async (conversationId: string, status: "active" | "paused") => {
    await lifecycle.runWithActivity(conversationId, async () => {
      if (!appServerReady) {
        throw createAppServerNotReadyError();
      }
      await ensureConversationReadyForGoalMutation(conversationId);
      const response = await appServerClient.request("thread/goal/set", {
        threadId: conversationId,
        status,
      }) as ThreadGoalSetResponse;
      dispatch({ type: "conversation/goalUpdated", conversationId, goal: response.goal });
      markConversationActiveForGoal(conversationId, response.goal);
      dispatch({ type: "conversation/touched", conversationId, updatedAt: new Date().toISOString() });
    });
  }, [appServerClient, appServerReady, dispatch, ensureConversationReadyForGoalMutation, lifecycle, markConversationActiveForGoal]);

  const setThreadGoalObjective = useCallback(async (
    conversationId: string,
    objective: string,
    options?: { readonly status?: "active" | "paused"; readonly tokenBudget?: number | null },
  ): Promise<ThreadGoal> => {
    let goal: ThreadGoal | null = null;
    await lifecycle.runWithActivity(conversationId, async () => {
      if (!appServerReady) {
        throw createAppServerNotReadyError();
      }
      await ensureConversationReadyForGoalMutation(conversationId);
      const response = await appServerClient.request("thread/goal/set", {
        threadId: conversationId,
        objective,
        ...(options?.status === undefined ? {} : { status: options.status }),
        ...(options === undefined || !("tokenBudget" in options) ? {} : { tokenBudget: options.tokenBudget }),
      }) as ThreadGoalSetResponse;
      goal = response.goal;
      dispatch({ type: "conversation/goalUpdated", conversationId, goal: response.goal });
      markConversationActiveForGoal(conversationId, response.goal);
      dispatch({ type: "conversation/touched", conversationId, updatedAt: new Date().toISOString() });
    });
    if (goal === null) {
      throw createAppServerNotReadyError();
    }
    return goal;
  }, [appServerClient, appServerReady, dispatch, ensureConversationReadyForGoalMutation, lifecycle, markConversationActiveForGoal]);

  const addGoalSubmissionPlaceholder = useCallback(async (
    conversationId: string,
    sendOptions: SendTurnOptions,
    objective: string,
    cwdOverride: string | null,
    submission: GoalSubmissionHistoryEntry,
  ) => {
    const availableSkills = await resolveInputSkills(objective, cwdOverride ?? options.selectedRootPath);
    const collaborationMode = resolveRequestedCollaborationMode(options.collaborationModes, sendOptions);
    dispatch({
      type: "conversation/turnPlaceholderAdded",
      conversationId,
      goalSubmission: true,
      goalSubmissionId: submission.id,
      params: {
        input: createInput(objective, [], options.agentEnvironment, availableSkills),
        cwd: resolveConversationCwd(cwdOverride, options.agentEnvironment),
        model: sendOptions.selection.model,
        effort: sendOptions.selection.effort,
        serviceTier: sendOptions.selection.serviceTier,
        collaborationMode: collaborationMode ?? null,
      },
    });
  }, [dispatch, options.agentEnvironment, options.collaborationModes, options.selectedRootPath, resolveInputSkills]);

  const editThreadGoalFromPrompt = useCallback(async (conversationId: string) => {
    if (typeof globalThis.prompt !== "function") {
      throw new Error("当前环境不支持目标编辑弹窗。");
    }
    const response = await appServerClient.request("thread/goal/get", {
      threadId: conversationId,
    }) as ThreadGoalGetResponse;
    if (response.goal === null) {
      throw new Error("当前没有可编辑的目标。请使用 /goal <目标> 创建。");
    }
    const nextObjective = globalThis.prompt("编辑目标", response.goal.objective);
    if (nextObjective === null) {
      return;
    }
    const objective = nextObjective.trim();
    if (objective.length === 0) {
      throw new Error("目标不能为空。");
    }
    await setThreadGoalObjective(conversationId, objective, {
      status: resolveEditedThreadGoalStatus(response.goal),
      tokenBudget: response.goal.tokenBudget,
    });
  }, [appServerClient, setThreadGoalObjective]);

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
    const interruptedTurn = buildInterruptedTurn(getConversation(conversationId), turnId);
    if (interruptedTurn !== null) {
      dispatch({ type: "conversation/turnCompleted", conversationId, turn: interruptedTurn });
    }
    dispatch({ type: "conversation/statusChanged", conversationId, status: "notLoaded", activeFlags: [] });
    dispatch({ type: "conversation/resumeStateChanged", conversationId, resumeState: "needs_resume" });
  }, [cleanupTransport, dispatch, getConversation, store]);

  const interruptGoalRunIfActive = useCallback(async (conversationId: string) => {
    const conversation = getConversation(conversationId);
    if (conversation === null) {
      return;
    }
    const currentActiveTurnId = getActiveTurnId(conversation);
    const turnId = currentActiveTurnId ?? (conversation.status === "active" ? "" : null);
    if (turnId === null || conversation.interruptRequestedTurnId === turnId) {
      return;
    }
    await interruptAndUnloadConversation(conversationId, turnId);
  }, [getConversation, interruptAndUnloadConversation]);

  const editThreadGoal = useCallback(async (goal: ThreadGoal) => {
    await editThreadGoalFromPrompt(goal.threadId);
  }, [editThreadGoalFromPrompt]);

  const toggleThreadGoalStatus = useCallback(async (goal: ThreadGoal) => {
    const status = resolveToggledThreadGoalStatus(goal);
    await setThreadGoalStatus(goal.threadId, status);
    if (status === "paused") {
      await interruptGoalRunIfActive(goal.threadId);
    }
  }, [interruptGoalRunIfActive, setThreadGoalStatus]);

  const clearThreadGoalFromBar = useCallback(async (goal: ThreadGoal) => {
    await clearThreadGoal(goal.threadId);
    await interruptGoalRunIfActive(goal.threadId);
  }, [clearThreadGoal, interruptGoalRunIfActive]);

  const processQueuedFollowUp = useCallback(async (conversationId: string) => {
    if (!appServerReady) {
      return;
    }
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
      await startTurn(conversationId, {
        text: queued.text,
        attachments: queued.attachments,
        selection: { model: queued.model, effort: queued.effort, serviceTier: queued.serviceTier },
        permissionLevel: queued.permissionLevel,
        collaborationPreset: queued.collaborationPreset,
        followUpOverride: queued.mode,
      }, conversation.cwd ?? options.selectedRootPath);
      dispatch({ type: "followUp/dequeued", conversationId, followUpId: queued.id });
    } finally {
      drainingConversationIds.current.delete(conversationId);
    }
  }, [appServerReady, dispatch, ensureConversationResumed, getConversation, options.selectedRootPath, startTurn]);

  useEffect(() => {
    if (nextQueuedConversationId !== null) {
      void processQueuedFollowUp(nextQueuedConversationId);
    }
  }, [nextQueuedConversationId, processQueuedFollowUp]);

  const executeGoalSlashCommand = useCallback(async (
    command: NonNullable<ReturnType<typeof parseThreadGoalSlashCommand>>,
    sendOptions: SendTurnOptions,
  ) => {
    if (sendOptions.attachments.length > 0) {
      throw new Error(GOAL_ATTACHMENTS_UNSUPPORTED_MESSAGE);
    }
    if (command.type === "setObjective" && selectedConversation === null) {
      const materialized = await materializeConversation(sendOptions, command.objective);
      const submission = createGoalSubmissionHistoryEntry(materialized.conversation.id, command.objective);
      await addGoalSubmissionPlaceholder(
        materialized.conversation.id,
        sendOptions,
        command.objective,
        materialized.cwd,
        submission,
      );
      await setThreadGoalObjective(materialized.conversation.id, command.objective);
      saveGoalSubmissionHistoryEntry(submission);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    if (selectedConversation === null) {
      throw new Error(GOAL_THREAD_REQUIRED_MESSAGE);
    }

    await ensureConversationResumed(selectedConversation.id);
    if (command.type === "show") {
      await showThreadGoal(selectedConversation.id);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    if (command.type === "edit") {
      await editThreadGoalFromPrompt(selectedConversation.id);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    if (command.type === "clear") {
      await clearThreadGoal(selectedConversation.id);
      await interruptGoalRunIfActive(selectedConversation.id);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    if (command.type === "setStatus") {
      await setThreadGoalStatus(selectedConversation.id, command.status);
      if (command.status === "paused") {
        await interruptGoalRunIfActive(selectedConversation.id);
      }
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    const currentConversation = getConversation(selectedConversation.id) ?? selectedConversation;
    const submission = createGoalSubmissionHistoryEntry(selectedConversation.id, command.objective);
    await addGoalSubmissionPlaceholder(
      selectedConversation.id,
      sendOptions,
      command.objective,
      currentConversation.cwd ?? options.selectedRootPath,
      submission,
    );
    await setThreadGoalObjective(selectedConversation.id, command.objective);
    saveGoalSubmissionHistoryEntry(submission);
    dispatch({ type: "input/changed", value: "" });
  }, [
    addGoalSubmissionPlaceholder,
    clearThreadGoal,
    dispatch,
    editThreadGoalFromPrompt,
    ensureConversationResumed,
    getConversation,
    interruptGoalRunIfActive,
    materializeConversation,
    options.selectedRootPath,
    selectedConversation,
    setThreadGoalObjective,
    setThreadGoalStatus,
    showThreadGoal,
  ]);

  const sendTurn = useCallback(async (sendOptions: SendTurnOptions) => {
    const expandedText = expandCustomPromptCommand(sendOptions.text, store.getState().customPrompts);
    const normalizedSendOptions = expandedText === null ? sendOptions : { ...sendOptions, text: expandedText };
    const text = normalizedSendOptions.text.trim();
    if (text.length === 0 && sendOptions.attachments.length === 0) {
      return;
    }
    const goalCommand = parseThreadGoalSlashCommand(normalizedSendOptions.text);
    if (goalCommand !== null) {
      await executeGoalSlashCommand(goalCommand, normalizedSendOptions);
      return;
    }
    if (selectedConversation === null) {
      await startNewConversation(normalizedSendOptions);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    await ensureConversationResumed(selectedConversation.id);
    const currentActiveTurnId = getActiveTurnId(getConversation(selectedConversation.id) ?? selectedConversation);
    if (currentActiveTurnId === null) {
      await startTurn(selectedConversation.id, normalizedSendOptions, selectedConversation.cwd ?? options.selectedRootPath);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    const mode = normalizedSendOptions.followUpOverride ?? options.followUpQueueMode;
    if (mode === "steer") {
      await steerTurn(selectedConversation.id, currentActiveTurnId, normalizedSendOptions);
      dispatch({ type: "input/changed", value: "" });
      return;
    }
    const followUp = createQueuedFollowUp({ ...normalizedSendOptions, followUpOverride: mode });
    dispatch({ type: "followUp/enqueued", conversationId: selectedConversation.id, followUp });
    dispatch({ type: "input/changed", value: "" });
  }, [dispatch, ensureConversationResumed, executeGoalSlashCommand, getConversation, options.followUpQueueMode, options.selectedRootPath, selectedConversation, startNewConversation, startTurn, steerTurn, store]);

  const regenerateFromEditedUserMessage = useCallback(async (regenerateOptions: RegenerateEditedUserMessageOptions) => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    const expandedText = expandCustomPromptCommand(regenerateOptions.text, store.getState().customPrompts);
    const text = expandedText === null ? regenerateOptions.text : expandedText;
    const attachments = createComposerAttachmentsFromConversationAttachments(regenerateOptions.attachments);
    if (text.trim().length === 0 && attachments.length === 0) {
      return;
    }

    await ensureConversationResumed(regenerateOptions.threadId);
    const conversation = getConversation(regenerateOptions.threadId);
    if (conversation === null) {
      throw new Error("Cannot edit a message from an unloaded conversation.");
    }
    if (isConversationStreaming(conversation) || getActiveTurnId(conversation) !== null) {
      throw new Error("Wait for the current response to finish before editing a previous message.");
    }

    const turnIndex = conversation.turns.findIndex((turn) => turn.turnId === regenerateOptions.turnId);
    if (turnIndex < 0) {
      throw new Error("Cannot find the turn for the selected message.");
    }

    const numTurns = conversation.turns.length - turnIndex;
    if (numTurns < 1) {
      return;
    }

    dispatch({ type: "followUp/cleared", conversationId: regenerateOptions.threadId });
    const response = await appServerClient.request("thread/rollback", {
      threadId: regenerateOptions.threadId,
      numTurns,
    }) as ThreadRollbackResponse;
    dispatch({ type: "conversation/loaded", conversationId: regenerateOptions.threadId, thread: response.thread });
    await startTurn(regenerateOptions.threadId, {
      text,
      attachments,
      selection: regenerateOptions.selection,
      permissionLevel: regenerateOptions.permissionLevel,
      collaborationPreset: regenerateOptions.collaborationPreset,
    }, response.thread.cwd || conversation.cwd || options.selectedRootPath);
  }, [appServerClient, appServerReady, dispatch, ensureConversationResumed, getConversation, options.selectedRootPath, startTurn, store]);

  const interruptActiveTurn = useCallback(async () => {
    if (selectedConversation === null) {
      return;
    }
    const turnId = activeTurnId ?? (selectedConversation.status === "active" ? "" : null);
    if (turnId === null || selectedConversation.interruptRequestedTurnId === turnId) {
      return;
    }
    await interruptAndUnloadConversation(selectedConversation.id, turnId);
  }, [activeTurnId, interruptAndUnloadConversation, selectedConversation]);

  const selectThread = useCallback((threadId: string | null) => {
    if (threadId !== null) {
      lifecycle.noteThreadActivity(threadId);
    }
    if (threadId !== null && getConversation(threadId)?.resumeState === "resume_failed") {
      dispatch({ type: "conversation/resumeStateChanged", conversationId: threadId, resumeState: "needs_resume" });
    }
    dispatch({ type: "conversation/selected", conversationId: threadId });
  }, [dispatch, getConversation, lifecycle]);

  const selectCollaborationPreset = useCallback((preset: CollaborationPreset) => {
    if (selectedConversation === null) {
      dispatch({ type: "composer/draftCollaborationPresetSelected", preset });
      return;
    }
    dispatch({ type: "composer/threadCollaborationPresetSelected", conversationId: selectedConversation.id, preset });
  }, [dispatch, selectedConversation]);

  const updateThreadBranch = useCallback(async (branch: string) => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    if (selectedConversation === null) {
      return;
    }
    const response = await appServerClient.request("thread/metadata/update", {
      threadId: selectedConversation.id,
      gitInfo: { branch },
    }) as ThreadMetadataUpdateResponse;
    dispatch({
      type: "conversation/upserted",
      conversation: createConversationFromThread(response.thread, {
        hidden: selectedConversation.hidden,
        resumeState: selectedConversation.resumeState,
        agentEnvironment: options.agentEnvironment,
      }),
    });
  }, [appServerClient, appServerReady, dispatch, options.agentEnvironment, selectedConversation]);

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

  const promoteQueuedFollowUp = useCallback(async (followUpId: string) => {
    if (!appServerReady) {
      throw createAppServerNotReadyError();
    }
    if (selectedConversation === null) {
      return;
    }
    const conversationId = selectedConversation.id;
    await ensureConversationResumed(conversationId);
    const currentConversation = getConversation(conversationId) ?? selectedConversation;
    const followUp = currentConversation.queuedFollowUps.find((entry) => entry.id === followUpId) ?? null;
    if (followUp === null) {
      return;
    }
    dispatch({ type: "followUp/promoted", conversationId, followUpId });
    const promotedConversation = getConversation(conversationId) ?? currentConversation;
    const currentActiveTurnId = getActiveTurnId(promotedConversation);
    if (currentActiveTurnId !== null) {
      if (followUp.mode === "steer") {
        await steerTurn(conversationId, currentActiveTurnId, {
          text: followUp.text,
          attachments: followUp.attachments,
          selection: { model: followUp.model, effort: followUp.effort, serviceTier: followUp.serviceTier },
          permissionLevel: followUp.permissionLevel,
          collaborationPreset: followUp.collaborationPreset,
          followUpOverride: followUp.mode,
        });
        dispatch({ type: "followUp/dequeued", conversationId, followUpId });
        return;
      }
      if (promotedConversation.interruptRequestedTurnId !== currentActiveTurnId) {
        await interruptTurn(conversationId, currentActiveTurnId);
      }
      return;
    }
    if (drainingConversationIds.current.has(conversationId)) {
      return;
    }
    drainingConversationIds.current.add(conversationId);
    try {
      await startTurn(conversationId, {
        text: followUp.text,
        attachments: followUp.attachments,
        selection: { model: followUp.model, effort: followUp.effort, serviceTier: followUp.serviceTier },
        permissionLevel: followUp.permissionLevel,
        collaborationPreset: followUp.collaborationPreset,
        followUpOverride: followUp.mode,
      }, promotedConversation.cwd ?? options.selectedRootPath);
      dispatch({ type: "followUp/dequeued", conversationId, followUpId });
    } finally {
      drainingConversationIds.current.delete(conversationId);
    }
  }, [appServerReady, dispatch, ensureConversationResumed, getConversation, interruptTurn, options.selectedRootPath, selectedConversation, startTurn, steerTurn]);

  return {
    clearQueuedFollowUps,
    clearThreadGoal: clearThreadGoalFromBar,
    createThread,
    editThreadGoal,
    interruptActiveTurn,
    promoteQueuedFollowUp,
    regenerateFromEditedUserMessage,
    removeQueuedFollowUp,
    selectCollaborationPreset,
    selectThread,
    sendTurn,
    toggleThreadGoalStatus,
    updateThreadBranch,
  };
}
