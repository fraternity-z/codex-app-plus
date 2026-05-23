import { useCallback, useEffect, useRef } from "react";
import type { HostBridge } from "../../../bridge/types";
import type {
  AppState,
  ReceivedNotification,
} from "../../../domain/types";
import type { ReceivedServerRequest } from "../../../domain/serverRequests";
import { isThreadLikeSubagent } from "../../../domain/subagentSource";
import type { AppStoreApi } from "../../../state/store";
import type {
  AppPreferencesController,
  NotificationDeliveryMode,
  NotificationTriggerMode,
} from "../../settings/hooks/useAppPreferences";
import type { AgentMessageDeltaNotification } from "../../../protocol/generated/v2/AgentMessageDeltaNotification";
import type { ErrorNotification } from "../../../protocol/generated/v2/ErrorNotification";
import type { ItemCompletedNotification } from "../../../protocol/generated/v2/ItemCompletedNotification";
import type { ItemStartedNotification } from "../../../protocol/generated/v2/ItemStartedNotification";
import type { TurnCompletedNotification } from "../../../protocol/generated/v2/TurnCompletedNotification";
import type { TurnStartedNotification } from "../../../protocol/generated/v2/TurnStartedNotification";
import successSoundUrl from "../../../assets/success-notification.mp3";
import errorSoundUrl from "../../../assets/error-notification.mp3";
import { playNotificationSound } from "../model/notificationSounds";
import { deliverNotification } from "../model/systemNotifications";
import { useWindowFocusState } from "./useWindowFocusState";

const MAX_BODY_LENGTH = 200;
const MIN_COMPLETION_DURATION_MS = 60_000;
const MIN_NOTIFICATION_SPACING_MS = 1_500;

type SoundKind = "success" | "error";

type ResponseRequiredJob = {
  readonly key: string;
  readonly order: number;
  readonly threadId: string | null;
  readonly title: string;
  readonly body: string;
};

type RuntimeOptions = {
  readonly app: Pick<HostBridge, "app">["app"];
  readonly preferences: Pick<
    AppPreferencesController,
    | "notificationDeliveryMode"
    | "notificationTriggerMode"
    | "subagentNotificationsEnabled"
  >;
  readonly store: Pick<AppStoreApi, "getState" | "subscribe">;
  readonly isWindowFocused: boolean;
};

type ControllerOptions = Omit<RuntimeOptions, "isWindowFocused">;

type NotificationContext = RuntimeOptions;

function truncateText(text: string, maxLength: number = MAX_BODY_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? normalized;
}

function isSubagentThread(
  conversationsById: AppState["conversationsById"],
  threadId: string | null,
): boolean {
  if (!threadId) {
    return false;
  }

  const conversation = conversationsById[threadId];
  if (conversation && isThreadLikeSubagent(conversation)) {
    return true;
  }

  for (const currentConversation of Object.values(conversationsById)) {
    if (!currentConversation) {
      continue;
    }
    for (const turn of currentConversation.turns) {
      for (const itemState of turn.items) {
        if (itemState.item.type !== "collabAgentToolCall") {
          continue;
        }
        if (
          itemState.item.receiverThreadIds.includes(threadId) ||
          Object.prototype.hasOwnProperty.call(itemState.item.agentsStates, threadId)
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function buildThreadLabel(
  conversationsById: AppState["conversationsById"],
  threadId: string | null,
): string | null {
  if (!threadId) {
    return null;
  }

  const conversation = conversationsById[threadId];
  const title = conversation?.title?.trim();
  if (title) {
    return title;
  }

  const cwd = conversation?.cwd?.trim();
  if (cwd) {
    return basename(cwd);
  }

  return null;
}

function buildNotificationTitle(
  base: string,
  conversationsById: AppState["conversationsById"],
  threadId: string | null,
): string {
  const label = buildThreadLabel(conversationsById, threadId);
  return label ? `${base}: ${label}` : base;
}

function getLatestAgentMessage(
  conversationsById: AppState["conversationsById"],
  threadId: string,
): string | null {
  const conversation = conversationsById[threadId];
  if (!conversation) {
    return null;
  }

  for (let turnIndex = conversation.turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = conversation.turns[turnIndex];
    for (let itemIndex = turn.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = turn.items[itemIndex]?.item;
      if (item?.type !== "agentMessage") {
        continue;
      }
      const text = item.text.trim();
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function deliveryIncludesSystem(mode: NotificationDeliveryMode): boolean {
  return mode === "system+sound" || mode === "system";
}

function deliveryIncludesSound(mode: NotificationDeliveryMode): boolean {
  return mode === "system+sound" || mode === "sound";
}

function shouldTriggerNotification(
  triggerMode: NotificationTriggerMode,
  isWindowFocused: boolean,
): boolean {
  if (triggerMode === "never") {
    return false;
  }
  if (triggerMode === "always") {
    return true;
  }
  return !isWindowFocused;
}

async function sendConfiguredNotification(
  app: Pick<HostBridge, "app">["app"],
  deliveryMode: NotificationDeliveryMode,
  title: string,
  body: string,
  soundKind: SoundKind,
): Promise<void> {
  if (deliveryIncludesSound(deliveryMode)) {
    playNotificationSound(
      soundKind === "error" ? errorSoundUrl : successSoundUrl,
      soundKind,
    );
  }
  if (deliveryIncludesSystem(deliveryMode)) {
    const result = await deliverNotification(app, title, body);
    if (result.status === "failed") {
      console.error("Failed to deliver notification", result.error);
    }
  }
}

function buildApprovalBody(request: ReceivedServerRequest): string {
  if (request.kind === "commandApproval") {
    return request.params.command?.trim() || request.params.reason?.trim() || "A command needs approval.";
  }
  if (request.kind === "legacyCommandApproval") {
    const command = request.params.command.join(" ").trim();
    return command || request.params.reason?.trim() || "A command needs approval.";
  }
  if (request.kind === "fileApproval") {
    return request.params.reason?.trim() || "File changes need approval.";
  }
  if (request.kind === "legacyPatchApproval") {
    const changedFiles = Object.keys(request.params.fileChanges);
    if (changedFiles.length > 0) {
      return changedFiles.slice(0, 3).join(", ");
    }
    return request.params.reason?.trim() || "File changes need approval.";
  }
  return "Approval required.";
}

function buildResponseRequiredJob(
  request: ReceivedServerRequest,
  conversationsById: AppState["conversationsById"],
  order: number,
): ResponseRequiredJob | null {
  if (
    request.kind === "commandApproval" ||
    request.kind === "legacyCommandApproval" ||
    request.kind === "fileApproval" ||
    request.kind === "legacyPatchApproval"
  ) {
    return {
      key: `approval:${request.id}`,
      order,
      threadId: request.threadId,
      title: buildNotificationTitle("Approval needed", conversationsById, request.threadId),
      body: truncateText(buildApprovalBody(request)),
    };
  }

  if (request.kind === "userInput") {
    const firstQuestion = request.questions[0];
    const body =
      firstQuestion?.header?.trim() ||
      firstQuestion?.question?.trim() ||
      "Your input is needed.";
    return {
      key: `question:${request.id}`,
      order,
      threadId: request.threadId,
      title: buildNotificationTitle("Input needed", conversationsById, request.threadId),
      body: truncateText(body),
    };
  }

  return null;
}

function buildPlanJob(
  payload: ItemCompletedNotification,
  order: number,
  conversationsById: AppState["conversationsById"],
): ResponseRequiredJob | null {
  if (payload.item.type !== "plan") {
    return null;
  }

  const firstLine = payload.item.text.trim().split("\n")[0] ?? "";
  return {
    key: `plan:${payload.threadId}:${payload.item.id}`,
    order,
    threadId: payload.threadId,
    title: buildNotificationTitle("Plan ready", conversationsById, payload.threadId),
    body: truncateText(firstLine || "A plan is ready for review."),
  };
}

export function useAppNotificationsController(options: ControllerOptions): void {
  const isWindowFocused = useWindowFocusState();
  useAppNotificationsRuntime({ ...options, isWindowFocused });
}

export function useAppNotificationsRuntime({
  app,
  preferences,
  store,
  isWindowFocused,
}: RuntimeOptions): void {
  const lastProcessedNotificationRef = useRef<ReceivedNotification | null>(null);
  const lastMessageByThreadRef = useRef(new Map<string, string>());
  const turnStartByIdRef = useRef(new Map<string, number>());
  const turnStartByThreadRef = useRef(new Map<string, number>());
  const lastCompletionNotificationByThreadRef = useRef(new Map<string, number>());
  const notifiedResponseJobsRef = useRef(new Set<string>());
  const planJobsRef = useRef(new Map<string, ResponseRequiredJob>());
  const requestOrderRef = useRef<string[]>([]);
  const requestOrderMapRef = useRef(new Map<string, number>());
  const previousRequestIdsRef = useRef(new Set<string>());
  const orderCounterRef = useRef(0);
  const lastResponseNotificationAtRef = useRef(0);
  const responseRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncStateRef = useRef<() => void>(() => undefined);
  const latestContextRef = useRef<NotificationContext>({
    app,
    preferences,
    store,
    isWindowFocused,
  });
  latestContextRef.current = { app, preferences, store, isWindowFocused };

  const clearResponseRetry = useCallback(() => {
    if (responseRetryTimeoutRef.current) {
      clearTimeout(responseRetryTimeoutRef.current);
      responseRetryTimeoutRef.current = null;
    }
  }, []);

  const scheduleResponseRetry = useCallback(() => {
    const {
      preferences: latestPreferences,
      isWindowFocused: latestWindowFocus,
    } = latestContextRef.current;

    if (!shouldTriggerNotification(latestPreferences.notificationTriggerMode, latestWindowFocus)) {
      return;
    }
    if (responseRetryTimeoutRef.current) {
      return;
    }

    const elapsed = lastResponseNotificationAtRef.current
      ? Date.now() - lastResponseNotificationAtRef.current
      : MIN_NOTIFICATION_SPACING_MS;
    const delay = Math.max(0, MIN_NOTIFICATION_SPACING_MS - elapsed);
    responseRetryTimeoutRef.current = setTimeout(() => {
      responseRetryTimeoutRef.current = null;
      syncStateRef.current();
    }, delay);
  }, []);

  const consumeDuration = useCallback((threadId: string, turnId: string): number | null => {
    let startedAt: number | undefined;

    if (turnId) {
      startedAt = turnStartByIdRef.current.get(turnId);
      turnStartByIdRef.current.delete(turnId);
    }

    if (startedAt === undefined) {
      startedAt = turnStartByThreadRef.current.get(threadId);
    }

    if (startedAt !== undefined) {
      turnStartByThreadRef.current.delete(threadId);
      return Date.now() - startedAt;
    }

    return null;
  }, []);

  const recordTurnStart = useCallback((threadId: string, turnId: string): void => {
    const startedAt = Date.now();
    turnStartByThreadRef.current.set(threadId, startedAt);
    if (turnId) {
      turnStartByIdRef.current.set(turnId, startedAt);
    }
    lastMessageByThreadRef.current.delete(threadId);
  }, []);

  const recordStartIfMissing = useCallback((threadId: string): void => {
    if (!turnStartByThreadRef.current.has(threadId)) {
      turnStartByThreadRef.current.set(threadId, Date.now());
    }
  }, []);

  const maybeSendCompletionNotification = useCallback(async (
    state: AppState,
    threadId: string,
    turnId: string,
    soundKind: SoundKind,
    fallbackTitle: string,
    fallbackBody: string,
  ): Promise<void> => {
    const durationMs = consumeDuration(threadId, turnId);
    if (durationMs === null || durationMs < MIN_COMPLETION_DURATION_MS) {
      return;
    }

    if (
      preferences.subagentNotificationsEnabled === false &&
      isSubagentThread(state.conversationsById, threadId)
    ) {
      return;
    }

    if (!shouldTriggerNotification(preferences.notificationTriggerMode, isWindowFocused)) {
      return;
    }

    const lastNotifiedAt = lastCompletionNotificationByThreadRef.current.get(threadId);
    if (lastNotifiedAt && Date.now() - lastNotifiedAt < MIN_NOTIFICATION_SPACING_MS) {
      return;
    }
    lastCompletionNotificationByThreadRef.current.set(threadId, Date.now());

    const title = buildNotificationTitle(fallbackTitle, state.conversationsById, threadId);
    const latestMessage =
      lastMessageByThreadRef.current.get(threadId) ??
      getLatestAgentMessage(state.conversationsById, threadId);
    const body = truncateText(
      soundKind === "error" ? fallbackBody : latestMessage || fallbackBody,
    );

    await sendConfiguredNotification(
      app,
      preferences.notificationDeliveryMode,
      title,
      body,
      soundKind,
    );
    lastMessageByThreadRef.current.delete(threadId);
  }, [app, consumeDuration, isWindowFocused, preferences.notificationDeliveryMode, preferences.notificationTriggerMode, preferences.subagentNotificationsEnabled]);

  const syncState = useCallback(() => {
    const currentState = latestContextRef.current.store.getState();
    const currentRequestIds = new Set(Object.keys(currentState.pendingRequestsById));

    for (const requestId of currentRequestIds) {
      if (previousRequestIdsRef.current.has(requestId)) {
        continue;
      }
      orderCounterRef.current += 1;
      requestOrderRef.current = [...requestOrderRef.current, requestId];
      requestOrderMapRef.current.set(requestId, orderCounterRef.current);
    }

    for (const requestId of previousRequestIdsRef.current) {
      if (currentRequestIds.has(requestId)) {
        continue;
      }
      requestOrderRef.current = requestOrderRef.current.filter((value) => value !== requestId);
      requestOrderMapRef.current.delete(requestId);
      notifiedResponseJobsRef.current.delete(`approval:${requestId}`);
      notifiedResponseJobsRef.current.delete(`question:${requestId}`);
    }
    previousRequestIdsRef.current = currentRequestIds;

    const notifications = currentState.notifications;
    let nextNotifications: ReadonlyArray<ReceivedNotification> = notifications;
    if (lastProcessedNotificationRef.current !== null) {
      const previousIndex = notifications.indexOf(lastProcessedNotificationRef.current);
      nextNotifications =
        previousIndex >= 0
          ? notifications.slice(previousIndex + 1)
          : notifications.slice(-1);
    }

    if (notifications.length > 0) {
      lastProcessedNotificationRef.current = notifications[notifications.length - 1] ?? null;
    }

    for (const notification of nextNotifications) {
      switch (notification.method) {
        case "turn/started": {
          const payload = notification.params as TurnStartedNotification;
          recordTurnStart(payload.threadId, payload.turn.id);
          break;
        }
        case "item/started": {
          const payload = notification.params as ItemStartedNotification;
          recordStartIfMissing(payload.threadId);
          break;
        }
        case "item/agentMessage/delta": {
          const payload = notification.params as AgentMessageDeltaNotification;
          recordStartIfMissing(payload.threadId);
          break;
        }
        case "item/completed": {
          const payload = notification.params as ItemCompletedNotification;
          if (payload.item.type === "agentMessage") {
            const text = payload.item.text.trim();
            if (text) {
              lastMessageByThreadRef.current.set(payload.threadId, text);
            }
          }
          const planJob = buildPlanJob(
            payload,
            ++orderCounterRef.current,
            currentState.conversationsById,
          );
          if (planJob && !notifiedResponseJobsRef.current.has(planJob.key)) {
            planJobsRef.current.set(planJob.key, planJob);
          }
          break;
        }
        case "turn/completed": {
          const payload = notification.params as TurnCompletedNotification;
          const latestMessage = getLatestAgentMessage(
            currentState.conversationsById,
            payload.threadId,
          );
          if (latestMessage) {
            lastMessageByThreadRef.current.set(payload.threadId, latestMessage);
          }
          void maybeSendCompletionNotification(
            currentState,
            payload.threadId,
            payload.turn.id,
            "success",
            "Agent Complete",
            "Your agent has finished its task.",
          );
          break;
        }
        case "error": {
          const payload = notification.params as ErrorNotification;
          if (payload.willRetry || !payload.threadId) {
            break;
          }
          void maybeSendCompletionNotification(
            currentState,
            payload.threadId,
            payload.turnId,
            "error",
            "Agent Error",
            payload.error.message || "An error occurred.",
          );
          break;
        }
        default:
          break;
      }
    }

    const responseCandidates: ResponseRequiredJob[] = [];
    for (const planJob of planJobsRef.current.values()) {
      if (
        preferences.subagentNotificationsEnabled === false &&
        isSubagentThread(currentState.conversationsById, planJob.threadId)
      ) {
        continue;
      }
      responseCandidates.push(planJob);
    }

    for (let index = requestOrderRef.current.length - 1; index >= 0; index -= 1) {
      const requestId = requestOrderRef.current[index];
      const request = currentState.pendingRequestsById[requestId];
      if (!request) {
        continue;
      }
      if (
        preferences.subagentNotificationsEnabled === false &&
        isSubagentThread(currentState.conversationsById, request.threadId)
      ) {
        continue;
      }
      const order = requestOrderMapRef.current.get(requestId) ?? 0;
      const job = buildResponseRequiredJob(
        request,
        currentState.conversationsById,
        order,
      );
      if (job) {
        responseCandidates.push(job);
      }
    }

    responseCandidates.sort((left, right) => right.order - left.order);
    const nextJob = responseCandidates.find(
      (job) => !notifiedResponseJobsRef.current.has(job.key),
    );

    if (!nextJob) {
      clearResponseRetry();
      return;
    }

    if (!shouldTriggerNotification(preferences.notificationTriggerMode, isWindowFocused)) {
      clearResponseRetry();
      return;
    }

    const elapsed = lastResponseNotificationAtRef.current
      ? Date.now() - lastResponseNotificationAtRef.current
      : MIN_NOTIFICATION_SPACING_MS;
    if (elapsed < MIN_NOTIFICATION_SPACING_MS) {
      scheduleResponseRetry();
      return;
    }

    clearResponseRetry();
    lastResponseNotificationAtRef.current = Date.now();
    notifiedResponseJobsRef.current.add(nextJob.key);
    if (planJobsRef.current.has(nextJob.key)) {
      planJobsRef.current.delete(nextJob.key);
    }

    void sendConfiguredNotification(
      app,
      preferences.notificationDeliveryMode,
      nextJob.title,
      nextJob.body,
      "success",
    );
  }, [app, clearResponseRetry, isWindowFocused, maybeSendCompletionNotification, preferences.notificationDeliveryMode, preferences.notificationTriggerMode, preferences.subagentNotificationsEnabled, recordStartIfMissing, recordTurnStart, scheduleResponseRetry]);
  syncStateRef.current = syncState;

  useEffect(() => {
    syncState();
  }, [syncState]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      queueMicrotask(syncState);
    });
    return () => {
      unsubscribe();
      clearResponseRetry();
    };
  }, [clearResponseRetry, store, syncState]);
}
