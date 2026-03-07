import type { Dispatch } from "react";
import type { AppAction } from "../domain/types";
import { isPrewarmedThread } from "./prewarmedThreadManager";
import type { FrameTextDeltaQueue } from "./frameTextDeltaQueue";
import type { OutputDeltaQueue } from "./outputDeltaQueue";
import type { AgentMessageDeltaNotification } from "../protocol/generated/v2/AgentMessageDeltaNotification";
import type { CommandExecutionOutputDeltaNotification } from "../protocol/generated/v2/CommandExecutionOutputDeltaNotification";
import type { FileChangeOutputDeltaNotification } from "../protocol/generated/v2/FileChangeOutputDeltaNotification";
import type { ItemCompletedNotification } from "../protocol/generated/v2/ItemCompletedNotification";
import type { ItemStartedNotification } from "../protocol/generated/v2/ItemStartedNotification";
import type { PlanDeltaNotification } from "../protocol/generated/v2/PlanDeltaNotification";
import type { ReasoningSummaryTextDeltaNotification } from "../protocol/generated/v2/ReasoningSummaryTextDeltaNotification";
import type { ReasoningTextDeltaNotification } from "../protocol/generated/v2/ReasoningTextDeltaNotification";
import type { ServerRequestResolvedNotification } from "../protocol/generated/v2/ServerRequestResolvedNotification";
import type { TerminalInteractionNotification } from "../protocol/generated/v2/TerminalInteractionNotification";
import type { ThreadStartedNotification } from "../protocol/generated/v2/ThreadStartedNotification";
import type { ThreadStatusChangedNotification } from "../protocol/generated/v2/ThreadStatusChangedNotification";
import type { TurnCompletedNotification } from "../protocol/generated/v2/TurnCompletedNotification";
import type { TurnDiffUpdatedNotification } from "../protocol/generated/v2/TurnDiffUpdatedNotification";
import type { TurnPlanUpdatedNotification } from "../protocol/generated/v2/TurnPlanUpdatedNotification";
import type { TurnStartedNotification } from "../protocol/generated/v2/TurnStartedNotification";
import { createConversationFromThread } from "./conversationState";

interface NotificationContext {
  readonly dispatch: Dispatch<AppAction>;
  readonly textDeltaQueue: FrameTextDeltaQueue;
  readonly outputDeltaQueue: OutputDeltaQueue;
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
    const payload = params as CommandExecutionOutputDeltaNotification;
    outputDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: "commandExecution", delta: payload.delta });
    return;
  }
  if (method === "item/fileChange/outputDelta") {
    const payload = params as FileChangeOutputDeltaNotification;
    outputDeltaQueue.enqueue({ conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, target: "fileChange", delta: payload.delta });
    return;
  }
  if (method === "item/commandExecution/terminalInteraction") {
    const payload = params as TerminalInteractionNotification;
    dispatch({ type: "conversation/terminalInteraction", conversationId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, stdin: payload.stdin });
    return;
  }
  if (method === "item/started") {
    const payload = params as ItemStartedNotification;
    dispatch({ type: "conversation/itemStarted", conversationId: payload.threadId, turnId: payload.turnId, item: payload.item });
    return;
  }
  if (method === "item/completed") {
    const payload = params as ItemCompletedNotification;
    dispatch({ type: "conversation/itemCompleted", conversationId: payload.threadId, turnId: payload.turnId, item: payload.item });
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
    dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(payload.thread) });
    return;
  }
  if (method === "thread/status/changed") {
    const payload = params as ThreadStatusChangedNotification;
    const activeFlags = payload.status.type === "active" ? payload.status.activeFlags : [];
    dispatch({ type: "conversation/statusChanged", conversationId: payload.threadId, status: payload.status.type, activeFlags });
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
  }
}
