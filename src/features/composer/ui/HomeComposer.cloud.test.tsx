import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { WorkspaceGitController } from "../../git/model/types";
import { AppStoreProvider } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY, CODEX_WEB_URL } from "../model/composerCloudHandoff";
import { HomeComposer } from "./HomeComposer";
import { createI18nWrapper } from "../../../test/createI18nWrapper";

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.5",
  label: "gpt-5.5",
  defaultEffort: "high",
  supportedEfforts: ["low", "medium", "high", "xhigh"],
  isDefault: true,
}];

function createGitController(): WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: {
      isRepository: true,
      repoRoot: "E:/code/codex-app-plus",
      branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
      remoteName: "origin",
      remoteUrl: "https://example.com/repo.git",
      branches: [
        { name: "main", upstream: "origin/main", isCurrent: true },
        { name: "feature/cloud", upstream: null, isCurrent: false },
      ],
      staged: [],
      unstaged: [],
      untracked: [],
      conflicted: [],
      isClean: true,
    },
    statusLoaded: true,
    hasRepository: true,
    error: null,
    notice: null,
    commitDialogOpen: false,
    commitDialogError: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "",
    commitInstructions: "",
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

function ComposerHarness(props: {
  readonly initialInputText?: string;
  readonly onOpenCodexWeb?: ReturnType<typeof vi.fn>;
  readonly request?: ReturnType<typeof vi.fn>;
}): JSX.Element {
  const [inputText, setInputText] = useState(props.initialInputText ?? "");
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>("default");
  const composerCommandBridge = useMemo<ComposerCommandBridge>(() => ({
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn().mockResolvedValue(undefined),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: props.request ?? vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
  }), [props.request]);

  return (
    <HomeComposer
      appServerReady={true}
      busy={false}
      inputText={inputText}
      collaborationPreset="default"
      models={MODELS}
      defaultModel="gpt-5.5"
      defaultEffort="high"
      selectedRootPath="E:/code/codex-app-plus"
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel={permissionLevel}
      gitController={createGitController()}
      selectedThreadId="thread-1"
      selectedThreadBranch="feature/cloud"
      isResponding={false}
      interruptPending={false}
      composerCommandBridge={composerCommandBridge}
      onSelectCollaborationPreset={vi.fn()}
      onInputChange={setInputText}
      onCreateThread={vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onSelectPermissionLevel={setPermissionLevel}
      onOpenCodexWeb={props.onOpenCodexWeb}
      onToggleDiff={vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
    />
  );
}

function renderHarness(props?: Parameters<typeof ComposerHarness>[0]) {
  return render(<AppStoreProvider><ComposerHarness {...props} /></AppStoreProvider>, { wrapper: createI18nWrapper("en-US") });
}

afterEach(() => {
  localStorage.removeItem(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HomeComposer cloud handoff", () => {
  it("links Codex Web and stores the Codex Cloud environment id", async () => {
    const onOpenCodexWeb = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "prompt").mockReturnValue(" env_linked ");
    renderHarness({ onOpenCodexWeb });

    fireEvent.click(screen.getByRole("button", { name: /Local/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Link Codex Web" }));

    await waitFor(() => expect(onOpenCodexWeb).toHaveBeenCalled());
    expect(localStorage.getItem(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY)).toBe("env_linked");
  });

  it("sends the draft to Codex Cloud through the official command exec protocol", async () => {
    const request = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "Task submitted: https://chatgpt.com/codex/tasks/1\n", stderr: "" });
    vi.spyOn(window, "prompt").mockReturnValue("env_123");
    renderHarness({ initialInputText: "Implement cloud handoff", request });

    fireEvent.click(screen.getByRole("button", { name: /Local/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to cloud" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("command/exec", {
      command: [
        "codex",
        "cloud",
        "exec",
        "--env",
        "env_123",
        "--branch",
        "feature/cloud",
        "Implement cloud handoff",
      ],
      cwd: "E:/code/codex-app-plus",
      timeoutMs: 120000,
      sandboxPolicy: { type: "dangerFullAccess" },
    }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("falls back to opening the official Codex Web URL when no host opener is supplied", async () => {
    const open = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue(null);
    vi.stubGlobal("open", open);
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: /Local/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Link Codex Web" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith(CODEX_WEB_URL, "_blank", "noopener,noreferrer"));
  });
});
