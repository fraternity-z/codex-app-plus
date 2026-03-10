import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../../app/composerPermission";
import type { ComposerModelOption } from "../../app/composerPreferences";
import { HomeComposer } from "./HomeComposer";

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.2",
  label: "GPT-5.2",
  defaultEffort: "xhigh",
  supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
  isDefault: true
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
    setNewBranchName: vi.fn()
  };
}
function ComposerHarness(props: {
  readonly initialPermissionLevel: ComposerPermissionLevel;
  readonly onSendTurn: ReturnType<typeof vi.fn>;
}): JSX.Element {
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>(props.initialPermissionLevel);
  return (
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
      selectedThreadId={"thread-1"}
      selectedThreadBranch={null}
      isResponding={false}
      interruptPending={false}
      onInputChange={vi.fn()}
      onSendTurn={props.onSendTurn}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onSelectPermissionLevel={setPermissionLevel}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
    />
  );
}

describe("HomeComposer permission", () => {
  it("renders persisted permission label", () => {
    render(<ComposerHarness initialPermissionLevel="full" onSendTurn={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByRole("button", { name: /瀹屽叏璁块棶鏉冮檺/ })).toBeInTheDocument();
  });

  it("submits with the selected permission level", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    render(<ComposerHarness initialPermissionLevel="default" onSendTurn={onSendTurn} />);

    fireEvent.click(screen.getByRole("button", { name: /榛樿鏉冮檺/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /瀹屽叏璁块棶鏉冮檺/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ permissionLevel: "full" }));
  });

  it("switches back to default permission before submit", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    render(<ComposerHarness initialPermissionLevel="full" onSendTurn={onSendTurn} />);

    fireEvent.click(screen.getByRole("button", { name: /瀹屽叏璁块棶鏉冮檺/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /榛樿鏉冮檺/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ permissionLevel: "default" }));
  });
});

