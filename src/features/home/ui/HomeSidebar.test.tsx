import { Profiler, useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { AppStoreApi } from "../../../state/store";
import { AppStoreProvider, useAppDispatch } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
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
    forkedFromId: null,
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
    startedAt: 1,
    completedAt: 2,
    durationMs: 1000,
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
  readonly onOpenSkills?: () => void;
  readonly onCreateThread?: () => Promise<void>;
  readonly onRemoveRoot?: (rootId: string) => void;
  readonly deleteCodexSession?: ReturnType<typeof vi.fn>;
  readonly openWorkspace?: ReturnType<typeof vi.fn>;
  readonly searchCodexSessions?: ReturnType<typeof vi.fn>;
  readonly request?: ReturnType<typeof vi.fn>;
  readonly initializeStore?: (dispatch: AppStoreApi["dispatch"]) => void;
  readonly codexSessionsError?: string | null;
  readonly renderMainContainer?: boolean;
}) {
  const onArchiveThread = options?.onArchiveThread ?? vi.fn().mockResolvedValue(undefined);
  const onCreateThread = options?.onCreateThread ?? vi.fn().mockResolvedValue(undefined);
  const onOpenSkills = options?.onOpenSkills ?? vi.fn();
  const deleteCodexSession = options?.deleteCodexSession ?? vi.fn().mockResolvedValue(undefined);
  const openWorkspace = options?.openWorkspace ?? vi.fn().mockResolvedValue(undefined);
  const searchCodexSessions = options?.searchCodexSessions ?? vi.fn().mockResolvedValue([]);
  const request = options?.request ?? vi.fn().mockResolvedValue({});
  const appServerClient = { request } as AppServerClient;
  const hostBridge = { app: { deleteCodexSession, openWorkspace, searchCodexSessions }, rpc: { request } } as unknown as HostBridge;

  function Harness(): JSX.Element {
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(thread.id);

    return (
      <AppStoreProvider>
        {options?.initializeStore ? <DispatchRecorder onReady={options.initializeStore} /> : null}
        <div data-testid="selected-thread">{selectedThreadId ?? "none"}</div>
        <HomeSidebar
          appServerClient={appServerClient}
          agentEnvironment="windowsNative"
          hostBridge={hostBridge}
          roots={[ROOT]}
          codexSessions={[thread]}
          codexSessionsError={options?.codexSessionsError ?? null}
          selectedRootId={ROOT.id}
          selectedThreadId={selectedThreadId}
          authStatus="authenticated"
          authMode="apikey"
          authBusy={false}
          authLoginPending={false}
          rateLimits={null}
          account={null}
          settingsMenuOpen={false}
          collapsed={false}
          onToggleSettingsMenu={vi.fn()}
          onDismissSettingsMenu={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenSkills={onOpenSkills}
          onLogin={vi.fn().mockResolvedValue(undefined)}
          onLogout={vi.fn().mockResolvedValue(undefined)}
          onSelectRoot={vi.fn()}
          onSelectThread={setSelectedThreadId}
          onCreateThread={onCreateThread}
          onArchiveThread={onArchiveThread}
          onAddRoot={vi.fn()}
          onRemoveRoot={options?.onRemoveRoot ?? vi.fn()}
        />
        {options?.renderMainContainer ? <main className="replica-main" data-testid="main-content" /> : null}
      </AppStoreProvider>
    );
  }

  render(<Harness />, { wrapper: createI18nWrapper() });
  return { onArchiveThread, onCreateThread, onOpenSkills, deleteCodexSession, openWorkspace, searchCodexSessions, request };
}

function DispatchRecorder(props: { readonly onReady: (dispatch: AppStoreApi["dispatch"]) => void }): null {
  const dispatch = useAppDispatch();

  useEffect(() => {
    props.onReady(dispatch);
  }, [dispatch, props]);

  return null;
}

describe("HomeSidebar", () => {
  it("does not render a startup loading overlay in the sidebar", () => {
    renderSidebar(createThread("codexData"));

    expect(screen.queryByRole("status", { name: "正在加载会话" })).not.toBeInTheDocument();
    expect(document.querySelector(".replica-sidebar")).not.toHaveAttribute("aria-busy");
  });

  it("opens the plugins screen from the sidebar nav", () => {
    const { onOpenSkills } = renderSidebar(createThread("codexData"));

    fireEvent.click(screen.getByRole("button", { name: "插件" }));

    expect(onOpenSkills).toHaveBeenCalledTimes(1);
  });

  it("opens the session search dialog from the sidebar nav", () => {
    renderSidebar(createThread("codexData"));

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.getByRole("dialog", { name: "搜索会话" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索会话内容")).toBeInTheDocument();
  });

  it("mounts the session search dialog inside the main content area when available", () => {
    renderSidebar(createThread("codexData"), { renderMainContainer: true });

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    const mainContent = screen.getByTestId("main-content");
    const backdrop = mainContent.querySelector(".sidebar-search-backdrop-main");

    expect(backdrop).not.toBeNull();
    expect(backdrop).toContainElement(screen.getByRole("dialog", { name: "搜索会话" }));
  });

  it("searches session content and selects the matching thread", async () => {
    const thread = createThread("codexData");
    const { searchCodexSessions } = renderSidebar(thread, {
      searchCodexSessions: vi.fn().mockResolvedValue([{
        id: thread.id,
        title: thread.title,
        cwd: thread.cwd,
        updatedAt: thread.updatedAt,
        agentEnvironment: "windowsNative",
        matches: [{
          lineText: "wode keyword in full session body",
          lineNumber: 12,
          startColumn: 1,
          endColumn: 5,
        }],
      }]),
    });

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.change(screen.getByPlaceholderText("搜索会话内容"), { target: { value: "wode" } });

    await waitFor(() => expect(searchCodexSessions).toHaveBeenCalledWith({
      agentEnvironment: "windowsNative",
      query: "wode",
      limit: 20,
    }));

    fireEvent.click(await screen.findByRole("button", { name: /线程 codexData/ }));

    await waitFor(() => expect(screen.getByTestId("selected-thread")).toHaveTextContent(thread.id));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "搜索会话" })).not.toBeInTheDocument());
  });

  it("does not render the automation nav item", () => {
    renderSidebar(createThread("codexData"));

    expect(screen.queryByRole("button", { name: "自动化" })).not.toBeInTheDocument();
  });

  it("forwards the workspace row new thread button", async () => {
    const { onCreateThread } = renderSidebar(createThread("codexData"));

    fireEvent.click(screen.getByRole("button", { name: "在工作区 FPGA 中创建新会话" }));

    await waitFor(() => expect(onCreateThread).toHaveBeenCalledTimes(1));
  });

  it("forwards workspace removal through the more menu", async () => {
    const onRemoveRoot = vi.fn();
    renderSidebar(createThread("codexData"), { onRemoveRoot });

    fireEvent.click(screen.getByRole("button", { name: "工作区更多操作 FPGA" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "从列表中移除" }));

    await waitFor(() => expect(onRemoveRoot).toHaveBeenCalledWith(ROOT.id));
  });

  it("opens a workspace root in File Explorer through the folder menu", async () => {
    const { openWorkspace } = renderSidebar(createThread("codexData"));

    fireEvent.contextMenu(screen.getByText("FPGA").closest(".workspace-root-row") as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: "在资源管理器中打开" }));

    await waitFor(() => expect(openWorkspace).toHaveBeenCalledWith({
      path: ROOT.path,
      opener: "explorer",
    }));
  });

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
    const request = vi.fn(async (method: string, params: unknown) => {
      if (method === "turn/interrupt") {
        return { requestId: `interrupt-${String((params as { threadId: string }).threadId)}`, result: {} };
      }
      if (method === "thread/backgroundTerminals/clean") {
        return { requestId: `clean-${String((params as { threadId: string }).threadId)}`, result: {} };
      }
      if (method === "thread/unsubscribe") {
        return { status: "unsubscribed" };
      }
      throw new Error(`unexpected method: ${method}`);
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
            turns: [createRunningCollabTurn("thread-rpc", ["thread-child"]), { id: "turn-1", status: "inProgress" as const, error: null, items: [], startedAt: 1, completedAt: null, durationMs: null }],
          }), { resumeState: "resumed" })
        });
        dispatch({
          type: "conversation/upserted",
          conversation: createConversationFromThread(createRuntimeThread({
            id: "thread-child",
            source: createSubAgentSource("thread-rpc"),
            status: { type: "active" as const, activeFlags: [] },
            turns: [{ id: "turn-1", status: "inProgress" as const, error: null, items: [], startedAt: 1, completedAt: null, durationMs: null }],
          }), { resumeState: "resumed" })
        });
      },
    });

    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /线程 rpc/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("turn/interrupt", { threadId: "thread-child", turnId: "turn-1" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("thread/unsubscribe", { threadId: "thread-rpc" }));
    await waitFor(() => expect(deleteCodexSession).toHaveBeenCalledWith({ threadId: thread.id, agentEnvironment: "windowsNative" }));
    const childUnsubscribeCall = request.mock.calls.findIndex(([method, params]) => method === "thread/unsubscribe" && readThreadId(params) === "thread-child");
    const rootUnsubscribeCall = request.mock.calls.findIndex(([method, params]) => method === "thread/unsubscribe" && readThreadId(params) === "thread-rpc");
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
            appServerClient={{ request: vi.fn() } as AppServerClient}
            agentEnvironment="windowsNative"
            hostBridge={{ app: { deleteCodexSession: vi.fn().mockResolvedValue(undefined), searchCodexSessions: vi.fn().mockResolvedValue([]) }, rpc: { request: vi.fn() } } as unknown as HostBridge}
            roots={[ROOT]}
            codexSessions={[thread]}
            codexSessionsError={null}
            selectedRootId={ROOT.id}
            selectedThreadId={thread.id}
            authStatus="authenticated"
            authMode="apikey"
            authBusy={false}
            authLoginPending={false}
            rateLimits={null}
            account={null}
            settingsMenuOpen={false}
            collapsed={false}
            onToggleSettingsMenu={vi.fn()}
            onDismissSettingsMenu={vi.fn()}
            onOpenSettings={vi.fn()}
            onOpenSkills={vi.fn()}
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
      { wrapper: createI18nWrapper() },
    );

    const initialRenderCount = onRender.mock.calls.length;
    expect(initialRenderCount).toBeGreaterThan(0);

    act(() => {
      dispatch?.({ type: "input/changed", value: "streaming" });
    });

    expect(onRender).toHaveBeenCalledTimes(initialRenderCount);
  });
});
