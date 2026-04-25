import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../model/composerPreferences";
import { AppStoreProvider, useAppSelector } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";

const MODELS: ReadonlyArray<ComposerModelOption> = [
  {
    id: "model-1",
    value: "gpt-5.5",
    label: "gpt-5.5",
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    isDefault: true,
  },
  {
    id: "model-2",
    value: "gpt-5.3-codex",
    label: "GPT-5.3-Codex",
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    isDefault: false,
  },
];

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
  const onPersistComposerSelection = vi.fn().mockResolvedValue(undefined);

  function BannerProbe(): JSX.Element | null {
    const latestBanner = useAppSelector((state) => state.banners[0] ?? null);
    return latestBanner === null ? null : <span>{latestBanner.title}</span>;
  }

  render(
    <AppStoreProvider>
      <HomeComposer
        busy={false}
        inputText="continue analyzing composer selection"
        collaborationPreset="default"
        models={MODELS}
        defaultModel="custom-model"
        defaultEffort="high"
        selectedRootPath="E:/code/codex-app-plus"
        queuedFollowUps={[]}
        followUpQueueMode="queue"
        composerEnterBehavior="enter"
        permissionLevel="default"
        gitController={createGitController()}
        selectedThreadId="thread-1"
        selectedThreadBranch={null}
        isResponding={false}
        interruptPending={false}
        composerCommandBridge={createCommandBridge()}
        onSelectCollaborationPreset={vi.fn()}
        onInputChange={vi.fn()}
        onCreateThread={vi.fn().mockResolvedValue(undefined)}
        onSendTurn={onSendTurn}
        onPersistComposerSelection={onPersistComposerSelection}
        onSelectPermissionLevel={vi.fn()}
        onToggleDiff={vi.fn()}
        onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
        onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
        onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
        onRemoveQueuedFollowUp={vi.fn()}
        onClearQueuedFollowUps={vi.fn()}
        {...overrides}
      />
      <BannerProbe />
    </AppStoreProvider>,
    { wrapper: createI18nWrapper("en-US") },
  );

  return { onSendTurn, onPersistComposerSelection };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeComposer persistence", () => {
  it("submits using the configured unknown model value", async () => {
    const { onSendTurn } = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({ model: "custom-model", effort: "high", serviceTier: null }),
    })));
  });

  it("persists the final model and resolved effort together when switching models", async () => {
    const { onPersistComposerSelection } = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /Select model/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "gpt-5.5" }));

    await waitFor(() => expect(onPersistComposerSelection).toHaveBeenCalledWith({ model: "gpt-5.5", effort: "high", serviceTier: null }));
  });

  it("persists effort changes without altering the current model", async () => {
    const { onPersistComposerSelection } = renderComposer({ defaultModel: "gpt-5.3-codex", defaultEffort: "medium" });

    fireEvent.click(screen.getByRole("button", { name: /Select reasoning effort/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "High" }));

    await waitFor(() => expect(onPersistComposerSelection).toHaveBeenCalledWith({ model: "gpt-5.3-codex", effort: "high", serviceTier: null }));
  });

  it("rolls back to the last persisted selection when persistence fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onPersistComposerSelection = vi.fn().mockRejectedValue(new Error("write failed"));
    const onSendTurn = vi.fn().mockResolvedValue(undefined);

    renderComposer({ onPersistComposerSelection, onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: /Select model/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "gpt-5.5" }));

    await waitFor(() => expect(screen.getByText("保存 Composer 配置失败")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(consoleSpy).toHaveBeenCalled();
    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({ model: "custom-model", effort: "high", serviceTier: null }),
    })));
  });
});
