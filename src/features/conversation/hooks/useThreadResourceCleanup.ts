import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HostBridge } from "../../../bridge/types";
import type { ConversationState } from "../../../domain/conversation";
import type { AppAction, AppState } from "../../../domain/types";
import type { AppStoreApi } from "../../../state/store";
import type { SessionSource } from "../../../protocol/generated/v2/SessionSource";
import type { CollabAgentStatus } from "../../../protocol/generated/v2/CollabAgentStatus";
import { isConversationStreaming } from "../model/conversationSelectors";
import {
  collectDescendantThreadIds,
  createRpcThreadRuntimeCleanupTransport,
  forceCloseThreadRuntime,
  reportThreadCleanupError,
} from "../service/threadRuntimeCleanup";

interface UseThreadResourceCleanupOptions {
  readonly hostBridge: Pick<HostBridge, "rpc">;
  readonly store: Pick<AppStoreApi, "getState" | "subscribe">;
  readonly dispatch: (action: AppAction) => void;
}

type PendingRequestsByConversationId = AppState["pendingRequestsByConversationId"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSubAgentSource(source: ConversationState["source"]): source is { subAgent: SessionSource } {
  return isRecord(source) && "subAgent" in source;
}

function isFinalCollabAgentStatus(status: CollabAgentStatus): boolean {
  return status === "completed" || status === "errored" || status === "shutdown";
}

function hasTurnHistory(conversation: ConversationState): boolean {
  return conversation.turns.length > 0;
}

function hasBlockingPendingRequests(
  pendingRequestsByConversationId: PendingRequestsByConversationId,
  conversationId: string,
): boolean {
  return (pendingRequestsByConversationId[conversationId]?.length ?? 0) > 0;
}

function hasProtectedActiveFlags(conversation: ConversationState): boolean {
  return conversation.activeFlags.includes("waitingOnApproval")
    || conversation.activeFlags.includes("waitingOnUserInput");
}

function isUnloadableConversation(
  conversation: ConversationState,
  selectedConversationId: string | null,
  pendingRequestsByConversationId: PendingRequestsByConversationId,
): boolean {
  return conversation.id !== selectedConversationId
    && hasTurnHistory(conversation)
    && conversation.resumeState === "resumed"
    && conversation.queuedFollowUps.length === 0
    && hasBlockingPendingRequests(pendingRequestsByConversationId, conversation.id) === false
    && hasProtectedActiveFlags(conversation) === false
    && isConversationStreaming(conversation) === false;
}

function shouldUnloadMainConversation(
  conversation: ConversationState,
  selectedConversationId: string | null,
  pendingRequestsByConversationId: PendingRequestsByConversationId,
): boolean {
  return conversation.hidden === false
    && isSubAgentSource(conversation.source) === false
    && isUnloadableConversation(conversation, selectedConversationId, pendingRequestsByConversationId);
}

function shouldUnloadHiddenMainConversation(
  conversation: ConversationState,
  selectedConversationId: string | null,
): boolean {
  return conversation.hidden
    && conversation.id !== selectedConversationId
    && isSubAgentSource(conversation.source) === false
    && conversation.resumeState === "resumed"
    && hasTurnHistory(conversation);
}

function shouldCleanupClosedMainConversation(conversation: ConversationState): boolean {
  return conversation.hidden === false
    && isSubAgentSource(conversation.source) === false
    && conversation.status === "notLoaded"
    && conversation.resumeState === "needs_resume"
    && hasTurnHistory(conversation);
}

function hasClosedMainConversation(
  conversationsById: Readonly<Record<string, ConversationState | undefined>>,
): boolean {
  return Object.values(conversationsById).some(
    (conversation) => conversation !== undefined && shouldCleanupClosedMainConversation(conversation),
  );
}

function collectFinalSubagentIds(
  conversations: ReadonlyArray<ConversationState>,
): { cleanupIds: Set<string>; notFoundIds: Set<string> } {
  const cleanupIds = new Set<string>();
  const notFoundIds = new Set<string>();
  for (const conversation of conversations) {
    for (const turn of conversation.turns) {
      for (const itemState of turn.items) {
        if (itemState.item.type !== "collabAgentToolCall") {
          continue;
        }
        for (const [threadId, agentState] of Object.entries(itemState.item.agentsStates)) {
          if (agentState === undefined) {
            continue;
          }
          if (isFinalCollabAgentStatus(agentState.status)) {
            cleanupIds.add(threadId);
            continue;
          }
          if (agentState.status === "notFound") {
            notFoundIds.add(threadId);
          }
        }
      }
    }
  }
  return { cleanupIds, notFoundIds };
}

export function useThreadResourceCleanup(options: UseThreadResourceCleanupOptions): void {
  const { dispatch, hostBridge, store } = options;
  const cleanupInFlightIds = useRef(new Set<string>());
  const cleanedThreadIds = useRef(new Set<string>());
  const cleanupScheduledRef = useRef(false);
  const conversationsByIdRef = useRef(store.getState().conversationsById);
  const pendingRequestsByConversationIdRef = useRef(store.getState().pendingRequestsByConversationId);
  const selectedConversationIdRef = useRef(store.getState().selectedConversationId);
  const transport = useMemo(() => createRpcThreadRuntimeCleanupTransport(hostBridge), [hostBridge]);

  const cleanupThread = useCallback(async (threadId: string) => {
    if (cleanupInFlightIds.current.has(threadId) || cleanedThreadIds.current.has(threadId)) {
      return;
    }
    const conversation = conversationsByIdRef.current[threadId] ?? null;
    cleanupInFlightIds.current.add(threadId);
    try {
      await forceCloseThreadRuntime(threadId, conversation, transport);
      cleanedThreadIds.current.add(threadId);
    } catch (error) {
      reportThreadCleanupError(dispatch, conversation, error);
    } finally {
      cleanupInFlightIds.current.delete(threadId);
    }
  }, [dispatch, transport]);

  const cleanupThreadTree = useCallback(async (rootThreadId: string, includeRoot: boolean) => {
    const descendantThreadIds = collectDescendantThreadIds(rootThreadId, conversationsByIdRef.current);
    const cleanupOrder = includeRoot ? [...descendantThreadIds, rootThreadId] : descendantThreadIds;
    for (const threadId of cleanupOrder) {
      await cleanupThread(threadId);
    }
  }, [cleanupThread]);

  useEffect(() => {
    let disposed = false;

    const syncCleanupState = () => {
      cleanupScheduledRef.current = false;
      if (disposed) {
        return;
      }

      const state = store.getState();
      const { conversationsById, pendingRequestsByConversationId, selectedConversationId } = state;
      conversationsByIdRef.current = conversationsById;
      pendingRequestsByConversationIdRef.current = pendingRequestsByConversationId;
      selectedConversationIdRef.current = selectedConversationId;

      for (const conversation of Object.values(conversationsById)) {
        if (conversation?.resumeState === "resumed") {
          cleanedThreadIds.current.delete(conversation.id);
        }
      }

      for (const conversation of Object.values(conversationsById)) {
        if (conversation !== undefined && shouldUnloadMainConversation(conversation, selectedConversationId, pendingRequestsByConversationId)) {
          void cleanupThreadTree(conversation.id, true);
        }
      }

      for (const conversation of Object.values(conversationsById)) {
        if (conversation !== undefined && shouldUnloadHiddenMainConversation(conversation, selectedConversationId)) {
          void cleanupThreadTree(conversation.id, true);
        }
      }

      for (const conversation of Object.values(conversationsById)) {
        if (conversation !== undefined && shouldCleanupClosedMainConversation(conversation)) {
          void cleanupThreadTree(conversation.id, false);
        }
      }

      const conversations = Object.values(conversationsById).filter(
        (conversation): conversation is ConversationState => conversation !== undefined,
      );
      const { cleanupIds, notFoundIds } = collectFinalSubagentIds(conversations);
      for (const threadId of notFoundIds) {
        cleanedThreadIds.current.add(threadId);
      }
      for (const threadId of cleanupIds) {
        void cleanupThread(threadId);
      }
    };

    const scheduleCleanupStateSync = () => {
      if (hasClosedMainConversation(store.getState().conversationsById)) {
        syncCleanupState();
        return;
      }
      if (cleanupScheduledRef.current) {
        return;
      }
      cleanupScheduledRef.current = true;
      queueMicrotask(syncCleanupState);
    };

    scheduleCleanupStateSync();
    const unsubscribe = store.subscribe(scheduleCleanupStateSync);
    return () => {
      disposed = true;
      cleanupScheduledRef.current = false;
      unsubscribe();
    };
  }, [cleanupThread, cleanupThreadTree, store]);
}
