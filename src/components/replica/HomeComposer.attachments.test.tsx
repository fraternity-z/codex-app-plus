import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../../app/composerPreferences";
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

function createGitController(): import("./git/types").WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: null,
    statusLoaded: false,
    hasRepository: false,
    error: null,
    notice: null,
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
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn(),
  };
}

function renderComposer(overrides?: Partial<ComponentProps<typeof HomeComposer>>) {
  const onSendTurn = vi.fn().mockResolvedValue(undefined);

  render(
    <HomeComposer
      busy={false}
      inputText=""
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
      onInputChange={vi.fn()}
      onSendTurn={onSendTurn}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onSelectPermissionLevel={vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
      {...overrides}
    />,
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
    fireEvent.click(screen.getByRole("menuitem", { name: /Add files and photos/i }));

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
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    openMock.mockResolvedValue(["E:/code/codex-app-plus/notes.md"]);
    const onSendTurn = vi.fn().mockRejectedValue(new Error("send failed"));
    renderComposer({ onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Add files and photos/i }));
    await waitFor(() => expect(screen.getByText("notes.md")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: "",
      attachments: [expect.objectContaining({ kind: "file", name: "notes.md", source: "mention" })],
    }));
  });
});
