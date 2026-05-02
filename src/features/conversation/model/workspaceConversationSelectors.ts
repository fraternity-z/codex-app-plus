import type { AgentEnvironment } from "../../../bridge/types";
import type { ConversationState } from "../../../domain/conversation";
import type { ReceivedServerRequest } from "../../../domain/serverRequests";
import type { AppState, FuzzySearchSessionState } from "../../../domain/types";
import type { ThreadSummary } from "../../../domain/timeline";
import { isComposerFuzzySessionId } from "../../composer/service/composerCommandBridge";
import { listThreadsForWorkspace, threadBelongsToWorkspace } from "../../workspace/model/workspaceThread";
import { conversationRequiresUserAttention } from "./threadAttention";
import { isConversationStreaming, mapConversationToThreadSummary } from "./conversationSelectors";

const EMPTY_THREADS: ReadonlyArray<ThreadSummary> = [];
const EMPTY_FUZZY_SESSIONS: ReadonlyArray<FuzzySearchSessionState> = [];
const EMPTY_REQUESTS: ReadonlyArray<ReceivedServerRequest> = [];

function areArraysShallowEqual<T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function hasSameActiveFlags(
  left: ConversationState["activeFlags"],
  right: ConversationState["activeFlags"],
): boolean {
  return areArraysShallowEqual(left, right);
}

interface ThreadSummaryCacheEntry {
  readonly title: ConversationState["title"];
  readonly branch: ConversationState["branch"];
  readonly cwd: ConversationState["cwd"];
  readonly updatedAt: ConversationState["updatedAt"];
  readonly hidden: ConversationState["hidden"];
  readonly source: ConversationState["source"];
  readonly isSubagent: ConversationState["isSubagent"];
  readonly agentNickname: ConversationState["agentNickname"];
  readonly agentRole: ConversationState["agentRole"];
  readonly agentEnvironment: ConversationState["agentEnvironment"];
  readonly status: ConversationState["status"];
  readonly activeFlags: ConversationState["activeFlags"];
  readonly queuedCount: number;
  readonly requiresUserAttention: boolean;
  readonly summary: ThreadSummary;
}

function collectVisibleConversations(state: AppState, agentEnvironment: AgentEnvironment): Array<ConversationState> {
  const next: Array<ConversationState> = [];
  for (const conversationId of state.orderedConversationIds) {
    const conversation = state.conversationsById[conversationId];
    if (conversation !== undefined && conversation.hidden === false && conversation.agentEnvironment === agentEnvironment) {
      next.push(conversation);
    }
  }
  return next;
}

function collectWorkspaceConversations(
  state: AppState,
  agentEnvironment: AgentEnvironment,
  workspacePath: string | null,
): Array<ConversationState> {
  return collectVisibleConversations(state, agentEnvironment).filter((conversation) => (
    threadBelongsToWorkspace(conversation.cwd, workspacePath)
  ));
}

export function createVisibleThreadsSelector(
  agentEnvironment: AgentEnvironment,
): (state: AppState) => ReadonlyArray<ThreadSummary> {
  const mapConversationSummary = createThreadSummaryMemo();
  let previousThreads = EMPTY_THREADS;

  return (state) => {
    const nextThreads = collectVisibleConversations(state, agentEnvironment).map((conversation) => {
      const pendingRequests = state.pendingRequestsByConversationId[conversation.id] ?? EMPTY_REQUESTS;
      return mapConversationSummary(conversation, {
        requiresUserAttention: conversationRequiresUserAttention(conversation, pendingRequests),
      });
    });
    if (areArraysShallowEqual(previousThreads, nextThreads)) {
      return previousThreads;
    }
    previousThreads = nextThreads;
    return nextThreads;
  };
}

export function createThreadSummaryMemo(): (
  conversation: ConversationState,
  options?: { readonly requiresUserAttention?: boolean },
) => ThreadSummary {
  const cache = new Map<string, ThreadSummaryCacheEntry>();

  return (conversation, options) => {
    const requiresUserAttention = options?.requiresUserAttention === true;
    const cached = cache.get(conversation.id);
    if (
      cached !== undefined
      && cached.title === conversation.title
      && cached.branch === conversation.branch
      && cached.cwd === conversation.cwd
      && cached.updatedAt === conversation.updatedAt
      && cached.hidden === conversation.hidden
      && cached.source === conversation.source
      && cached.isSubagent === conversation.isSubagent
      && cached.agentNickname === conversation.agentNickname
      && cached.agentRole === conversation.agentRole
      && cached.agentEnvironment === conversation.agentEnvironment
      && cached.status === conversation.status
      && cached.queuedCount === conversation.queuedFollowUps.length
      && cached.requiresUserAttention === requiresUserAttention
      && hasSameActiveFlags(cached.activeFlags, conversation.activeFlags)
    ) {
      return cached.summary;
    }

    const baseSummary = mapConversationToThreadSummary(conversation);
    const summary = requiresUserAttention
      ? { ...baseSummary, requiresUserAttention: true }
      : baseSummary;
    cache.set(conversation.id, {
      title: conversation.title,
      branch: conversation.branch,
      cwd: conversation.cwd,
      updatedAt: conversation.updatedAt,
      hidden: conversation.hidden,
      source: conversation.source,
      isSubagent: conversation.isSubagent,
      agentNickname: conversation.agentNickname,
      agentRole: conversation.agentRole,
      agentEnvironment: conversation.agentEnvironment,
      status: conversation.status,
      activeFlags: conversation.activeFlags,
      queuedCount: conversation.queuedFollowUps.length,
      requiresUserAttention,
      summary,
    });
    return summary;
  };
}

export function createWorkspaceThreadsSelector(
  agentEnvironment: AgentEnvironment,
  workspacePath: string | null,
): (state: AppState) => ReadonlyArray<ThreadSummary> {
  const selectVisibleThreads = createVisibleThreadsSelector(agentEnvironment);
  let previousVisibleThreads = EMPTY_THREADS;
  let previousThreads = EMPTY_THREADS;

  return (state) => {
    const visibleThreads = selectVisibleThreads(state);
    if (previousVisibleThreads === visibleThreads) {
      return previousThreads;
    }
    const nextThreads = listThreadsForWorkspace(visibleThreads, workspacePath);
    if (areArraysShallowEqual(previousThreads, nextThreads)) {
      previousVisibleThreads = visibleThreads;
      return previousThreads;
    }
    previousVisibleThreads = visibleThreads;
    previousThreads = nextThreads;
    return nextThreads;
  };
}

export function createQueuedConversationIdSelector(
  agentEnvironment: AgentEnvironment,
  workspacePath: string | null,
): (state: AppState) => string | null {
  return (state) => {
    for (const conversation of collectWorkspaceConversations(state, agentEnvironment, workspacePath)) {
      if (conversation.queuedFollowUps.length > 0 && isConversationStreaming(conversation) === false) {
        return conversation.id;
      }
    }
    return null;
  };
}

export function createNonComposerFuzzySessionsSelector(): (state: AppState) => ReadonlyArray<FuzzySearchSessionState> {
  let previousSessions = EMPTY_FUZZY_SESSIONS;

  return (state) => {
    const nextSessions = Object.values(state.fuzzySearchSessionsById).filter((session) => !isComposerFuzzySessionId(session.sessionId));
    if (areArraysShallowEqual(previousSessions, nextSessions)) {
      return previousSessions;
    }
    previousSessions = nextSessions;
    return nextSessions;
  };
}
