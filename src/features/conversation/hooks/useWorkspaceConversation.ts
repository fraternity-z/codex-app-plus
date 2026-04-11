import { useEffect, useMemo } from "react";
import { DEFAULT_COLLABORATION_PRESET } from "../../../domain/timeline";
import type { ThreadSummary } from "../../../domain/timeline";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { createConversationTimelineMemo } from "../model/conversationTimelineMemo";
import { getActiveTurnId, hasInProgressTurn } from "../model/conversationSelectors";
import {
  createVisibleThreadsSelector,
  createNonComposerFuzzySessionsSelector,
  createQueuedConversationIdSelector,
  createThreadSummaryMemo,
} from "../model/workspaceConversationSelectors";
import { listThreadsForWorkspace, threadBelongsToWorkspace } from "../../workspace/model/workspaceThread";
import { useAppDispatch, useAppSelector, useAppStoreApi } from "../../../state/store";
import { useWorkspaceConversationController } from "./useWorkspaceConversationController";
import type { UseWorkspaceConversationOptions, WorkspaceConversationController } from "./workspaceConversationTypes";

const EMPTY_REQUESTS: ReadonlyArray<import("../../../domain/serverRequests").ReceivedServerRequest> = [];

export type { RegenerateEditedUserMessageOptions, SendTurnOptions, UseWorkspaceConversationOptions, WorkspaceConversationController } from "./workspaceConversationTypes";

export function useWorkspaceConversation(options: UseWorkspaceConversationOptions): WorkspaceConversationController {
  const store = useAppStoreApi();
  const dispatch = useAppDispatch();
  const mapThreadSummary = useMemo(() => createThreadSummaryMemo(), []);
  const mapActivities = useMemo(() => createConversationTimelineMemo(), []);
  const visibleThreadsSelector = useMemo(
    () => createVisibleThreadsSelector(options.agentEnvironment),
    [options.agentEnvironment],
  );
  const fuzzySessionsSelector = useMemo(() => createNonComposerFuzzySessionsSelector(), []);
  const queuedConversationIdSelector = useMemo(
    () => createQueuedConversationIdSelector(options.agentEnvironment, options.selectedRootPath),
    [options.agentEnvironment, options.selectedRootPath],
  );
  const selectedConversationSelector = useMemo(
    () => (currentState: ReturnType<typeof store.getState>) => {
      if (currentState.selectedConversationId === null) {
        return null;
      }
      const conversation = currentState.conversationsById[currentState.selectedConversationId] ?? null;
      if (conversation?.agentEnvironment !== options.agentEnvironment) {
        return null;
      }
      return threadBelongsToWorkspace(conversation.cwd, options.selectedRootPath) ? conversation : null;
    },
    [options.agentEnvironment, options.selectedRootPath, store],
  );
  const visibleThreads = useAppSelector(visibleThreadsSelector);
  const selectedConversation = useAppSelector(selectedConversationSelector);
  const selectedConversationId = useAppSelector((currentState) => currentState.selectedConversationId);
  const selectedThread = useMemo(
    () => (selectedConversation === null ? null : mapThreadSummary(selectedConversation)),
    [mapThreadSummary, selectedConversation],
  );
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
  const collaborationPreset = useAppSelector(
    useMemo(
      () => (currentState: ReturnType<typeof store.getState>) => (
        selectedConversation === null
          ? currentState.composerUi.draftCollaborationPreset
          : currentState.composerUi.threadCollaborationPresets[selectedConversation.id] ?? DEFAULT_COLLABORATION_PRESET
      ),
      [selectedConversation, store],
    ),
  );
  const nextQueuedConversationId = useAppSelector(queuedConversationIdSelector);
  const draftActive = useAppSelector((currentState) => currentState.draftConversation !== null);
  const queuedFollowUps = selectedConversation?.queuedFollowUps ?? [];
  const workspaceThreads = useMemo(
    () => listThreadsForWorkspace(visibleThreads, options.selectedRootPath),
    [options.selectedRootPath, visibleThreads],
  );
  const turnStatuses = useMemo(() => (
    selectedConversation?.turns.reduce<Record<string, TurnStatus>>((current, turn) => {
      if (turn.turnId !== null) {
        current[turn.turnId] = turn.status;
      }
      return current;
    }, {}) ?? {}
  ), [selectedConversation]);
  const isResponding = hasInProgressTurn(selectedConversation) || selectedConversation?.status === "active";
  const interruptPending = activeTurnId !== null && selectedConversation?.interruptRequestedTurnId === activeTurnId;

  useEffect(() => {
    if (selectedConversation !== null || selectedConversationId === null) {
      return;
    }
    const current = store.getState().conversationsById[selectedConversationId] ?? null;
    if (current?.agentEnvironment !== options.agentEnvironment) {
      return;
    }
    if (threadBelongsToWorkspace(current.cwd, options.selectedRootPath)) {
      return;
    }
    dispatch({ type: "conversation/selected", conversationId: null });
  }, [
    dispatch,
    options.agentEnvironment,
    options.selectedRootPath,
    selectedConversation,
    selectedConversationId,
    store,
  ]);

  const controllerActions = useWorkspaceConversationController({
    options,
    dispatch,
    store,
    selectedConversation,
    activeTurnId,
    nextQueuedConversationId,
  });

  return {
    selectedThreadId: selectedConversation?.id ?? null,
    selectedThread: selectedThread as ThreadSummary | null,
    activeTurnId,
    turnStatuses,
    isResponding,
    interruptPending,
    collaborationPreset,
    visibleThreads,
    workspaceThreads,
    activities,
    queuedFollowUps,
    draftActive,
    selectedConversationLoading: selectedConversation?.resumeState === "resuming",
    ...controllerActions,
  };
}
