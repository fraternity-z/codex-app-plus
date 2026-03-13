import { describe, expect, it, vi } from "vitest";
import type { AppAction } from "../../domain/types";
import { INITIAL_STATE } from "../../domain/types";
import { appReducer } from "../../state/appReducer";
import { applyAppServerNotification } from "./appControllerNotifications";
import { createConversationFromThread } from "../../features/conversation/model/conversationState";
import { FrameTextDeltaQueue } from "../../features/conversation/model/frameTextDeltaQueue";
import { OutputDeltaQueue } from "../../features/conversation/model/outputDeltaQueue";

function createThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    preview: "Inspect workspace",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 1,
    status: { type: "idle" as const },
    path: null,
    cwd: "E:/code/FPGA",
    cliVersion: "0.1.0",
    source: "appServer" as const,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...overrides,
  };
}

function createContext(dispatch: (action: AppAction) => void) {
  return {
    dispatch,
    textDeltaQueue: new FrameTextDeltaQueue({ onFlush: () => undefined }),
    outputDeltaQueue: new OutputDeltaQueue({ onFlush: () => undefined }),
  };
}

describe("applyAppServerNotification", () => {
  it("marks thread/started conversations as resumed", () => {
    const dispatch = vi.fn<(action: AppAction) => void>();

    applyAppServerNotification(createContext(dispatch), "thread/started", { thread: createThread() });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "conversation/upserted",
      conversation: expect.objectContaining({
        id: "thread-1",
        resumeState: "resumed",
      }),
    }));
  });

  it("marks thread/closed conversations as notLoaded and resumable", () => {
    const dispatch = vi.fn<(action: AppAction) => void>();

    applyAppServerNotification(createContext(dispatch), "thread/closed", { threadId: "thread-1" });

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "conversation/statusChanged",
      conversationId: "thread-1",
      status: "notLoaded",
      activeFlags: [],
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "conversation/resumeStateChanged",
      conversationId: "thread-1",
      resumeState: "needs_resume",
    });
  });

  it("marks notLoaded status updates as needing resume", () => {
    const dispatch = vi.fn<(action: AppAction) => void>();

    applyAppServerNotification(createContext(dispatch), "thread/status/changed", {
      threadId: "thread-1",
      status: { type: "notLoaded" },
    });

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "conversation/statusChanged",
      conversationId: "thread-1",
      status: "notLoaded",
      activeFlags: [],
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "conversation/resumeStateChanged",
      conversationId: "thread-1",
      resumeState: "needs_resume",
    });
  });

  it("records windows sandbox setup completion", () => {
    const dispatch = vi.fn<(action: AppAction) => void>();

    applyAppServerNotification(createContext(dispatch), "windowsSandbox/setupCompleted", {
      mode: "unelevated",
      success: false,
      error: "setup failed",
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "windowsSandbox/setupCompleted",
      mode: "unelevated",
      success: false,
      error: "setup failed",
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "banner/pushed",
      banner: expect.objectContaining({
        source: "windows-sandbox",
        level: "error",
      }),
    }));
  });

  it("flushes pending text deltas before completing an item", () => {
    let state = appReducer(INITIAL_STATE, {
      type: "conversation/upserted",
      conversation: createConversationFromThread(createThread()),
    });
    const dispatch = (action: AppAction) => {
      state = appReducer(state, action);
    };
    const textDeltaEntry = {
      conversationId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      target: { type: "agentMessage" as const },
      delta: "草稿",
    };

    applyAppServerNotification({
      dispatch,
      textDeltaQueue: {
        enqueue: () => undefined,
        flushNow: () => dispatch({ type: "conversation/textDeltasFlushed", entries: [textDeltaEntry] }),
      } as unknown as FrameTextDeltaQueue,
      outputDeltaQueue: {
        enqueue: () => undefined,
        flushNow: () => undefined,
      } as unknown as OutputDeltaQueue,
    }, "item/completed", {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { type: "agentMessage", id: "item-1", text: "完整答案", phase: null },
    });

    const completedItem = state.conversationsById["thread-1"]?.turns[0]?.items[0]?.item;

    expect(completedItem).toMatchObject({ type: "agentMessage", id: "item-1" });
    if (completedItem?.type === "agentMessage") {
      expect(completedItem.text).toBe("完整答案");
    }
  });
});
