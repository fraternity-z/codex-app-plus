import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import { AppStoreProvider, useAppStore } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";

const MODELS: ReadonlyArray<ComposerModelOption> = [
  { id: "model-1", value: "gpt-5.2", label: "GPT-5.2", defaultEffort: "medium", supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"], isDefault: true },
  { id: "model-2", value: "gpt-5.4", label: "gpt-5.4", defaultEffort: "high", supportedEfforts: ["low", "medium", "high", "xhigh"], isDefault: false },
];

function createGitController(): import("../../git/model/types").WorkspaceGitController {
  return {
    loading: false, pendingAction: null, status: null, statusLoaded: false, hasRepository: false, error: null, notice: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "", selectedBranch: "", newBranchName: "", diff: null, diffCache: {}, diffTarget: null, loadingDiffKeys: [], staleDiffKeys: [],
    refresh: vi.fn().mockResolvedValue(undefined), initRepository: vi.fn().mockResolvedValue(undefined), fetch: vi.fn().mockResolvedValue(undefined), pull: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined), unstagePaths: vi.fn().mockResolvedValue(undefined), discardPaths: vi.fn().mockResolvedValue(undefined), commit: vi.fn().mockResolvedValue(undefined),
    checkoutBranch: vi.fn().mockResolvedValue(true), createBranchFromName: vi.fn().mockResolvedValue(true), checkoutSelectedBranch: vi.fn().mockResolvedValue(true), createBranch: vi.fn().mockResolvedValue(true),
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
    ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
    ensureDiff: vi.fn().mockResolvedValue(undefined), selectDiff: vi.fn().mockResolvedValue(undefined), clearDiff: vi.fn(), setCommitMessage: vi.fn(), setSelectedBranch: vi.fn(), setNewBranchName: vi.fn(),
  };
}

function ComposerHarness(props: {
  readonly selectedRootPath?: string | null;
  readonly onCreateThread?: ReturnType<typeof vi.fn>;
  readonly onToggleDiff?: ReturnType<typeof vi.fn>;
  readonly onSelectCollaborationPreset?: ReturnType<typeof vi.fn>;
  readonly request?: ReturnType<typeof vi.fn>;
}): JSX.Element {
  const { dispatch } = useAppStore();
  const [inputText, setInputText] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>("default");
  const composerCommandBridge = useMemo<ComposerCommandBridge>(() => ({
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn(async ({ sessionId, query }) => {
      dispatch({ type: "fuzzySearch/updated", sessionId, query, files: [{ root: "E:/code/codex-app-plus", path: "src/App.tsx", file_name: "App.tsx", score: 1, indices: null }] });
    }),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: props.request ?? vi.fn().mockResolvedValue({}),
  }), [dispatch, props.request]);

  return (
    <HomeComposer
      busy={false}
      inputText={inputText}
      collaborationPreset="default"
      models={MODELS}
      defaultModel="gpt-5.2"
      defaultEffort="medium"
      selectedRootPath={props.selectedRootPath === undefined ? "E:/code/codex-app-plus" : props.selectedRootPath}
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel={permissionLevel}
      gitController={createGitController()}
      selectedThreadId="thread-1"
      selectedThreadBranch={null}
      isResponding={false}
      interruptPending={false}
      composerCommandBridge={composerCommandBridge}
      onSelectCollaborationPreset={props.onSelectCollaborationPreset ?? vi.fn()}
      onInputChange={setInputText}
      onCreateThread={props.onCreateThread ?? vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onSelectPermissionLevel={setPermissionLevel}
      onToggleDiff={props.onToggleDiff ?? vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
    />
  );
}

function renderHarness(props?: Parameters<typeof ComposerHarness>[0]) {
  return render(<AppStoreProvider><ComposerHarness {...props} /></AppStoreProvider>);
}

describe("HomeComposer commands", () => {
  it("executes /new immediately", async () => {
    const onCreateThread = vi.fn().mockResolvedValue(undefined);
    renderHarness({ onCreateThread });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/new", selectionStart: 4 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onCreateThread).toHaveBeenCalled());
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /clear immediately", async () => {
    const onCreateThread = vi.fn().mockResolvedValue(undefined);
    renderHarness({ onCreateThread });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/clear", selectionStart: 6 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onCreateThread).toHaveBeenCalled());
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /diff immediately", async () => {
    const onToggleDiff = vi.fn();
    renderHarness({ onToggleDiff });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/diff", selectionStart: 5 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onToggleDiff).toHaveBeenCalled());
  });

  it("opens the permissions picker from /approvals", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/approvals", selectionStart: 10 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("menu", { name: "Choose permissions" })).toBeInTheDocument());
  });

  it("executes /rename with inline arguments through the official request path", async () => {
    const request = vi.fn().mockResolvedValue({});
    renderHarness({ request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/rename slash command rollout", selectionStart: 29 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(request).toHaveBeenCalledWith("thread/name/set", {
      threadId: "thread-1",
      name: "slash command rollout",
    }));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("switches the composer preset when /plan is executed", async () => {
    const onSelectCollaborationPreset = vi.fn();
    renderHarness({ onSelectCollaborationPreset });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/plan", selectionStart: 5 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onSelectCollaborationPreset).toHaveBeenCalledWith("plan"));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("opens mention results from @ and adds a chip", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "@app", selectionStart: 4 } });

    await waitFor(() => expect(screen.getByRole("menu", { name: "Mention file" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("menuitem", { name: /App.tsx/ }));

    await waitFor(() => expect(screen.getByText("App.tsx")).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("shows an explicit error when @ is used without a workspace", async () => {
    renderHarness({ selectedRootPath: null });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "@app", selectionStart: 4 } });

    await waitFor(() => expect(screen.getAllByText("请先选择工作区后再使用 @ 文件提及。").length).toBeGreaterThan(0));
  });
});
