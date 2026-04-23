import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../model/composerPreferences";
import { useAppSelector } from "../../../state/store";
import { AppStoreProvider } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";
import { createI18nWrapper } from "../../../test/createI18nWrapper";

const openMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: Array<unknown>) => openMock(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.5",
  label: "gpt-5.5",
  defaultEffort: "high",
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
    commitDialogOpen: false,
    commitDialogError: null,
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
    openCommitDialog: vi.fn(),
    closeCommitDialog: vi.fn(),
    checkoutBranch: vi.fn().mockResolvedValue(true),
    deleteBranch: vi.fn().mockResolvedValue(true),
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
  const {
    inputText: initialInputText = "",
    onInputChange: _ignoredOnInputChange,
    ...composerOverrides
  } = overrides ?? {};

  function ComposerHarness(): JSX.Element {
    const [inputText, setInputText] = useState(initialInputText);

    return (
      <HomeComposer
        busy={false}
        collaborationPreset="default"
        models={MODELS}
        defaultModel="gpt-5.5"
        defaultEffort="high"
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
        onCreateThread={vi.fn().mockResolvedValue(undefined)}
        onSendTurn={onSendTurn}
        onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
        onSelectPermissionLevel={vi.fn()}
        onToggleDiff={vi.fn()}
        onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
        onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
        onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
        onRemoveQueuedFollowUp={vi.fn()}
        onClearQueuedFollowUps={vi.fn()}
        {...composerOverrides}
        inputText={inputText}
        onInputChange={setInputText}
      />
    );
  }

  function BannerProbe(): JSX.Element | null {
    const latestBanner = useAppSelector((state) => state.banners[0] ?? null);
    return latestBanner === null ? null : <span>{latestBanner.title}</span>;
  }

  render(
    <AppStoreProvider>
      <ComposerHarness />
      <BannerProbe />
    </AppStoreProvider>,
    { wrapper: createI18nWrapper("en-US") },
  );

  return { onSendTurn };
}

beforeEach(() => {
  openMock.mockReset();
  vi.mocked(convertFileSrc).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeComposer attachments", () => {
  it("keeps image clips and shows picked files as chips while keeping the textarea clean", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/image.png", "E:/code/codex-app-plus/notes.md"]);
    renderComposer();
    const textarea = screen.getByPlaceholderText("Describe the task, ask a question, or queue a follow-up");

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));

    await waitFor(() => expect(openMock).toHaveBeenCalledWith({ title: "Add files and photos", multiple: true }));
    expect(screen.getByText("image.png")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("shows image chips with tiny thumbnails and closes preview via backdrop or Escape", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/image.png"]);
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));

    const clipTrigger = await screen.findByRole("button", { name: "Generated image preview" });
    const thumb = screen.getByRole("img", { name: "Generated image" });

    expect(thumb).toHaveAttribute("src", "asset://E:/code/codex-app-plus/image.png");
    expect(convertFileSrc).toHaveBeenCalledWith("E:/code/codex-app-plus/image.png");

    fireEvent.click(clipTrigger);
    expect(screen.getByRole("dialog", { name: "Generated image preview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog", { name: "Generated image preview" })).toBeNull();

    fireEvent.click(clipTrigger);
    expect(screen.getByRole("dialog", { name: "Generated image preview" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Generated image preview" })).toBeNull();
  });

  it("renders non-image chips without thumbnail preview trigger", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/notes.md"]);
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));

    await waitFor(() => expect(screen.getByText("notes.md")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Generated image preview" })).toBeNull();
    expect(convertFileSrc).not.toHaveBeenCalled();
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

  it("keeps managed file chips when send fails and preserves them for retry", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/notes.md"]);
    const onSendTurn = vi.fn().mockRejectedValue(new Error("send failed"));
    renderComposer({ onSendTurn });
    const textarea = screen.getByPlaceholderText("Describe the task, ask a question, or queue a follow-up");

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));
    await waitFor(() => expect(screen.getByText("notes.md")).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("Failed to send message")).toBeInTheDocument());
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.any(String),
      attachments: [],
    }));
  });

  it("keeps the send action active while responding when managed file chips are present", async () => {
    openMock.mockResolvedValue(["E:/code/codex-app-plus/notes.md"]);
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const onInterruptTurn = vi.fn().mockResolvedValue(undefined);
    renderComposer({ inputText: "", isResponding: true, onSendTurn, onInterruptTurn });
    const textarea = screen.getByPlaceholderText("Describe the task, ask a question, or queue a follow-up");

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Add files and photos/i }));
    await waitFor(() => expect(screen.getByText("notes.md")).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.any(String),
      attachments: [],
    })));
    expect(onInterruptTurn).not.toHaveBeenCalled();
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
    expect(screen.getByText("Reloading Codex...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Describe the task, ask a question, or queue a follow-up")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    resolveToggleRef.current?.();
    await waitFor(() => expect(screen.queryByText("Reloading Codex...")).toBeNull());
  });
});
