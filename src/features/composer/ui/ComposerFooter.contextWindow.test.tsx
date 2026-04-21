import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { createConversationFromThread } from "../../conversation/model/conversationState";
import type { GitStatusOutput } from "../../../bridge/types";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ThreadTokenUsage } from "../../../protocol/generated/v2/ThreadTokenUsage";
import type { WorkspaceGitController } from "../../git/model/types";
import { ComposerFooter } from "./ComposerFooter";
import { AppStoreProvider, useAppStore } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";

const DEFAULT_USAGE: ThreadTokenUsage = {
  total: { totalTokens: 39000, inputTokens: 36000, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  last: { totalTokens: 3000, inputTokens: 0, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  modelContextWindow: 258000,
};

const OVER_WINDOW_USAGE: ThreadTokenUsage = {
  total: { totalTokens: 320000, inputTokens: 317000, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  last: { totalTokens: 64000, inputTokens: 61000, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  modelContextWindow: 128000,
};

const I18nWrapper = createI18nWrapper();

function Wrapper(props: PropsWithChildren): JSX.Element {
  return (
    <I18nWrapper>
      <AppStoreProvider>{props.children}</AppStoreProvider>
    </I18nWrapper>
  );
}

function createThread() {
  return {
    id: "thread-1",
    forkedFromId: null,
    preview: "分析当前工作区",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 1,
    status: { type: "idle" as const },
    path: null,
    cwd: "E:/code/codex-app-plus",
    cliVersion: "0.1.0",
    source: "appServer" as const,
    agentNickname: null,
    agentRole: null,
    gitInfo: { sha: null, branch: "main", originUrl: null },
    name: "Thread",
    turns: [],
  };
}

function createStatus(): GitStatusOutput {
  return {
    isRepository: true,
    repoRoot: "E:/code/codex-app-plus",
    branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
    remoteName: "origin",
    remoteUrl: "https://example.com/repo.git",
    branches: [
      { name: "main", upstream: "origin/main", isCurrent: true },
      { name: "feature/ui", upstream: null, isCurrent: false },
    ],
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isClean: true,
  };
}

function createController(): WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: createStatus(),
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

function createConfigSnapshot(): ConfigReadResponse {
  return {
    config: {
      model: null,
      review_model: null,
      model_context_window: null,
      model_auto_compact_token_limit: 120000n,
      model_provider: null,
      approval_policy: null,
      approvals_reviewer: null,
      sandbox_mode: null,
      sandbox_workspace_write: null,
      forced_chatgpt_workspace_id: null,
      forced_login_method: null,
      web_search: null,
      tools: null,
      profile: null,
      profiles: {},
      instructions: null,
      developer_instructions: null,
      compact_prompt: null,
      model_reasoning_effort: null,
      model_reasoning_summary: null,
      model_verbosity: null,
      service_tier: null,
      analytics: null,
      apps: null,
    } as ConfigReadResponse["config"],
    origins: {},
    layers: [],
  };
}

function FooterHarness(props: { readonly usage: ThreadTokenUsage | null }): JSX.Element {
  const { dispatch } = useAppStore();

  useEffect(() => {
    const conversation = createConversationFromThread(createThread(), { resumeState: "resumed" });
    dispatch({ type: "conversation/upserted", conversation });
    dispatch({ type: "conversation/selected", conversationId: "thread-1" });
    dispatch({ type: "config/loaded", config: createConfigSnapshot() });
    if (props.usage !== null) {
      dispatch({
        type: "conversation/tokenUsageUpdated",
        conversationId: "thread-1",
        turnId: "turn-1",
        usage: props.usage,
      });
    }
  }, [dispatch, props.usage]);

  return (
    <ComposerFooter
      permissionLevel="default"
      gitController={createController()}
      selectedThreadId="thread-1"
      selectedThreadBranch="main"
      onSelectPermission={vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

describe("ComposerFooter context window indicator", () => {
  it("does not render the indicator before official usage arrives", () => {
    const { container } = render(<FooterHarness usage={null} />, { wrapper: Wrapper });

    expect(container.querySelector(".composer-context-window-trigger")).toBeNull();
  });

  it("shows the tooltip on hover and focus with official usage copy", async () => {
    render(<FooterHarness usage={DEFAULT_USAGE} />, { wrapper: Wrapper });
    const trigger = await screen.findByLabelText("View context window details (auto-compact detected)");

    fireEvent.mouseEnter(trigger);

    expect(screen.getByText("Context window:")).toBeInTheDocument();
    expect(screen.getByText("1% used (99% remaining)")).toBeInTheDocument();
    expect(screen.getByText("3k tokens used, 258k total")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText("Context window:")).toBeNull();

    fireEvent.focus(trigger);
    expect(screen.getByText("1% used (99% remaining)")).toBeInTheDocument();
  });

  it("keeps the tooltip within 100 percent when cumulative totals exceed the context window", async () => {
    render(<FooterHarness usage={OVER_WINDOW_USAGE} />, { wrapper: Wrapper });
    const trigger = await screen.findByLabelText("View context window details (auto-compact detected)");

    fireEvent.mouseEnter(trigger);

    expect(screen.getByText("50% used (50% remaining)")).toBeInTheDocument();
    expect(screen.getByText("64k tokens used, 128k total")).toBeInTheDocument();
  });

  it("keeps branch controls usable while the indicator exists", async () => {
    const { container } = render(<FooterHarness usage={DEFAULT_USAGE} />, { wrapper: Wrapper });
    const trigger = await screen.findByLabelText("View context window details (auto-compact detected)");

    fireEvent.mouseEnter(trigger);
    fireEvent.click(screen.getByRole("button", { name: /main/i }));

    expect(screen.getByRole("menuitem", { name: /feature\/ui/ })).toBeInTheDocument();
    expect(container.querySelector(".composer-context-window-anchor")).not.toBeNull();
  });
});
