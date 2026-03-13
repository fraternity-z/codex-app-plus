import { Profiler, useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import type { AppStoreApi } from "../../../state/store";
import { AppStoreProvider, useAppDispatch } from "../../../state/store";
import { createConversationFromThread } from "../../conversation/model/conversationState";
import { HomeSidebar } from "./HomeSidebar";

const ROOT = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };

function createThread(source: ThreadSummary["source"]): ThreadSummary {
  return {
    id: `thread-${source}`,
    title: `线程 ${source}`,
    branch: null,
    cwd: ROOT.path,
    archived: false,
    updatedAt: "2026-03-12T10:00:00.000Z",
    source,
    agentEnvironment: "windowsNative",
    status: source === "rpc" ? "idle" : "notLoaded",
    activeFlags: [],
    queuedCount: 0
  };
}

function createRuntimeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    preview: "thread",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 1,
    status: { type: "idle" as const },
    path: null,
    cwd: ROOT.path,
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

function createSubAgentSource(parentThreadId = "thread-1") {
  return { subAgent: { thread_spawn: { parent_thread_id: parentThreadId, depth: 1, agent_nickname: null, agent_role: "explorer" } } };
}

function createRunningCollabTurn(senderThreadId: string, childThreadIds: ReadonlyArray<string>) {
  return {
    id: `turn-${senderThreadId}`,
    status: "completed" as const,
    error: null,
    items: [{
      type: "collabAgentToolCall" as const,
      id: `collab-${senderThreadId}`,
      tool: "spawnAgent" as const,
      status: "completed" as const,
      senderThreadId,
      receiverThreadIds: [...childThreadIds],
      prompt: "inspect ui",
      agentsStates: Object.fromEntries(childThreadIds.map((threadId) => [threadId, { status: "running", message: null }])),
    }],
  };
}

function readThreadId(params: unknown): string {
  return (params as { threadId: string }).threadId;
}

function renderSidebar(thread: ThreadSummary, options?: {
  readonly onArchiveThread?: (threadId: string) => Promise<void>;
  readonly deleteCodexSession?: ReturnType<typeof vi.fn>;
  readonly request?: ReturnType<typeof vi.fn>;
  readonly initializeStore?: (dispatch: AppStoreApi["dispatch"]) => void;
}) {
  const onArchiveThread = options?.onArchiveThread ?? vi.fn().mockResolvedValue(undefined);
  const deleteCodexSession = options?.deleteCodexSession ?? vi.fn().mockResolvedValue(undefined);
  const request = options?.request ?? vi.fn().mockResolvedValue({ requestId: "noop", result: {} });
  const hostBridge = { app: { deleteCodexSession }, rpc: { request } } as unknown as HostBridge;

  function Harness(): JSX.Element {
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(thread.id);

    return (
      <AppStoreProvider>
        {options?.initializeStore ? <DispatchRecorder onReady={options.initializeStore} /> : null}
        <div data-testid="selected-thread">{selectedThreadId ?? "none"}</div>
        <HomeSidebar
          hostBridge={hostBridge}
          roots={[ROOT]}
          codexSessions={[thread]}
          codexSessionsLoading={false}
          codexSessionsError={null}
          selectedRootId={ROOT.id}
          selectedThreadId={selectedThreadId}
          authStatus="authenticated"
          authMode="apikey"
          authBusy={false}
          authLoginPending={false}
          settingsMenuOpen={false}
          collapsed={false}
          onToggleSettingsMenu={vi.fn()}
          onDismissSettingsMenu={vi.fn()}
          onOpenSettings={vi.fn()}
          onLogin={vi.fn().mockResolvedValue(undefined)}
          onLogout={vi.fn().mockResolvedValue(undefined)}
          onSelectRoot={vi.fn()}
          onSelectThread={setSelectedThreadId}
          onCreateThread={vi.fn().mockResolvedValue(undefined)}
          onArchiveThread={onArchiveThread}
          onAddRoot={vi.fn()}
          onRemoveRoot={vi.fn()}
        />
      </AppStoreProvider>
    );
  }

  render(<Harness />);
  return { onArchiveThread, deleteCodexSession, request };
}

function DispatchRecorder(props: { readonly onReady: (dispatch: AppStoreApi["dispatch"]) => void }): null {
  const dispatch = useAppDispatch();

  useEffect(() => {
    props.onReady(dispatch);
  }, [dispatch, props]);

  return null;
}

describe("HomeSidebar", () => {
  it("clears the current selection after archiving the selected thread", async () => {
    const thread = createThread("rpc");
    const { onArchiveThread } = renderSidebar(thread);

    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /线程 rpc/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "归档会话" }));

    await waitFor(() => expect(onArchiveThread).toHaveBeenCalledWith(thread.id));
    await waitFor(() => expect(screen.getByTestId("selected-thread")).toHaveTextContent("none"));
  });

  it("keeps delete behavior clearing the selected thread", async () => {
    const thread = createThread("codexData");
    const { deleteCodexSession } = renderSidebar(thread);

    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /线程 codexData/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));

    await waitFor(() => expect(deleteCodexSession).toHaveBeenCalledWith({ threadId: thread.id, agentEnvironment: "windowsNative" }));
    await waitFor(() => expect(screen.getByTestId("selected-thread")).toHaveTextContent("none"));
  });

  it("force-cleans descendants before deleting an rpc thread", async () => {
    const thread = createThread("rpc");
    const deleteCodexSession = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn(async (input: { readonly method: string; readonly params: unknown }) => {
      if (input.method === "turn/interrupt") {
        return { requestId: `interrupt-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/backgroundTerminals/clean") {
        return { requestId: `clean-${String((input.params as { threadId: string }).threadId)}`, result: {} };
      }
      if (input.method === "thread/unsubscribe") {
        return { requestId: `unsubscribe-${String((input.params as { threadId: string }).threadId)}`, result: { status: "unsubscribed" } };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    renderSidebar(thread, {
      deleteCodexSession,
      request,
      initializeStore: (dispatch) => {
        dispatch({
          type: "conversation/upserted",
          conversation: createConversationFromThread(createRuntimeThread({
            id: "thread-rpc",
            status: { type: "active" as const, activeFlags: [] },
            turns: [createRunningCollabTurn("thread-rpc", ["thread-child"]), { id: "turn-1", status: "inProgress" as const, error: null, items: [] }],
          }), { resumeState: "resumed" })
        });
        dispatch({
          type: "conversation/upserted",
          conversation: createConversationFromThread(createRuntimeThread({
            id: "thread-child",
            source: createSubAgentSource("thread-rpc"),
            status: { type: "active" as const, activeFlags: [] },
            turns: [{ id: "turn-1", status: "inProgress" as const, error: null, items: [] }],
          }), { resumeState: "resumed" })
        });
      },
    });

    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /线程 rpc/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "turn/interrupt", params: { threadId: "thread-child", turnId: "turn-1" } })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "thread/unsubscribe", params: { threadId: "thread-rpc" } })));
    await waitFor(() => expect(deleteCodexSession).toHaveBeenCalledWith({ threadId: thread.id, agentEnvironment: "windowsNative" }));
    const childUnsubscribeCall = request.mock.calls.findIndex(([input]) => input.method === "thread/unsubscribe" && readThreadId(input.params) === "thread-child");
    const rootUnsubscribeCall = request.mock.calls.findIndex(([input]) => input.method === "thread/unsubscribe" && readThreadId(input.params) === "thread-rpc");
    const childCallOrder = request.mock.invocationCallOrder[childUnsubscribeCall];
    const rootCallOrder = request.mock.invocationCallOrder[rootUnsubscribeCall];
    const deleteCall = deleteCodexSession.mock.invocationCallOrder[0];
    expect(childUnsubscribeCall).toBeGreaterThanOrEqual(0);
    expect(rootUnsubscribeCall).toBeGreaterThanOrEqual(0);
    expect(childCallOrder).toBeLessThan(rootCallOrder);
    expect(rootCallOrder).toBeLessThan(deleteCall);
  });

  it("ignores unrelated store updates when only dispatch is needed", () => {
    const thread = createThread("rpc");
    const onRender = vi.fn();
    let dispatch: AppStoreApi["dispatch"] | null = null;

    render(
      <AppStoreProvider>
        <DispatchRecorder onReady={(nextDispatch) => {
          dispatch = nextDispatch;
        }} />
        <Profiler id="home-sidebar" onRender={onRender}>
          <HomeSidebar
            hostBridge={{ app: { deleteCodexSession: vi.fn().mockResolvedValue(undefined) }, rpc: { request: vi.fn() } } as unknown as HostBridge}
            roots={[ROOT]}
            codexSessions={[thread]}
            codexSessionsLoading={false}
            codexSessionsError={null}
            selectedRootId={ROOT.id}
            selectedThreadId={thread.id}
            authStatus="authenticated"
            authMode="apikey"
            authBusy={false}
            authLoginPending={false}
            settingsMenuOpen={false}
            collapsed={false}
            onToggleSettingsMenu={vi.fn()}
            onDismissSettingsMenu={vi.fn()}
            onOpenSettings={vi.fn()}
            onLogin={vi.fn().mockResolvedValue(undefined)}
            onLogout={vi.fn().mockResolvedValue(undefined)}
            onSelectRoot={vi.fn()}
            onSelectThread={vi.fn()}
            onCreateThread={vi.fn().mockResolvedValue(undefined)}
            onArchiveThread={vi.fn().mockResolvedValue(undefined)}
            onAddRoot={vi.fn()}
            onRemoveRoot={vi.fn()}
          />
        </Profiler>
      </AppStoreProvider>,
    );

    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      dispatch?.({ type: "input/changed", value: "streaming" });
    });

    expect(onRender).toHaveBeenCalledTimes(1);
  });
});
