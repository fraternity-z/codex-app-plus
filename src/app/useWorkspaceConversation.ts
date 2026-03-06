import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ComposerSelection } from "./composerPreferences";
import type { CodexSessionReadOutput, HostBridge } from "../bridge/types";
import type { ConversationMessage, ThreadSummary } from "../domain/types";
import {
  createUserConversationMessage,
  mapThreadHistoryToMessages,
  normalizeConversationMessageText
} from "./conversationMessages";
import type { ThreadReadParams } from "../protocol/generated/v2/ThreadReadParams";
import type { ThreadReadResponse } from "../protocol/generated/v2/ThreadReadResponse";
import type { ThreadResumeParams } from "../protocol/generated/v2/ThreadResumeParams";
import type { ThreadStartParams } from "../protocol/generated/v2/ThreadStartParams";
import type { ThreadStartResponse } from "../protocol/generated/v2/ThreadStartResponse";
import type { TurnStartParams } from "../protocol/generated/v2/TurnStartParams";
import type { TurnStartResponse } from "../protocol/generated/v2/TurnStartResponse";
import { mapThreadToSummary } from "../protocol/mappers";
import { useAppStore } from "../state/store";
import { mergeThreadCatalogs } from "./threadCatalog";
import { listThreadsForWorkspace } from "./workspaceThread";

interface WorkspaceConversationController {
  readonly selectedThreadId: string | null;
  readonly workspaceThreads: ReadonlyArray<ThreadSummary>;
  createThread: (model?: string | null) => Promise<string>;
  selectThread: (threadId: string | null) => void;
  sendTurn: (selection: ComposerSelection) => Promise<void>;
}

interface UseWorkspaceConversationOptions {
  readonly hostBridge: HostBridge;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly selectedRootPath: string | null;
  readonly reloadCodexSessions: () => Promise<void>;
}

function mapCodexSessionMessages(threadId: string, response: CodexSessionReadOutput): ReadonlyArray<ConversationMessage> {
  return response.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const role = message.role as "user" | "assistant";
      return {
        id: message.id,
        threadId,
        turnId: null,
        itemId: message.id,
        role,
        text: normalizeConversationMessageText(role, message.text),
        status: "done" as const
      };
    })
    .filter((message) => message.text.trim().length > 0);
}

function createLoadedThreadKey(thread: ThreadSummary): string {
  return `${thread.source ?? "rpc"}:${thread.id}`;
}

export function useWorkspaceConversation(options: UseWorkspaceConversationOptions): WorkspaceConversationController {
  const { dispatch, state } = useAppStore();
  const loadedThreadKeys = useRef(new Set<string>());
  const resumedThreadIds = useRef(new Set<string>());
  const workspaceThreads = useMemo(
    () => listThreadsForWorkspace(options.codexSessions, options.selectedRootPath),
    [options.codexSessions, options.selectedRootPath]
  );
  const knownThreads = useMemo(
    () => mergeThreadCatalogs(options.threads, options.codexSessions),
    [options.codexSessions, options.threads]
  );
  const selectableThreads = useMemo(
    () => listThreadsForWorkspace(knownThreads, options.selectedRootPath),
    [knownThreads, options.selectedRootPath]
  );
  const selectedThreadId = useMemo(() => {
    if (state.selectedThreadId !== null && selectableThreads.some((thread) => thread.id === state.selectedThreadId)) {
      return state.selectedThreadId;
    }
    return null;
  }, [selectableThreads, state.selectedThreadId]);
  const selectedThread = useMemo(
    () => knownThreads.find((thread) => thread.id === selectedThreadId) ?? null,
    [knownThreads, selectedThreadId]
  );
  const lastNotification = state.notifications[state.notifications.length - 1] ?? null;

  useEffect(() => {
    if (state.selectedThreadId !== selectedThreadId) {
      dispatch({ type: "thread/selected", threadId: selectedThreadId });
    }
  }, [dispatch, selectedThreadId, state.selectedThreadId]);

  const loadThreadHistory = useCallback(
    async (thread: ThreadSummary) => {
      const threadKey = createLoadedThreadKey(thread);
      if (thread.source === "codexData") {
        const response = await options.hostBridge.app.readCodexSession({ threadId: thread.id });
        dispatch({ type: "thread/messagesLoaded", threadId: thread.id, messages: mapCodexSessionMessages(thread.id, response) });
        loadedThreadKeys.current.add(threadKey);
        return;
      }

      const params: ThreadReadParams = { threadId: thread.id, includeTurns: true };
      const response = (await options.hostBridge.rpc.request({ method: "thread/read", params })).result as ThreadReadResponse;
      dispatch({ type: "thread/upserted", thread: mapThreadToSummary(response.thread) });
      dispatch({ type: "thread/messagesLoaded", threadId: thread.id, messages: mapThreadHistoryToMessages(response.thread) });
      loadedThreadKeys.current.add(threadKey);
    },
    [dispatch, options.hostBridge.app, options.hostBridge.rpc]
  );

  useEffect(() => {
    if (selectedThread === null || loadedThreadKeys.current.has(createLoadedThreadKey(selectedThread))) {
      return;
    }
    void loadThreadHistory(selectedThread).catch((error) => {
      dispatch({ type: "fatal/error", message: String(error) });
    });
  }, [dispatch, loadThreadHistory, selectedThread]);

  useEffect(() => {
    if (lastNotification?.method !== "turn/completed") {
      return;
    }
    void options.reloadCodexSessions();
  }, [lastNotification, options.reloadCodexSessions]);

  const ensureThreadResumed = useCallback(
    async (threadId: string) => {
      if (resumedThreadIds.current.has(threadId)) {
        return;
      }
      const params: ThreadResumeParams = { threadId, persistExtendedHistory: true };
      await options.hostBridge.rpc.request({ method: "thread/resume", params });
      resumedThreadIds.current.add(threadId);
    },
    [options.hostBridge.rpc]
  );

  const runBusy = useCallback(
    async <T,>(runner: () => Promise<T>): Promise<T> => {
      dispatch({ type: "busy/changed", busy: true });
      try {
        return await runner();
      } finally {
        dispatch({ type: "busy/changed", busy: false });
      }
    },
    [dispatch]
  );

  const createThread = useCallback(async (model: string | null = null) => {
    if (options.selectedRootPath === null) {
      throw new Error("请先选择一个工作区文件夹");
    }
    return runBusy(async () => {
      const params: ThreadStartParams = {
        model: model ?? undefined,
        cwd: options.selectedRootPath,
        experimentalRawEvents: false,
        persistExtendedHistory: true
      };
      const response = (await options.hostBridge.rpc.request({ method: "thread/start", params })).result as ThreadStartResponse;
      const summary = mapThreadToSummary(response.thread);
      dispatch({ type: "thread/upserted", thread: summary });
      dispatch({ type: "thread/selected", threadId: response.thread.id });
      dispatch({ type: "thread/messagesLoaded", threadId: response.thread.id, messages: [] });
      loadedThreadKeys.current.add(createLoadedThreadKey(summary));
      resumedThreadIds.current.add(response.thread.id);
      await options.reloadCodexSessions();
      return response.thread.id;
    });
  }, [dispatch, options.hostBridge.rpc, options.reloadCodexSessions, options.selectedRootPath, runBusy]);

  const sendTurn = useCallback(async (selection: ComposerSelection) => {
    const text = state.inputText.trim();
    if (text.length === 0) {
      return;
    }
    const threadId = selectedThreadId ?? (await createThread(selection.model));
    await runBusy(async () => {
      await ensureThreadResumed(threadId);
      const params: TurnStartParams = {
        threadId,
        model: selection.model ?? undefined,
        effort: selection.effort ?? undefined,
        cwd: options.selectedRootPath ?? undefined,
        input: [{ type: "text", text, text_elements: [] }]
      };
      const response = (await options.hostBridge.rpc.request({ method: "turn/start", params })).result as TurnStartResponse;
      dispatch({ type: "thread/selected", threadId });
      dispatch({ type: "thread/touched", threadId, updatedAt: new Date().toISOString() });
      dispatch({ type: "message/added", message: createUserConversationMessage(threadId, response.turn.id, text) });
      dispatch({ type: "input/changed", value: "" });
      await options.reloadCodexSessions();
    });
  }, [createThread, dispatch, ensureThreadResumed, options.hostBridge.rpc, options.reloadCodexSessions, options.selectedRootPath, runBusy, selectedThreadId, state.inputText]);

  const selectThread = useCallback(
    (threadId: string | null) => {
      if (threadId === null) {
        dispatch({ type: "thread/selected", threadId: null });
        return;
      }
      const localThread = options.codexSessions.find((thread) => thread.id === threadId);
      const nextThread = localThread ?? knownThreads.find((thread) => thread.id === threadId);
      if (nextThread !== undefined) {
        dispatch({ type: "thread/upserted", thread: nextThread });
      }
      dispatch({ type: "thread/selected", threadId });
    },
    [dispatch, knownThreads, options.codexSessions]
  );

  return {
    selectedThreadId,
    workspaceThreads,
    createThread,
    selectThread,
    sendTurn
  };
}
