import type { AgentEnvironment } from "../../../bridge/types";
import type { ConversationState } from "../../../domain/conversation";
import type { AppState, FuzzySearchSessionState } from "../../../domain/types";
import type { ThreadSummary } from "../../../domain/timeline";
import { isComposerFuzzySessionId } from "../../composer/service/composerCommandBridge";
import { listThreadsForWorkspace, threadBelongsToWorkspace } from "../../workspace/model/workspaceThread";
import { isConversationStreaming, mapConversationToThreadSummary } from "./conversationSelectors";

const EMPTY_THREADS: ReadonlyArray<ThreadSummary> = [];
const EMPTY_FUZZY_SESSIONS: ReadonlyArray<FuzzySearchSessionState> = [];

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
  readonly agentEnvironment: ConversationState["agentEnvironment"];
  readonly status: ConversationState["status"];
  readonly activeFlags: ConversationState["activeFlags"];
  readonly queuedCount: number;
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

export function createThreadSummaryMemo(): (conversation: ConversationState) => ThreadSummary {
  const cache = new Map<string, ThreadSummaryCacheEntry>();

  return (conversation) => {
    const cached = cache.get(conversation.id);
    if (
      cached !== undefined
      && cached.title === conversation.title
      && cached.branch === conversation.branch
      && cached.cwd === conversation.cwd
      && cached.updatedAt === conversation.updatedAt
      && cached.hidden === conversation.hidden
      && cached.source === conversation.source
      && cached.agentEnvironment === conversation.agentEnvironment
      && cached.status === conversation.status
      && cached.queuedCount === conversation.queuedFollowUps.length
      && hasSameActiveFlags(cached.activeFlags, conversation.activeFlags)
    ) {
      return cached.summary;
    }

    const summary = mapConversationToThreadSummary(conversation);
    cache.set(conversation.id, {
      title: conversation.title,
      branch: conversation.branch,
      cwd: conversation.cwd,
      updatedAt: conversation.updatedAt,
      hidden: conversation.hidden,
      source: conversation.source,
      agentEnvironment: conversation.agentEnvironment,
      status: conversation.status,
      activeFlags: conversation.activeFlags,
      queuedCount: conversation.queuedFollowUps.length,
      summary,
    });
    return summary;
  };
}

export function createWorkspaceThreadsSelector(
  agentEnvironment: AgentEnvironment,
  workspacePath: string | null,
): (state: AppState) => ReadonlyArray<ThreadSummary> {
  const mapConversationSummary = createThreadSummaryMemo();
  let previousSummaries = EMPTY_THREADS;
  let previousThreads = EMPTY_THREADS;

  return (state) => {
    const summaries = collectVisibleConversations(state, agentEnvironment).map(mapConversationSummary);
    if (areArraysShallowEqual(previousSummaries, summaries)) {
      return previousThreads;
    }
    const nextThreads = listThreadsForWorkspace(summaries, workspacePath);
    if (areArraysShallowEqual(previousThreads, nextThreads)) {
      previousSummaries = summaries;
      return previousThreads;
    }
    previousSummaries = summaries;
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
