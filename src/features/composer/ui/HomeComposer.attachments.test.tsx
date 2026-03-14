import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../model/composerPreferences";
import { useAppSelector } from "../../../state/store";
import { AppStoreProvider } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";

const openMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: Array<unknown>) => openMock(...args),
}));

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.2",
  label: "GPT-5.2",
  defaultEffort: "medium",
  supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
  isDefault: true,
}];

function createGitController(): import("../../git/model/types").WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: null,
    statusLoaded: false,
    hasRepository: false,
    error: null,
    notice: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "",
    selectedBranch: "",
    newBranchName: "",
    diff: null,
    diffCache: {},
    diffTarget: null,
    loadingDiffKeys: [],
    staleDiffKeys: [],
    refresh: vi.fn().mockResolvedValue(undefined),
    initRepository: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined),
    unstagePaths: vi.fn().mockResolvedValue(undefined),
    discardPaths: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    checkoutBranch: vi.fn().mockResolvedValue(true),
    createBranchFromName: vi.fn().mockResolvedValue(true),
    checkoutSelectedBranch: vi.fn().mockResolvedValue(true),
    createBranch: vi.fn().mockResolvedValue(true),
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
    ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn(),
  };
}

function createCommandBridge(): ComposerCommandBridge {
  return {
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn().mockResolvedValue(undefined),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue({}),
  };
}

function renderComposer(overrides?: Partial<ComponentProps<typeof HomeComposer>>) {
  const onSendTurn = vi.fn().mockResolvedValue(undefined);

  function BannerProbe(): JSX.Element | null {
    const latestBanner = useAppSelector((state) => state.banners[0] ?? null);
    return latestBanner === null ? null : <span>{latestBanner.title}</span>;
  }

  render(
    <AppStoreProvider>
      <HomeComposer
        busy={false}
        inputText=""
        collaborationPreset="default"
        models={MODELS}
        defaultModel="gpt-5.2"
        defaultEffort="medium"
        selectedRootPath="E:/code/codex-app-plus"
        queuedFollowUps={[]}
        followUpQueueMode="queue"
        composerEnterBehavior="enter"
        permissionLevel="default"
        gitController={createGitController()}
        selectedThreadId={null}
        selectedThreadBranch={null}
        isResponding={false}
        interruptPending={false}
        composerCommandBridge={createCommandBridge()}
        onSelectCollaborationPreset={vi.fn()}
        onInputChange={vi.fn()}
        onCreateThread={vi.fn().mockResolvedValue(undefined)}
        onSendTurn={onSendTurn}
        onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
        onSelectPermissionLevel={vi.fn()}
        onToggleDiff={vi.fn()}
        onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
        onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
        onRemoveQueuedFollowUp={vi.fn()}
        onClearQueuedFollowUps={vi.fn()}
        {...overrides}
      />
      <BannerProbe />
    </AppStoreProvider>,
  );

  return { onSendTurn };
}

beforeEach(() => {
  openMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeComposer attachments", () => {
  it("opens the official file picker and shows selected clips", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/image.png", "E:/code/codex-app-plus/notes.md"]);
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));

    await waitFor(() => expect(openMock).toHaveBeenCalledWith({ title: "Add files and photos", multiple: true }));
    expect(screen.getByText("image.png")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("handles pasted images as clips without injecting base64 text", async () => {
    const fileReader = {
      result: null as string | null,
      error: null,
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      readAsDataURL() {
        this.result = "data:image/png;base64,aGVsbG8=";
        this.onload?.();
      },
    };
    vi.stubGlobal("FileReader", vi.fn(() => fileReader));
    renderComposer();

    const textarea = screen.getByPlaceholderText("Describe the task, ask a question, or queue a follow-up");
    const file = new File(["hello"], "clipboard.png", { type: "image/png" });
    const pasteEvent = createEvent.paste(textarea);
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: { items: [{ type: "image/png", getAsFile: () => file }] },
    });

    fireEvent(textarea, pasteEvent);

    await waitFor(() => expect(screen.getByText("clipboard.png")).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps clips when send fails and surfaces the error", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/notes.md"]);
    const onSendTurn = vi.fn().mockRejectedValue(new Error("send failed"));
    renderComposer({ onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));
    await waitFor(() => expect(screen.getByText("notes.md")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("发送消息失败")).toBeInTheDocument());
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: "",
      attachments: [expect.objectContaining({ kind: "file", name: "notes.md", source: "mention" })],
    }));
  });

  it("shows and toggles multi-agent when available", async () => {
    const onSetMultiAgentEnabled = vi.fn().mockResolvedValue(undefined);
    renderComposer({ multiAgentAvailable: true, multiAgentEnabled: false, onSetMultiAgentEnabled });

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Toggle multi-agent" }));

    await waitFor(() => expect(onSetMultiAgentEnabled).toHaveBeenCalledWith(true));
  });

  it("disables multi-agent while a turn is responding", async () => {
    renderComposer({ multiAgentAvailable: true, multiAgentEnabled: false, isResponding: true });

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));

    expect(await screen.findByRole("switch", { name: "Toggle multi-agent" })).toBeDisabled();
  });

  it("shows a reload overlay and blocks composer interactions while multi-agent is reloading", async () => {
    const resolveToggleRef: { current: null | (() => void) } = { current: null };
    const onSetMultiAgentEnabled = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveToggleRef.current = resolve;
      })
    );
    renderComposer({ multiAgentAvailable: true, multiAgentEnabled: false, onSetMultiAgentEnabled });

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Toggle multi-agent" }));

    await waitFor(() => expect(onSetMultiAgentEnabled).toHaveBeenCalledWith(true));
    expect(screen.getByText("正在重载 Codex…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Describe the task, ask a question, or queue a follow-up")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    resolveToggleRef.current?.();
    await waitFor(() => expect(screen.queryByText("正在重载 Codex…")).toBeNull());
  });
});
