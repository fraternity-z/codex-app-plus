import type { Dispatch } from "react";
import type { AgentEnvironment } from "../../bridge/types";
import type { AppAction } from "../../domain/types";
import {
  isPrewarmedThread,
  type FrameTextDeltaQueue,
  type OutputDeltaQueue,
} from "../../features/conversation";
import { parseConnectionRetryText } from "../../features/home";
import type { FuzzyFileSearchSessionCompletedNotification } from "../../protocol/generated/FuzzyFileSearchSessionCompletedNotification";
import type { FuzzyFileSearchSessionUpdatedNotification } from "../../protocol/generated/FuzzyFileSearchSessionUpdatedNotification";
import type { AccountLoginCompletedNotification } from "../../protocol/generated/v2/AccountLoginCompletedNotification";
import type { AccountRateLimitsUpdatedNotification } from "../../protocol/generated/v2/AccountRateLimitsUpdatedNotification";
import type { AccountUpdatedNotification } from "../../protocol/generated/v2/AccountUpdatedNotification";
import type { AgentMessageDeltaNotification } from "../../protocol/generated/v2/AgentMessageDeltaNotification";
import type { ConfigWarningNotification } from "../../protocol/generated/v2/ConfigWarningNotification";
import type { ContextCompactedNotification } from "../../protocol/generated/v2/ContextCompactedNotification";
import type { DeprecationNoticeNotification } from "../../protocol/generated/v2/DeprecationNoticeNotification";
import type { ErrorNotification } from "../../protocol/generated/v2/ErrorNotification";
import type { ItemCompletedNotification } from "../../protocol/generated/v2/ItemCompletedNotification";
import type { ItemStartedNotification } from "../../protocol/generated/v2/ItemStartedNotification";
import type { McpServerOauthLoginCompletedNotification } from "../../protocol/generated/v2/McpServerOauthLoginCompletedNotification";
import type { McpToolCallProgressNotification } from "../../protocol/generated/v2/McpToolCallProgressNotification";
import type { ModelReroutedNotification } from "../../protocol/generated/v2/ModelReroutedNotification";
import type { PlanDeltaNotification } from "../../protocol/generated/v2/PlanDeltaNotification";
import type { RawResponseItemCompletedNotification } from "../../protocol/generated/v2/RawResponseItemCompletedNotification";
import type { ReasoningSummaryTextDeltaNotification } from "../../protocol/generated/v2/ReasoningSummaryTextDeltaNotification";
import type { ReasoningTextDeltaNotification } from "../../protocol/generated/v2/ReasoningTextDeltaNotification";
import type { ServerRequestResolvedNotification } from "../../protocol/generated/v2/ServerRequestResolvedNotification";
import type { TerminalInteractionNotification } from "../../protocol/generated/v2/TerminalInteractionNotification";
import type { ThreadArchivedNotification } from "../../protocol/generated/v2/ThreadArchivedNotification";
import type { ThreadClosedNotification } from "../../protocol/generated/v2/ThreadClosedNotification";
import type { ThreadNameUpdatedNotification } from "../../protocol/generated/v2/ThreadNameUpdatedNotification";
import type { ThreadRealtimeClosedNotification } from "../../protocol/generated/v2/ThreadRealtimeClosedNotification";
import type { ThreadRealtimeErrorNotification } from "../../protocol/generated/v2/ThreadRealtimeErrorNotification";
import type { ThreadRealtimeItemAddedNotification } from "../../protocol/generated/v2/ThreadRealtimeItemAddedNotification";
import type { ThreadRealtimeOutputAudioDeltaNotification } from "../../protocol/generated/v2/ThreadRealtimeOutputAudioDeltaNotification";
import type { ThreadRealtimeStartedNotification } from "../../protocol/generated/v2/ThreadRealtimeStartedNotification";
import type { ThreadStartedNotification } from "../../protocol/generated/v2/ThreadStartedNotification";
import type { ThreadStatusChangedNotification } from "../../protocol/generated/v2/ThreadStatusChangedNotification";
import type { ThreadTokenUsageUpdatedNotification } from "../../protocol/generated/v2/ThreadTokenUsageUpdatedNotification";
import type { ThreadUnarchivedNotification } from "../../protocol/generated/v2/ThreadUnarchivedNotification";
import type { TurnCompletedNotification } from "../../protocol/generated/v2/TurnCompletedNotification";
import type { TurnDiffUpdatedNotification } from "../../protocol/generated/v2/TurnDiffUpdatedNotification";
import type { TurnPlanUpdatedNotification } from "../../protocol/generated/v2/TurnPlanUpdatedNotification";
import type { TurnStartedNotification } from "../../protocol/generated/v2/TurnStartedNotification";
import type { WindowsSandboxSetupCompletedNotification } from "../../protocol/generated/v2/WindowsSandboxSetupCompletedNotification";
import type { WindowsWorldWritableWarningNotification } from "../../protocol/generated/v2/WindowsWorldWritableWarningNotification";
import { createConversationFromThread } from "../../features/conversation";

interface NotificationContext {
  readonly dispatch: Dispatch<AppAction>;
  readonly textDeltaQueue: FrameTextDeltaQueue;
  readonly outputDeltaQueue: OutputDeltaQueue;
  readonly agentEnvironment?: AgentEnvironment;
}

function pushBanner(dispatch: Dispatch<AppAction>, level: "info" | "warning" | "error", title: string, detail: string | null, source: string): void {
  dispatch({ type: "banner/pushed", banner: { id: `${source}:${title}`, level, title, detail, source } });
}

export function applyAppServerNotification(context: NotificationContext, method: string, params: unknown): void {
  const { dispatch, textDeltaQueue, outputDeltaQueue } = context;
  if (method === "item/agentMessage/delta") {
    const payload = params as AgentMessageDeltaNotification;
    textDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: { type: "agentMessage" }, delta: payload.delta });
    return;
  }
  if (method === "item/plan/delta") {
    const payload = params as PlanDeltaNotification;
    textDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: { type: "plan" }, delta: payload.delta });
    return;
  }
  if (method === "item/reasoning/summaryTextDelta") {
    const payload = params as ReasoningSummaryTextDeltaNotification;
    textDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: { type: "reasoningSummary", summaryIndex: payload.summaryIndex }, delta: payload.delta });
    return;
  }
  if (method === "item/reasoning/summaryPartAdded") {
    return;
  }
  if (method === "item/reasoning/textDelta") {
    const payload = params as ReasoningTextDeltaNotification;
    textDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: { type: "reasoningContent", contentIndex: payload.contentIndex }, delta: payload.delta });
    return;
  }
  if (method === "item/commandExecution/outputDelta") {
    const payload = params as import("../../protocol/generated/v2/CommandExecutionOutputDeltaNotification").CommandExecutionOutputDeltaNotification;
    outputDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: "commandExecution", delta: payload.delta });
    return;
  }
  if (method === "item/fileChange/outputDelta") {
    const payload = params as import("../../protocol/generated/v2/FileChangeOutputDeltaNotification").FileChangeOutputDeltaNotification;
    outputDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: "fileChange", delta: payload.delta });
    return;
  }
  if (method === "item/commandExecution/terminalInteraction") {
    const payload = params as TerminalInteractionNotification;
    dispatch({ type: "conversation/terminalInteraction", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, stdin: payload.stdin });
    return;
  }
  if (method === "item/mcpToolCall/progress") {
    const payload = params as McpToolCallProgressNotification;
    dispatch({ type: "conversation/mcpProgressAdded", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, message: payload.message });
    return;
  }
  if (method === "item/started") {
    const payload = params as ItemStartedNotification;
    dispatch({ type: "conversation/itemStarted", conversationId: payload.threadId, turnId: payload.turnId, item: payload.item });
    if (payload.item.type === "enteredReviewMode") {
      dispatch({ type: "conversation/reviewModeChanged", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.item.id, state: "entered", review: payload.item.review });
    }
    if (payload.item.type === "exitedReviewMode") {
      dispatch({ type: "conversation/reviewModeChanged", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.item.id, state: "exited", review: payload.item.review });
    }
    return;
  }
  if (method === "item/completed") {
    textDeltaQueue.flushNow();
    outputDeltaQueue.flushNow();
    const payload = params as ItemCompletedNotification;
    dispatch({ type: "conversation/itemCompleted", conversationId: payload.threadId, turnId: payload.turnId, item: payload.item });
    if (payload.item.type === "enteredReviewMode") {
      dispatch({ type: "conversation/reviewModeChanged", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.item.id, state: "entered", review: payload.item.review });
    }
    if (payload.item.type === "exitedReviewMode") {
      dispatch({ type: "conversation/reviewModeChanged", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.item.id, state: "exited", review: payload.item.review });
    }
    return;
  }
  if (method === "rawResponseItem/completed") {
    const payload = params as RawResponseItemCompletedNotification;
    dispatch({ type: "conversation/rawResponseAppended", conversationId: payload.threadId, turnId: payload.turnId, rawResponse: payload.item });
    return;
  }
  if (method === "turn/started") {
    const payload = params as TurnStartedNotification;
    dispatch({ type: "conversation/turnStarted", conversationId: payload.threadId, turn: payload.turn });
    return;
  }
  if (method === "turn/completed") {
    textDeltaQueue.flushNow();
    outputDeltaQueue.flushNow();
    const payload = params as TurnCompletedNotification;
    dispatch({ type: "conversation/turnCompleted", conversationId: payload.threadId, turn: payload.turn });
    return;
  }
  if (method === "thread/started") {
    const payload = params as ThreadStartedNotification;
    if (isPrewarmedThread(payload.thread.id)) {
      return;
    }
    dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(payload.thread, { resumeState: "resumed", agentEnvironment: context.agentEnvironment ?? "windowsNative" }) });
    return;
  }
  if (method === "thread/status/changed") {
    const payload = params as ThreadStatusChangedNotification;
    const activeFlags = payload.status.type === "active" ? payload.status.activeFlags : [];
    dispatch({ type: "conversation/statusChanged", conversationId: payload.threadId, status: payload.status.type, activeFlags });
    if (payload.status.type === "notLoaded") {
      dispatch({ type: "conversation/resumeStateChanged", conversationId: payload.threadId, resumeState: "needs_resume" });
    }
    return;
  }
  if (method === "thread/archived") {
    const payload = params as ThreadArchivedNotification;
    dispatch({ type: "conversation/hiddenChanged", conversationId: payload.threadId, hidden: true });
    return;
  }
  if (method === "thread/unarchived") {
    const payload = params as ThreadUnarchivedNotification;
    dispatch({ type: "conversation/hiddenChanged", conversationId: payload.threadId, hidden: false });
    return;
  }
  if (method === "thread/closed") {
    const payload = params as ThreadClosedNotification;
    dispatch({ type: "conversation/statusChanged", conversationId: payload.threadId, status: "notLoaded", activeFlags: [] });
    dispatch({ type: "conversation/resumeStateChanged", conversationId: payload.threadId, resumeState: "needs_resume" });
    return;
  }
  if (method === "thread/name/updated") {
    const payload = params as ThreadNameUpdatedNotification;
    dispatch({ type: "conversation/titleChanged", conversationId: payload.threadId, title: payload.threadName ?? null });
    return;
  }
  if (method === "thread/tokenUsage/updated") {
    const payload = params as ThreadTokenUsageUpdatedNotification;
    dispatch({ type: "conversation/tokenUsageUpdated", conversationId: payload.threadId, turnId: payload.turnId, usage: payload.tokenUsage });
    return;
  }
  if (method === "turn/plan/updated") {
    const payload = params as TurnPlanUpdatedNotification;
    dispatch({ type: "conversation/planUpdated", conversationId: payload.threadId, turnId: payload.turnId, explanation: payload.explanation, plan: payload.plan });
    return;
  }
  if (method === "turn/diff/updated") {
    const payload = params as TurnDiffUpdatedNotification;
    dispatch({ type: "conversation/diffUpdated", conversationId: payload.threadId, turnId: payload.turnId, diff: payload.diff });
    return;
  }
  if (method === "serverRequest/resolved") {
    const payload = params as ServerRequestResolvedNotification;
    dispatch({ type: "serverRequest/resolved", requestId: String(payload.requestId) });
    return;
  }
  if (method === "error") {
    const payload = params as ErrorNotification;
    if (payload.willRetry && parseConnectionRetryText(payload.error.message) !== null) {
      return;
    }
    dispatch({ type: "conversation/systemNoticeAdded", conversationId: payload.threadId, turnId: payload.turnId, title: payload.error.message, detail: payload.willRetry ? "The app-server will retry this turn." : null, level: "error", source: "error" });
    return;
  }
  if (method === "thread/compacted") {
    const payload = params as ContextCompactedNotification;
    dispatch({ type: "conversation/contextCompacted", conversationId: payload.threadId, turnId: payload.turnId });
    return;
  }
  if (method === "model/rerouted") {
    const payload = params as ModelReroutedNotification;
    dispatch({ type: "conversation/systemNoticeAdded", conversationId: payload.threadId, turnId: payload.turnId, title: `Model rerouted to ${payload.toModel}`, detail: `Requested ${payload.fromModel}; reason: ${payload.reason}.`, level: "info", source: "model-rerouted" });
    return;
  }
  if (method === "mcpServer/oauthLogin/completed") {
    const payload = params as McpServerOauthLoginCompletedNotification;
    pushBanner(dispatch, payload.success ? "info" : "error", payload.success ? `MCP login completed: ${payload.name}` : `MCP login failed: ${payload.name}`, payload.error ?? null, "mcp-oauth");
    return;
  }
  if (method === "account/login/completed") {
    const payload = params as AccountLoginCompletedNotification;
    dispatch({ type: "authLogin/completed", success: payload.success, error: payload.error });
    if (!payload.success) {
      pushBanner(dispatch, "error", "ChatGPT login failed", payload.error, "account-login");
    }
    return;
  }
  if (method === "account/updated") {
    const payload = params as AccountUpdatedNotification;
    dispatch({ type: "account/updated", account: { authMode: payload.authMode, planType: payload.planType, email: null } });
    return;
  }
  if (method === "account/rateLimits/updated") {
    const payload = params as AccountRateLimitsUpdatedNotification;
    dispatch({ type: "rateLimits/updated", rateLimits: payload.rateLimits });
    return;
  }
  if (method === "skills/changed") {
    pushBanner(dispatch, "info", "Skills changed", "Local skill metadata changed and should be refreshed.", "skills");
    return;
  }
  if (method === "app/list/updated") {
    pushBanner(dispatch, "info", "App list updated", "Available apps were refreshed by the app-server.", "app-list");
    return;
  }
  if (method === "deprecationNotice") {
    const payload = params as DeprecationNoticeNotification;
    pushBanner(dispatch, "warning", payload.summary, payload.details, "deprecation");
    return;
  }
  if (method === "configWarning") {
    const payload = params as ConfigWarningNotification;
    pushBanner(dispatch, "warning", payload.summary, payload.details ?? null, "config-warning");
    return;
  }
  if (method === "fuzzyFileSearch/sessionUpdated") {
    const payload = params as FuzzyFileSearchSessionUpdatedNotification;
    dispatch({ type: "fuzzySearch/updated", sessionId: payload.sessionId, query: payload.query, files: payload.files });
    return;
  }
  if (method === "fuzzyFileSearch/sessionCompleted") {
    const payload = params as FuzzyFileSearchSessionCompletedNotification;
    dispatch({ type: "fuzzySearch/completed", sessionId: payload.sessionId });
    return;
  }
  if (method === "thread/realtime/started") {
    const payload = params as ThreadRealtimeStartedNotification;
    dispatch({ type: "realtime/started", threadId: payload.threadId, sessionId: payload.sessionId });
    return;
  }
  if (method === "thread/realtime/itemAdded") {
    const payload = params as ThreadRealtimeItemAddedNotification;
    dispatch({ type: "realtime/itemAdded", threadId: payload.threadId, item: payload.item });
    return;
  }
  if (method === "thread/realtime/outputAudio/delta") {
    const payload = params as ThreadRealtimeOutputAudioDeltaNotification;
    dispatch({ type: "realtime/audioAdded", threadId: payload.threadId, audio: payload.audio });
    return;
  }
  if (method === "thread/realtime/error") {
    const payload = params as ThreadRealtimeErrorNotification;
    dispatch({ type: "realtime/error", threadId: payload.threadId, message: payload.message });
    return;
  }
  if (method === "thread/realtime/closed") {
    const payload = params as ThreadRealtimeClosedNotification;
    dispatch({ type: "realtime/closed", threadId: payload.threadId });
    return;
  }
  if (method === "windows/worldWritableWarning") {
    const payload = params as WindowsWorldWritableWarningNotification;
    pushBanner(dispatch, "warning", "World-writable paths detected", `${payload.samplePaths.join(", ")}${payload.extraCount > 0 ? ` (+${payload.extraCount} more)` : ""}`, "windows-world-writable");
    return;
  }
  if (method === "windowsSandbox/setupCompleted") {
    const payload = params as WindowsSandboxSetupCompletedNotification;
    dispatch({ type: "windowsSandbox/setupCompleted", mode: payload.mode, success: payload.success, error: payload.error });
    pushBanner(dispatch, payload.success ? "info" : "error", `Windows sandbox setup ${payload.success ? "completed" : "failed"}`, payload.error, "windows-sandbox");
  }
}
