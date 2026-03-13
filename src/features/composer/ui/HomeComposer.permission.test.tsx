import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import { AppStoreProvider } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";
import { permissionLabel } from "./ComposerFooterPopovers";

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.2",
  label: "GPT-5.2",
  defaultEffort: "xhigh",
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
  };
}

function ComposerHarness(props: {
  readonly initialPermissionLevel: ComposerPermissionLevel;
  readonly onSendTurn: ReturnType<typeof vi.fn>;
}): JSX.Element {
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>(props.initialPermissionLevel);

  return (
    <AppStoreProvider>
      <HomeComposer
        busy={false}
        inputText="检查权限链路"
        models={MODELS}
        defaultModel="gpt-5.2"
        defaultEffort="xhigh"
        selectedRootPath="E:/code/FPGA"
        queuedFollowUps={[]}
        followUpQueueMode="queue"
        composerEnterBehavior="enter"
        permissionLevel={permissionLevel}
        gitController={createGitController()}
        selectedThreadId="thread-1"
        selectedThreadBranch={null}
        isResponding={false}
        interruptPending={false}
        composerCommandBridge={createCommandBridge()}
        onInputChange={vi.fn()}
        onCreateThread={vi.fn().mockResolvedValue(undefined)}
        onSendTurn={props.onSendTurn}
        onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
        onSelectPermissionLevel={setPermissionLevel}
        onToggleDiff={vi.fn()}
        onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
        onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
        onRemoveQueuedFollowUp={vi.fn()}
        onClearQueuedFollowUps={vi.fn()}
      />
    </AppStoreProvider>
  );
}

describe("HomeComposer permission", () => {
  it("renders persisted permission label", () => {
    render(<ComposerHarness initialPermissionLevel="full" onSendTurn={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByRole("button", { name: permissionLabel("full") })).toBeInTheDocument();
  });

  it("submits with the selected permission level", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    render(<ComposerHarness initialPermissionLevel="default" onSendTurn={onSendTurn} />);

    fireEvent.click(screen.getByRole("button", { name: permissionLabel("default") }));
    fireEvent.click(screen.getByRole("menuitem", { name: permissionLabel("full") }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ permissionLevel: "full" })));
  });

  it("switches back to default permission before submit", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    render(<ComposerHarness initialPermissionLevel="full" onSendTurn={onSendTurn} />);

    fireEvent.click(screen.getByRole("button", { name: permissionLabel("full") }));
    fireEvent.click(screen.getByRole("menuitem", { name: permissionLabel("default") }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ permissionLevel: "default" })));
  });
});
