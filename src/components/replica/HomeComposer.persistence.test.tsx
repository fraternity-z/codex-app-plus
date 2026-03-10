import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function renderComposer(overrides?: Partial<ComponentProps<typeof HomeComposer>>) {
  const onSendTurn = vi.fn().mockResolvedValue(undefined);
  const onPersistComposerSelection = vi.fn().mockResolvedValue(undefined);

  render(
    <HomeComposer
      busy={false}
      inputText="妫€鏌ユ寔涔呭寲"
      models={MODELS}
      defaultModel="custom-model"
      defaultEffort="high"
      selectedRootPath="E:/code/codex-app-plus"
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel="default"
      gitController={createGitController()}
      selectedThreadId={"thread-1"}
      selectedThreadBranch={null}
      isResponding={false}
      interruptPending={false}
      onInputChange={vi.fn()}
      onSendTurn={onSendTurn}
      onPersistComposerSelection={onPersistComposerSelection}
      onSelectPermissionLevel={vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
      {...overrides}
    />
  );

  return { onSendTurn, onPersistComposerSelection };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeComposer persistence", () => {
  it("submits using the configured unknown model value", () => {
    const { onSendTurn } = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({ model: "custom-model", effort: "high" })
    }));
  });

  it("persists the final model and resolved effort together when switching models", async () => {
    const { onPersistComposerSelection } = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /选择模型/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "GPT-5.2" }));

    await waitFor(() => expect(onPersistComposerSelection).toHaveBeenCalledWith({
      model: "gpt-5.2",
      effort: "medium"
    }));
  });

  it("persists effort changes without altering the current model", async () => {
    const { onPersistComposerSelection } = renderComposer({ defaultModel: "gpt-5.4", defaultEffort: "medium" });

    fireEvent.click(screen.getByRole("button", { name: /选择思考强度/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "高" }));

    await waitFor(() => expect(onPersistComposerSelection).toHaveBeenCalledWith({
      model: "gpt-5.4",
      effort: "high"
    }));
  });

  it("rolls back to the last persisted selection when persistence fails", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onPersistComposerSelection = vi.fn().mockRejectedValue(new Error("write failed"));
    const onSendTurn = vi.fn().mockResolvedValue(undefined);

    renderComposer({ onPersistComposerSelection, onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: /选择模型/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "GPT-5.2" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(consoleSpy).toHaveBeenCalled();
    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({ model: "custom-model", effort: "high" })
    }));
  });
});
