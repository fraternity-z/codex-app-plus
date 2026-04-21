// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppAction, AppState } from "../../../domain/types";
import type { Thread } from "../../../protocol/generated/v2/Thread";
import type { ThreadItem } from "../../../protocol/generated/v2/ThreadItem";
import type { Turn } from "../../../protocol/generated/v2/Turn";
import { createConversationFromThread } from "../../conversation/model/conversationState";
import { createInitialState, appReducer } from "../../../state/appReducer";
import { useAppNotificationsRuntime } from "./useAppNotificationsController";

const playNotificationSound = vi.fn();
const deliverNotification = vi.fn().mockResolvedValue({
  status: "sent",
  via: "system",
});

vi.mock("../model/notificationSounds", () => ({
  playNotificationSound: (...args: unknown[]) => playNotificationSound(...args),
}));

vi.mock("../model/systemNotifications", () => ({
  deliverNotification: (...args: unknown[]) => deliverNotification(...args),
}));

type MockStore = {
  readonly getState: () => AppState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly dispatch: (action: AppAction) => void;
};

function createMockStore(): MockStore {
  let state = createInitialState();
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      state = appReducer(state, action);
      listeners.forEach((listener) => listener());
    },
  };
}

function createThread(
  overrides: Partial<Thread> = {},
): Thread {
  return {
    id: "thread-1",
    forkedFromId: null,
    preview: "Preview",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: { type: "idle" },
    path: null,
    cwd: "E:/code/codex-app-plus",
    cliVersion: "1.0.0",
    source: "appServer",
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: "Primary Thread",
    turns: [],
    ...overrides,
  };
}

function createTurn(
  overrides: Partial<Turn> = {},
): Turn {
  return {
    id: "turn-1",
    items: [],
    status: "inProgress",
    error: null,
    startedAt: 1,
    completedAt: null,
    durationMs: null,
    ...overrides,
  };
}

function createAgentMessage(
  text: string,
  id = "item-1",
): ThreadItem {
  return {
    type: "agentMessage",
    id,
    text,
    phase: null,
    memoryCitation: null,
  };
}

describe("useAppNotificationsRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T00:00:00.000Z"));
    playNotificationSound.mockReset();
    deliverNotification.mockReset();
    deliverNotification.mockResolvedValue({
      status: "sent",
      via: "system",
    });
  });

  it("sends a completion notification after a long-running turn completes", async () => {
    const store = createMockStore();
    store.dispatch({
      type: "conversation/upserted",
      conversation: createConversationFromThread(createThread()),
    });

    renderHook(() =>
      useAppNotificationsRuntime({
        store,
        app: { showNotification: vi.fn() } as never,
        isWindowFocused: false,
        preferences: {
          notificationDeliveryMode: "system+sound",
          notificationTriggerMode: "unfocused",
          subagentNotificationsEnabled: true,
        },
      }),
    );

    act(() => {
      const startedTurn = createTurn();
      store.dispatch({
        type: "notification/received",
        notification: { method: "turn/started", params: { threadId: "thread-1", turn: startedTurn } },
      });
      store.dispatch({
        type: "conversation/turnStarted",
        conversationId: "thread-1",
        turn: startedTurn,
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    act(() => {
      const completedItem = createAgentMessage("Finished answer");
      const completedTurn = createTurn({
        status: "completed",
        items: [completedItem],
      });
      store.dispatch({
        type: "notification/received",
        notification: {
          method: "item/completed",
          params: { threadId: "thread-1", turnId: "turn-1", item: completedItem },
        },
      });
      store.dispatch({
        type: "conversation/itemCompleted",
        conversationId: "thread-1",
        turnId: "turn-1",
        item: completedItem,
      });
      store.dispatch({
        type: "notification/received",
        notification: {
          method: "turn/completed",
          params: { threadId: "thread-1", turn: completedTurn },
        },
      });
      store.dispatch({
        type: "conversation/turnCompleted",
        conversationId: "thread-1",
        turn: completedTurn,
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(deliverNotification).toHaveBeenCalledWith(
      expect.objectContaining({ showNotification: expect.any(Function) }),
      "Agent Complete: Primary Thread",
      "Finished answer",
    );
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("waits until the window is unfocused before sending response-required notifications", async () => {
    const store = createMockStore();
    store.dispatch({
      type: "conversation/upserted",
      conversation: createConversationFromThread(createThread()),
    });

    const { rerender } = renderHook(
      ({ isWindowFocused }) =>
        useAppNotificationsRuntime({
          store,
          isWindowFocused,
          preferences: {
          notificationDeliveryMode: "system",
          notificationTriggerMode: "unfocused",
          subagentNotificationsEnabled: true,
        },
        app: { showNotification: vi.fn() } as never,
      }),
      { initialProps: { isWindowFocused: true } },
    );

    act(() => {
      store.dispatch({
        type: "serverRequest/received",
        request: {
          kind: "commandApproval",
          id: "1",
          rpcId: "1",
          method: "item/commandExecution/requestApproval",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-1",
            command: "pnpm test",
          },
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(deliverNotification).not.toHaveBeenCalled();

    rerender({ isWindowFocused: false });

    await act(async () => {
      await Promise.resolve();
    });

    expect(deliverNotification).toHaveBeenCalledWith(
      expect.objectContaining({ showNotification: expect.any(Function) }),
      "Approval needed: Primary Thread",
      "pnpm test",
    );
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("respects sound-only delivery mode", async () => {
    const store = createMockStore();
    store.dispatch({
      type: "conversation/upserted",
      conversation: createConversationFromThread(createThread()),
    });

    renderHook(() =>
      useAppNotificationsRuntime({
        store,
        app: { showNotification: vi.fn() } as never,
        isWindowFocused: true,
        preferences: {
          notificationDeliveryMode: "sound",
          notificationTriggerMode: "always",
          subagentNotificationsEnabled: true,
        },
      }),
    );

    act(() => {
      const startedTurn = createTurn();
      store.dispatch({
        type: "notification/received",
        notification: { method: "turn/started", params: { threadId: "thread-1", turn: startedTurn } },
      });
      store.dispatch({
        type: "conversation/turnStarted",
        conversationId: "thread-1",
        turn: startedTurn,
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    act(() => {
      const completedItem = createAgentMessage("Finished answer");
      const completedTurn = createTurn({
        status: "completed",
        items: [completedItem],
      });
      store.dispatch({
        type: "notification/received",
        notification: {
          method: "item/completed",
          params: { threadId: "thread-1", turnId: "turn-1", item: completedItem },
        },
      });
      store.dispatch({
        type: "conversation/itemCompleted",
        conversationId: "thread-1",
        turnId: "turn-1",
        item: completedItem,
      });
      store.dispatch({
        type: "notification/received",
        notification: {
          method: "turn/completed",
          params: { threadId: "thread-1", turn: completedTurn },
        },
      });
      store.dispatch({
        type: "conversation/turnCompleted",
        conversationId: "thread-1",
        turn: completedTurn,
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it("queues plan notifications inside the throttle window", async () => {
    const store = createMockStore();
    store.dispatch({
      type: "conversation/upserted",
      conversation: createConversationFromThread(createThread()),
    });

    renderHook(() =>
      useAppNotificationsRuntime({
        store,
        app: { showNotification: vi.fn() } as never,
        isWindowFocused: false,
        preferences: {
          notificationDeliveryMode: "system",
          notificationTriggerMode: "unfocused",
          subagentNotificationsEnabled: true,
        },
      }),
    );

    act(() => {
      store.dispatch({
        type: "notification/received",
        notification: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "plan", id: "plan-1", text: "First plan" },
          },
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(deliverNotification).toHaveBeenCalledTimes(1);
    expect(deliverNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ showNotification: expect.any(Function) }),
      "Plan ready: Primary Thread",
      "First plan",
    );

    act(() => {
      store.dispatch({
        type: "notification/received",
        notification: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "plan", id: "plan-2", text: "Second plan" },
          },
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(deliverNotification).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(deliverNotification).toHaveBeenCalledTimes(2);
    expect(deliverNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ showNotification: expect.any(Function) }),
      "Plan ready: Primary Thread",
      "Second plan",
    );
  });
});
