import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import type { ThreadSummary, WorkspaceSwitchState } from "../../../domain/types";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { WorkspaceGitController } from "../../git/model/types";
import { HomeViewMainContent } from "./HomeViewMainContent";

vi.mock("../../../state/store", () => ({
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
  HomeTurnPlanDrawer: () => <div data-testid="plan-drawer">plan drawer</div>,
}));

vi.mock("../../conversation/ui/HomeUserInputPrompt", () => ({
  HomeUserInputPrompt: () => <div data-testid="user-input-prompt">user input prompt</div>,
}));

vi.mock("../../composer/ui/HomeComposer", () => ({
  HomeComposer: () => <div data-testid="home-composer">composer</div>,
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
    diffOpen: true,
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
    onSelectComposerPermissionLevel: vi.fn(),
    onUpdateThreadBranch: vi.fn().mockResolvedValue(undefined),
    onInterruptTurn: vi.fn().mockResolvedValue(undefined),
    onLogout: vi.fn().mockResolvedValue(undefined),
    onResolveServerRequest: vi.fn().mockResolvedValue(undefined),
    onPromoteQueuedFollowUp: vi.fn().mockResolvedValue(undefined),
    onRemoveQueuedFollowUp: vi.fn(),
    onClearQueuedFollowUps: vi.fn(),
    onCreateThread: vi.fn().mockResolvedValue(undefined),
    onToggleDiff: vi.fn(),
    onToggleTerminal: vi.fn(),
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
          diffPreviewVisible: true,
          diffPreviewStyle: "split",
        })}
      />,
    );

    expect(screen.getByTestId("home-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("diff-preview")).toBeInTheDocument();
    expect(screen.getByTestId("home-composer")).toBeInTheDocument();
    expect(screen.getByTestId("plan-drawer")).toBeInTheDocument();
    expect(container.querySelector(".replica-main-diff-preview-active")).not.toBeNull();
    expect(container.querySelector(".home-main-overlay")).not.toBeNull();
  });
});
