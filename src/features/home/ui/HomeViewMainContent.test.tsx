import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import type { ThreadSummary, WorkspaceSwitchState } from "../../../domain/types";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { WorkspaceGitController } from "../../git/model/types";
import { HomeViewMainContent } from "./HomeViewMainContent";

vi.mock("../../../state/store", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: { readonly inputText: string; readonly banners: readonly unknown[] }) => unknown) => (
    selector({ inputText: "", banners: [] })
  ),
}));

vi.mock("../../conversation/hooks/useFileLinkOpener", () => ({
  useFileLinkOpener: () => ({ openFileLink: vi.fn() }),
}));

vi.mock("../../conversation/ui/HomeConversationCanvas", () => ({
  HomeConversationCanvas: () => <div data-testid="conversation-canvas">conversation</div>,
}));

vi.mock("../../conversation/ui/HomeTurnPlanDrawer", () => ({
  HomeTurnPlanDrawer: (props: { readonly onOpenDiff?: () => void; readonly showProgress?: boolean; readonly visible: boolean }) => (
    props.visible ? (
      <button type="button" data-show-progress={String(props.showProgress ?? true)} data-testid="plan-drawer" onClick={props.onOpenDiff}>
        plan drawer
      </button>
    ) : null
  ),
}));

vi.mock("../../conversation/ui/HomeUserInputPrompt", () => ({
  HomeUserInputPrompt: () => <div data-testid="user-input-prompt">user input prompt</div>,
}));

vi.mock("../../composer/ui/HomeComposer", () => ({
  HomeComposer: (props: { readonly goalStatusBar?: ReactNode }) => (
    <div data-testid="home-composer">
      {props.goalStatusBar}
      <div data-testid="composer-card">composer</div>
    </div>
  ),
}));

vi.mock("../../composer/ui/HomePlanRequestComposer", () => ({
  HomePlanRequestComposer: () => <div data-testid="plan-request-composer">plan request</div>,
}));

vi.mock("../../composer/service/composerCommandBridge", () => ({
  createComposerCommandBridge: () => ({}),
}));

vi.mock("../../git/ui/GitCommitDialog", () => ({
  GitCommitDialog: () => null,
}));

vi.mock("../../git/ui/WorkspaceDiffConversationPreview", () => ({
  WorkspaceDiffConversationPreview: () => <div data-testid="diff-preview">diff preview</div>,
}));

vi.mock("../../preview/ui/QuickPreviewPanel", () => ({
  QuickPreviewPanel: (props: { readonly target: { readonly name: string } }) => (
    <div data-testid="quick-preview">quick preview {props.target.name}</div>
  ),
}));

vi.mock("../../workspace/ui/WorkspaceFileViewer", () => ({
  WorkspaceFileViewer: (props: { readonly path: string }) => (
    <div data-testid="file-viewer">file viewer {props.path}</div>
  ),
}));

vi.mock("./HomeMainToolbar", () => ({
  HomeMainToolbar: () => <div data-testid="home-toolbar">toolbar</div>,
}));

vi.mock("./HomeBannerStack", () => ({
  HomeBannerStack: () => null,
  selectVisibleHomeBanners: (banners: readonly unknown[]) => banners,
}));

function createSelectedThread(overrides?: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    archived: false,
    updatedAt: "2026-04-18T12:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    queuedCount: 0,
    ...overrides,
  };
}

function createWorkspaceSwitch(): WorkspaceSwitchState {
  return {
    switchId: 0,
    rootId: null,
    rootPath: null,
    phase: "idle",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  };
}

function createProps(
  overrides?: Partial<ComponentProps<typeof HomeViewMainContent>>,
): ComponentProps<typeof HomeViewMainContent> {
  return {
    appServerClient: { request: vi.fn() } as unknown as AppServerClient,
    busy: false,
    hostBridge: {
      app: { openExternal: vi.fn() },
    } as unknown as HostBridge,
    gitController: {} as WorkspaceGitController,
    activities: [],
    banners: [],
    account: null,
    rateLimitSummary: null,
    queuedFollowUps: [],
    collaborationPreset: "default",
    models: [],
    defaultModel: "gpt-5.2",
    defaultEffort: "medium",
    defaultServiceTier: null,
    workspaceOpener: "vscode",
    roots: [{ id: "root-1", name: "codex-app-plus", path: "E:/code/codex-app-plus" }],
    selectedRootId: "root-1",
    selectedRootName: "codex-app-plus",
    selectedRootPath: "E:/code/codex-app-plus",
    activeTurnId: null,
    selectedConversationLoading: false,
    selectedThread: createSelectedThread(),
    threadDetailLevel: "commands",
    isResponding: false,
    interruptPending: false,
    workspaceSwitch: createWorkspaceSwitch(),
    launchState: null,
    terminalOpen: false,
    diffOpen: false,
    followUpQueueMode: "queue",
    composerEnterBehavior: "enter",
    composerPermissionLevel: "default",
    connectionStatus: "connected",
    connectionRetryInfo: null,
    fatalError: null,
    retryScheduledAt: null,
    onSelectWorkspaceOpener: vi.fn(),
    onSelectRoot: vi.fn(),
    onSelectCollaborationPreset: vi.fn(),
    onInputChange: vi.fn(),
    onSendTurn: vi.fn().mockResolvedValue(undefined),
    onRegenerateFromEditedUserMessage: vi.fn().mockResolvedValue(undefined),
	    onPersistComposerSelection: vi.fn().mockResolvedValue(undefined),
	    onEditThreadGoal: vi.fn().mockResolvedValue(undefined),
	    onToggleThreadGoalStatus: vi.fn().mockResolvedValue(undefined),
	    onClearThreadGoal: vi.fn().mockResolvedValue(undefined),
	    onSelectComposerPermissionLevel: vi.fn(),
    onUpdateThreadBranch: vi.fn().mockResolvedValue(undefined),
    onInterruptTurn: vi.fn().mockResolvedValue(undefined),
    onLogout: vi.fn().mockResolvedValue(undefined),
    onResolveServerRequest: vi.fn().mockResolvedValue(undefined),
    onPromoteQueuedFollowUp: vi.fn().mockResolvedValue(undefined),
    onRemoveQueuedFollowUp: vi.fn(),
    onClearQueuedFollowUps: vi.fn(),
    onCreateThread: vi.fn().mockResolvedValue(undefined),
    onTogglePetAwake: vi.fn(),
    onToggleDiff: vi.fn(),
    onToggleTerminal: vi.fn(),
    onOpenPreviewTarget: vi.fn(),
    onRetryConnection: vi.fn().mockResolvedValue(undefined),
    onDismissBanner: vi.fn(),
    diffItems: [{
      path: "src/features/git/ui/WorkspaceDiffSidebar.tsx",
      displayPath: "src/features/git/ui/WorkspaceDiffSidebar.tsx",
      originalPath: null,
      status: "M",
      staged: false,
      section: "unstaged",
      diff: "@@ -1 +1 @@\n-old\n+new",
      additions: 1,
      deletions: 1,
    }],
    diffPreviewVisible: false,
    diffPreviewStyle: "unified",
    diffPreviewSelectedPath: "src/features/git/ui/WorkspaceDiffSidebar.tsx",
    ...overrides,
  };
}

describe("HomeViewMainContent", () => {
  it("covers the full main panel when diff preview is expanded", () => {
    const { container } = render(
      <HomeViewMainContent
        {...createProps({
          diffOpen: true,
          diffPreviewVisible: true,
          diffPreviewStyle: "split",
        })}
      />,
    );

    expect(screen.getByTestId("home-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("diff-preview")).toBeInTheDocument();
    expect(screen.getByTestId("home-composer")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-drawer")).toBeNull();
    expect(container.querySelector(".replica-main-diff-preview-active")).not.toBeNull();
    expect(container.querySelector(".home-main-overlay")).not.toBeNull();
  });

  it("expands the active quick preview instead of the review diff", () => {
    render(
      <HomeViewMainContent
        {...createProps({
          diffOpen: true,
          diffPreviewVisible: true,
          expandedSidePanelTarget: {
            kind: "preview",
            target: {
              kind: "file",
              fileKind: "image",
              path: "E:/code/project/assets/logo.png",
              name: "logo.png",
              extension: "PNG",
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("quick-preview")).toHaveTextContent("logo.png");
    expect(screen.queryByTestId("diff-preview")).toBeNull();
  });

  it("expands the active file viewer instead of the review diff", () => {
    render(
      <HomeViewMainContent
        {...createProps({
          diffOpen: true,
          diffPreviewVisible: true,
          expandedSidePanelTarget: {
            kind: "file",
            path: "E:/code/project/src/App.tsx",
            name: "App.tsx",
          },
        })}
      />,
    );

    expect(screen.getByTestId("file-viewer")).toHaveTextContent("E:/code/project/src/App.tsx");
    expect(screen.queryByTestId("diff-preview")).toBeNull();
  });

  it("hides the progress card while the right sidebar is open", () => {
    render(
      <HomeViewMainContent
        {...createProps({
          diffOpen: true,
        })}
      />,
    );

    expect(screen.queryByTestId("plan-drawer")).toBeNull();
  });

  it("keeps the card overview-only when no response is running", () => {
    render(
      <HomeViewMainContent
        {...createProps({
          isResponding: false,
        })}
      />,
    );

    expect(screen.getByTestId("plan-drawer")).toHaveAttribute("data-show-progress", "false");
  });

  it("forwards progress card change clicks to the diff sidebar toggle", () => {
    const onToggleDiff = vi.fn();
    render(
      <HomeViewMainContent
        {...createProps({
          onToggleDiff,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("plan-drawer"));

    expect(onToggleDiff).toHaveBeenCalledTimes(1);
  });

  it("hides the progress card in the new conversation empty state", () => {
    render(
      <HomeViewMainContent
        {...createProps({
          activities: [],
          selectedConversationLoading: false,
          selectedThread: null,
        })}
      />,
    );

    expect(screen.queryByTestId("plan-drawer")).toBeNull();
  });

  it("renders the goal status bar above the composer instead of at the main panel top", () => {
    const { container } = render(
      <HomeViewMainContent
        {...createProps({
          selectedThread: createSelectedThread({
            goal: {
              threadId: "thread-1",
              objective: "Keep the goal near the composer",
              status: "active",
              tokenBudget: null,
              tokensUsed: 0,
              timeUsedSeconds: 72,
              createdAt: 0,
              updatedAt: 0,
            },
          }),
        })}
      />,
    );

    const composer = screen.getByTestId("home-composer");
    const goalBar = screen.getByLabelText("当前目标");
    expect(composer.firstElementChild).toBe(goalBar);
    expect(container.querySelector(".replica-main > .home-goal-status-bar")).toBeNull();
  });
});
