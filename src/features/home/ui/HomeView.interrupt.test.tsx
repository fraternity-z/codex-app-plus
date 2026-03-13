import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../../composer/model/composerPreferences";
import type { HostBridge } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import { AppStoreProvider } from "../../../state/store";
import type { WorkspaceGitController } from "../../git/model/types";
import { HomeView } from "./HomeView";

const { mockedUseWorkspaceGit } = vi.hoisted(() => ({ mockedUseWorkspaceGit: vi.fn() }));

vi.mock("../../terminal/ui/TerminalPanel", () => ({ TerminalPanel: () => null }));
vi.mock("../../git/hooks/useWorkspaceGit", () => ({ useWorkspaceGit: mockedUseWorkspaceGit }));

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.2",
  label: "GPT-5.2",
  defaultEffort: "xhigh",
  supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
  isDefault: true
}];

function createController(): WorkspaceGitController {
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

function createThread(overrides?: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-1",
    title: "Active thread",
    branch: null,
    cwd: "E:/code/FPGA",
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "active",
    activeFlags: [],
    queuedCount: 0,
    ...overrides
  };
}

function renderHomeView(overrides?: Partial<ComponentProps<typeof HomeView>>) {
  mockedUseWorkspaceGit.mockReturnValue(createController());
  const root = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };
  const thread = createThread();

  return render(
    <AppStoreProvider><HomeView
      hostBridge={{} as HostBridge}
      busy={false}
      inputText="继续分析"
      roots={[root]}
      selectedRootId={root.id}
      selectedRootName={root.name}
      selectedRootPath={root.path}
      threads={[thread]}
      selectedThread={thread}
      selectedThreadId={thread.id}
      activeTurnId="turn-1"
      isResponding={true}
      interruptPending={false}
      activities={[]}
      banners={[]}
      account={null}
      rateLimitSummary={null}
      queuedFollowUps={[]}
      draftActive={false}
      selectedConversationLoading={false}
      models={MODELS}
      defaultModel="gpt-5.2"
      defaultEffort="xhigh"
      workspaceOpener="vscode"
      embeddedTerminalShell="powerShell"
      threadDetailLevel="commands"
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      composerPermissionLevel="default"
      connectionStatus="connected"
      fatalError={null}
      authStatus="authenticated"
      authMode="chatgpt"
      authBusy={false}
      authLoginPending={false}
      retryScheduledAt={null}
      settingsMenuOpen={false}
      onToggleSettingsMenu={vi.fn()}
      onDismissSettingsMenu={vi.fn()}
      onOpenSettings={vi.fn()}
      onSelectWorkspaceOpener={vi.fn()}
      onSelectComposerPermissionLevel={vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onSelectRoot={vi.fn()}
      onSelectThread={vi.fn()}
      onInputChange={vi.fn()}
      onCreateThread={vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onAddRoot={vi.fn()}
      onRemoveRoot={vi.fn()}
      onRetryConnection={vi.fn().mockResolvedValue(undefined)}
      onLogin={vi.fn().mockResolvedValue(undefined)}
      onLogout={vi.fn().mockResolvedValue(undefined)}
      onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
      {...overrides}
    /></AppStoreProvider>
  );
}

describe("HomeView interrupt composer", () => {
  it("shows the pause button and interrupts on click", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const onInterruptTurn = vi.fn().mockResolvedValue(undefined);

    renderHomeView({ onSendTurn, onInterruptTurn });
    fireEvent.click(screen.getByRole("button", { name: "Pause response" }));

    expect(onInterruptTurn).toHaveBeenCalledTimes(1);
    expect(onSendTurn).not.toHaveBeenCalled();
  });

  it("interrupts from Enter instead of sending while responding", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const onInterruptTurn = vi.fn().mockResolvedValue(undefined);

    renderHomeView({ onSendTurn, onInterruptTurn });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onInterruptTurn).toHaveBeenCalledTimes(1);
    expect(onSendTurn).not.toHaveBeenCalled();
  });

  it("keeps the pause button disabled after an interrupt is already pending", () => {
    renderHomeView({ interruptPending: true });
    expect(screen.getByRole("button", { name: "Pause response" })).toBeDisabled();
  });
});
