import type { ConversationState } from "../../../domain/conversation";
import type { AppAction } from "../../../domain/types";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { ThreadUnsubscribeResponse } from "../../../protocol/generated/v2/ThreadUnsubscribeResponse";
import { getActiveTurnId } from "../model/conversationSelectors";

const INTERRUPT_IGNORED_PATTERNS = [
  "already interrupted",
  "already completed",
  "already stopped",
  "interrupted",
  "no active turn",
  "not active",
  "not found",
  "not loaded",
  "not running",
  "completed",
  "stopped",
  "已中断",
  "已完成",
  "已停止",
  "未加载",
  "未找到",
  "不存在",
] as const;

const CLEANUP_IGNORED_PATTERNS = [
  "already stopped",
  "not found",
  "not loaded",
  "not subscribed",
  "stopped",
  "已停止",
  "未加载",
  "未找到",
  "不存在",
] as const;

type ConversationsById = Readonly<Record<string, ConversationState | undefined>>;

export interface ThreadRuntimeCleanupTransport {
  interruptTurn: (threadId: string, turnId: string) => Promise<void>;
  cleanBackgroundTerminals: (threadId: string) => Promise<void>;
  unsubscribeThread: (threadId: string) => Promise<ThreadUnsubscribeResponse>;
}

export function createRpcThreadRuntimeCleanupTransport(
  appServerClient: AppServerClient,
): ThreadRuntimeCleanupTransport {
  return {
    interruptTurn: async (threadId, turnId) => {
      await appServerClient.request("turn/interrupt", { threadId, turnId });
    },
    cleanBackgroundTerminals: async (threadId) => {
      await appServerClient.request("thread/backgroundTerminals/clean", { threadId });
    },
    unsubscribeThread: async (threadId) => {
      return appServerClient.request("thread/unsubscribe", { threadId }) as Promise<ThreadUnsubscribeResponse>;
    },
  };
}

export function collectDescendantThreadIds(
  rootThreadId: string,
  conversationsById: ConversationsById,
): Array<string> {
  const graph = buildCollabGraph(conversationsById);
  const visited = new Set<string>([rootThreadId]);
  const ordered: Array<string> = [];

  const visit = (threadId: string): void => {
    if (visited.has(threadId)) {
      return;
    }
    visited.add(threadId);
    for (const childThreadId of graph.get(threadId) ?? []) {
      visit(childThreadId);
    }
    ordered.push(threadId);
  };

  for (const childThreadId of graph.get(rootThreadId) ?? []) {
    visit(childThreadId);
  }
  return ordered;
}

export async function forceCloseThreadRuntime(
  threadId: string,
  conversation: ConversationState | null,
  transport: ThreadRuntimeCleanupTransport,
): Promise<void> {
  const activeTurnId = getActiveTurnId(conversation);
  if (activeTurnId !== null && conversation?.interruptRequestedTurnId !== activeTurnId) {
    await ignoreThreadCleanupError(() => transport.interruptTurn(threadId, activeTurnId), INTERRUPT_IGNORED_PATTERNS);
  }
  await ignoreThreadCleanupError(() => transport.cleanBackgroundTerminals(threadId), CLEANUP_IGNORED_PATTERNS);
  await closeThreadSubscription(threadId, transport);
}

export async function softDetachThreadRuntime(
  threadId: string,
  transport: ThreadRuntimeCleanupTransport,
): Promise<void> {
  await closeThreadSubscription(threadId, transport);
}

export function reportThreadCleanupError(
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

function buildCollabGraph(conversationsById: ConversationsById): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const conversation of Object.values(conversationsById)) {
    if (conversation === undefined) {
      continue;
    }
    for (const turn of conversation.turns) {
      for (const itemState of turn.items) {
        if (itemState.item.type !== "collabAgentToolCall") {
          continue;
        }
        const children = graph.get(itemState.item.senderThreadId) ?? new Set<string>();
        for (const threadId of itemState.item.receiverThreadIds) {
          children.add(threadId);
        }
        for (const threadId of Object.keys(itemState.item.agentsStates)) {
          children.add(threadId);
        }
        graph.set(itemState.item.senderThreadId, children);
      }
    }
  }
  return graph;
}

async function closeThreadSubscription(
  threadId: string,
  transport: ThreadRuntimeCleanupTransport,
): Promise<void> {
  try {
    const response = await transport.unsubscribeThread(threadId);
    if (response.status === "unsubscribed" || response.status === "notSubscribed" || response.status === "notLoaded") {
      return;
    }
  } catch (error) {
    if (!matchesCleanupErrorPattern(error, CLEANUP_IGNORED_PATTERNS)) {
      throw error;
    }
  }
}

async function ignoreThreadCleanupError(
  action: () => Promise<void>,
  patterns: ReadonlyArray<string>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!matchesCleanupErrorPattern(error, patterns)) {
      throw error;
    }
  }
}

function matchesCleanupErrorPattern(
  error: unknown,
  patterns: ReadonlyArray<string>,
): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return patterns.some((pattern) => message.includes(pattern));
}
