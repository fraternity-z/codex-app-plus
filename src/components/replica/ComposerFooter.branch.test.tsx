import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GitStatusOutput } from "../../bridge/types";
import type { GitNotice, WorkspaceGitController } from "./git/types";
import { ComposerFooterBranchPopover } from "./ComposerFooterBranchPopover";

function createStatus(overrides?: Partial<GitStatusOutput>): GitStatusOutput {
  return {
    isRepository: true,
    repoRoot: "E:/code/project",
    branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
    remoteName: "origin",
    remoteUrl: "https://example.com/repo.git",
    branches: [
      { name: "main", upstream: "origin/main", isCurrent: true },
      { name: "feature/agent", upstream: null, isCurrent: false },
      { name: "feature/ui", upstream: null, isCurrent: false },
    ],
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isClean: true,
    ...overrides,
  };
}

interface RenderOptions {
  readonly status?: GitStatusOutput | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly selectedThreadId?: string | null;
  readonly selectedThreadBranch?: string | null;
  readonly checkoutSucceeds?: boolean;
  readonly createSucceeds?: boolean;
  readonly metadataHandler?: (branch: string) => Promise<void>;
}

function renderPopover(options: RenderOptions = {}) {
  const calls: string[] = [];
  const onClose = vi.fn();
  const onUpdateThreadBranch = vi.fn(async (branch: string) => {
    calls.push(`metadata:${branch}`);
    await options.metadataHandler?.(branch);
  });

  function Harness(): JSX.Element {
    const [selectedBranch, setSelectedBranch] = useState("");
    const [newBranchName, setNewBranchName] = useState("");
    const [notice, setNotice] = useState<GitNotice | null>(null);
    const status = options.status === undefined ? createStatus() : options.status;

    const controller: WorkspaceGitController = {
      loading: options.loading ?? false,
      pendingAction: null,
      status,
      statusLoaded: status !== null,
      hasRepository: status?.isRepository ?? false,
      error: options.error ?? null,
      notice,
      commitMessage: "",
      selectedBranch,
      newBranchName,
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
      checkoutBranch: vi.fn(async (branchName: string) => {
        calls.push(`checkout:${branchName}`);
        if (options.checkoutSucceeds === false) {
          setNotice({ kind: "error", text: "checkout failed" });
          return false
        }
        return true
      }),
      createBranchFromName: vi.fn().mockResolvedValue(true),
      checkoutSelectedBranch: vi.fn().mockResolvedValue(true),
      createBranch: vi.fn(async () => {
        const branchName = newBranchName.trim();
        calls.push(`create:${branchName}`);
        if (options.createSucceeds === false) {
          setNotice({ kind: "error", text: "create failed" });
          return false
        }
        setNewBranchName("");
        return true
      }),
      ensureDiff: vi.fn().mockResolvedValue(undefined),
      selectDiff: vi.fn().mockResolvedValue(undefined),
      clearDiff: vi.fn(),
      setCommitMessage: vi.fn(),
      setSelectedBranch: (branchName: string) => {
        calls.push(`select:${branchName}`);
        setSelectedBranch(branchName);
      },
      setNewBranchName,
    };

    return <ComposerFooterBranchPopover controller={controller} selectedThreadId={options.selectedThreadId === undefined ? "thread-1" : options.selectedThreadId} selectedThreadBranch={options.selectedThreadBranch ?? null} onUpdateThreadBranch={onUpdateThreadBranch} onClose={onClose} />;
  }

  return { ...render(<Harness />), calls, onClose, onUpdateThreadBranch };
}

describe("ComposerFooterBranchPopover", () => {
  it("renders branch list, filters search, and toggles create mode", () => {
    const { container } = renderPopover({ selectedThreadBranch: "feature/agent" });
    const searchInput = container.querySelector(".branch-search-input") as HTMLInputElement;
    const createButton = container.querySelector(".branch-create") as HTMLButtonElement;

    expect(container.textContent).toContain("feature/agent");
    expect(container.textContent).toContain("main");
    expect(screen.getByRole("menuitem", { name: /feature\/agent/ }).querySelector(".branch-check")).not.toBeNull();

    fireEvent.change(searchInput, { target: { value: "ui" } });

    expect(screen.queryByRole("menuitem", { name: /feature\/agent/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /feature\/ui/ })).toBeInTheDocument();

    fireEvent.click(createButton);

    expect(container.querySelector(".branch-create-panel")).not.toBeNull();
    fireEvent.click(container.querySelector(".branch-create-secondary") as HTMLButtonElement);
    expect(container.querySelector(".branch-create-panel")).toBeNull();
  });

  it("checks out an existing branch before updating thread metadata", async () => {
    const { calls, onClose } = renderPopover();

    fireEvent.click(screen.getByRole("menuitem", { name: /feature\/ui/ }));

    await waitFor(() => {
      expect(calls).toEqual(["select:feature/ui", "checkout:feature/ui", "metadata:feature/ui"]);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates a branch then writes thread metadata", async () => {
    const { container, calls, onClose } = renderPopover();

    fireEvent.click(container.querySelector(".branch-create") as HTMLButtonElement);
    fireEvent.change(container.querySelector('.branch-create-panel .branch-search-input') as HTMLInputElement, { target: { value: "feature/new-branch" } });
    fireEvent.click(container.querySelector(".branch-create-primary") as HTMLButtonElement);

    await waitFor(() => {
      expect(calls).toEqual(["create:feature/new-branch", "metadata:feature/new-branch"]);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the popover open and shows an error when metadata update fails", async () => {
    const { calls, container, onClose } = renderPopover({ metadataHandler: async () => { throw new Error("metadata failed"); } });

    fireEvent.click(screen.getByRole("menuitem", { name: /feature\/ui/ }));

    await waitFor(() => {
      expect((container.querySelector(".branch-banner-error") as HTMLElement | null)?.textContent).toContain("metadata failed");
    });
    expect(calls).toEqual(["select:feature/ui", "checkout:feature/ui", "metadata:feature/ui"]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders loading and non-repository states explicitly", () => {
    const loadingView = renderPopover({ loading: true, status: null });
    expect(screen.getByText("\u6b63\u5728\u8bfb\u53d6 Git \u5206\u652f")).toBeInTheDocument();
    loadingView.unmount();

    renderPopover({ status: createStatus({ isRepository: false, repoRoot: null }) });
    expect(screen.getByText("\u5f53\u524d\u5de5\u4f5c\u533a\u4e0d\u662f Git \u4ed3\u5e93")).toBeInTheDocument();
  });

  it("falls back to HEAD when remembered branch is missing and skips metadata for drafts", async () => {
    const { calls, container, onUpdateThreadBranch } = renderPopover({ selectedThreadId: null, selectedThreadBranch: "feature/missing" });

    expect(container.textContent).toContain("feature/missing");
    expect(container.textContent).toContain("main");
    fireEvent.click(screen.getByRole("menuitem", { name: /feature\/ui/ }));

    await waitFor(() => {
      expect(calls).toEqual(["select:feature/ui", "checkout:feature/ui"]);
    });
    expect(onUpdateThreadBranch).not.toHaveBeenCalled();
  });
});
