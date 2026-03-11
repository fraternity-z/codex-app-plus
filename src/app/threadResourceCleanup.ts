import { useCallback, useEffect, useRef } from "react";
import type { HostBridge } from "../bridge/types";
import type { ConversationState } from "../domain/conversation";
import type { AppAction } from "../domain/types";
import type { SessionSource } from "../protocol/generated/v2/SessionSource";
import type { CollabAgentStatus } from "../protocol/generated/v2/CollabAgentStatus";
import type { ThreadBackgroundTerminalsCleanResponse } from "../protocol/generated/v2/ThreadBackgroundTerminalsCleanResponse";
import type { ThreadUnsubscribeResponse } from "../protocol/generated/v2/ThreadUnsubscribeResponse";
import { isConversationStreaming } from "./conversationSelectors";

interface UseThreadResourceCleanupOptions {
  readonly hostBridge: Pick<HostBridge, "rpc">;
  readonly conversationsById: Readonly<Record<string, ConversationState | undefined>>;
  readonly selectedConversationId: string | null;
  readonly dispatch: (action: AppAction) => void;
}

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

function isUnloadableConversation(
  conversation: ConversationState,
  selectedConversationId: string | null,
): boolean {
  return conversation.id !== selectedConversationId
    && hasTurnHistory(conversation)
    && conversation.resumeState === "resumed"
    && conversation.queuedFollowUps.length === 0
    && isConversationStreaming(conversation) === false;
}

function shouldUnloadMainConversation(
  conversation: ConversationState,
  selectedConversationId: string | null,
): boolean {
  return conversation.hidden === false
    && isSubAgentSource(conversation.source) === false
    && isUnloadableConversation(conversation, selectedConversationId);
}

function shouldUnloadHiddenMainConversation(
  conversation: ConversationState,
  selectedConversationId: string | null,
): boolean {
  return conversation.hidden
    && isSubAgentSource(conversation.source) === false
    && isUnloadableConversation(conversation, selectedConversationId);
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

function isAlreadyUnloadedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("not loaded") || normalized.includes("not found");
}

function reportCleanupError(
  dispatch: (action: AppAction) => void,
  conversation: ConversationState | null,
  error: unknown,
): void {
  const detail = error instanceof Error ? error.message : String(error);
  if (conversation !== null) {
    dispatch({
      type: "conversation/systemNoticeAdded",
      conversationId: conversation.id,
      turnId: null,
      title: "清理线程资源失败",
      detail,
      level: "error",
      source: "thread/cleanup",
    });
    return;
  }
  dispatch({
    type: "banner/pushed",
    banner: {
      id: `thread-cleanup:${detail}`,
      level: "error",
      title: "清理线程资源失败",
      detail,
      source: "thread/cleanup",
    },
  });
}

async function cleanBackgroundTerminals(
  hostBridge: Pick<HostBridge, "rpc">,
  threadId: string,
): Promise<ThreadBackgroundTerminalsCleanResponse> {
  const response = await hostBridge.rpc.request({
    method: "thread/backgroundTerminals/clean",
    params: { threadId },
  });
  return response.result as ThreadBackgroundTerminalsCleanResponse;
}

async function unsubscribeThread(
  hostBridge: Pick<HostBridge, "rpc">,
  threadId: string,
): Promise<ThreadUnsubscribeResponse> {
  const response = await hostBridge.rpc.request({
    method: "thread/unsubscribe",
    params: { threadId },
  });
  return response.result as ThreadUnsubscribeResponse;
}

export function useThreadResourceCleanup(options: UseThreadResourceCleanupOptions): void {
  const { conversationsById, dispatch, hostBridge, selectedConversationId } = options;
  const cleanupInFlightIds = useRef(new Set<string>());
  const cleanedThreadIds = useRef(new Set<string>());
  const conversationsByIdRef = useRef(conversationsById);
  const selectedConversationIdRef = useRef(selectedConversationId);

  useEffect(() => {
    conversationsByIdRef.current = conversationsById;
    selectedConversationIdRef.current = selectedConversationId;
    for (const conversation of Object.values(conversationsById)) {
      if (conversation?.resumeState === "resumed") {
        cleanedThreadIds.current.delete(conversation.id);
      }
    }
  }, [conversationsById, selectedConversationId]);

  const cleanupThread = useCallback(async (threadId: string) => {
    if (cleanupInFlightIds.current.has(threadId) || cleanedThreadIds.current.has(threadId)) {
      return;
    }
    if (threadId === selectedConversationIdRef.current) {
      return;
    }

    const conversation = conversationsByIdRef.current[threadId] ?? null;
    if (conversation !== null && isConversationStreaming(conversation)) {
      return;
    }

    cleanupInFlightIds.current.add(threadId);
    try {
      if (conversation !== null && conversation.status !== "notLoaded") {
        try {
          await cleanBackgroundTerminals(hostBridge, threadId);
        } catch (error) {
          if (!isAlreadyUnloadedError(error)) {
            throw error;
          }
        }
      }
      const response = await unsubscribeThread(hostBridge, threadId);
      if (response.status === "unsubscribed" || response.status === "notSubscribed" || response.status === "notLoaded") {
        cleanedThreadIds.current.add(threadId);
      }
    } catch (error) {
      reportCleanupError(dispatch, conversation, error);
    } finally {
      cleanupInFlightIds.current.delete(threadId);
    }
  }, [dispatch, hostBridge]);

  useEffect(() => {
    for (const conversation of Object.values(conversationsById)) {
      if (conversation !== undefined && shouldUnloadMainConversation(conversation, selectedConversationId)) {
        void cleanupThread(conversation.id);
      }
    }
  }, [cleanupThread, conversationsById, selectedConversationId]);

  useEffect(() => {
    for (const conversation of Object.values(conversationsById)) {
      if (conversation !== undefined && shouldUnloadHiddenMainConversation(conversation, selectedConversationId)) {
        void cleanupThread(conversation.id);
      }
    }
  }, [cleanupThread, conversationsById, selectedConversationId]);

  useEffect(() => {
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
  }, [cleanupThread, conversationsById]);
}
