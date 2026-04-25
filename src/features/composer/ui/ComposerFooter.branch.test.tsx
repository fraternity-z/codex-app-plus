import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitStatusOutput } from "../../../bridge/types";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { GitNotice, WorkspaceGitController } from "../../git/model/types";
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
  readonly branchRefsLoaded?: boolean;
  readonly branchRefsLoading?: boolean;
  readonly error?: string | null;
  readonly selectedThreadId?: string | null;
  readonly selectedThreadBranch?: string | null;
  readonly checkoutSucceeds?: boolean;
  readonly createSucceeds?: boolean;
  readonly deleteResponses?: ReadonlyArray<{ readonly success: boolean; readonly errorText?: string }>;
  readonly metadataHandler?: (branch: string) => Promise<void>;
}

function renderPopover(options: RenderOptions = {}) {
  const calls: string[] = [];
  const onClose = vi.fn();
  const onUpdateThreadBranch = vi.fn(async (branch: string) => {
    calls.push(`metadata:${branch}`);
    await options.metadataHandler?.(branch);
  });
  const deleteResponses = options.deleteResponses ? [...options.deleteResponses] : [];

  function Harness(): JSX.Element {
    const [selectedBranch, setSelectedBranch] = useState("");
    const [newBranchName, setNewBranchName] = useState("");
    const [notice, setNotice] = useState<GitNotice | null>(null);
    const errorRef = useRef<string | null>(options.error ?? null);
    const status = options.status === undefined ? createStatus() : options.status;

    const controller: WorkspaceGitController = {
      loading: options.loading ?? false,
      pendingAction: null,
      status,
      statusLoaded: status !== null,
      hasRepository: status?.isRepository ?? false,
      get error() {
        return errorRef.current;
      },
      notice,
      commitDialogOpen: false,
      commitDialogError: null,
      branchRefsLoading: options.branchRefsLoading ?? false,
      branchRefsLoaded: options.branchRefsLoaded ?? true,
      commitMessage: "",
      commitInstructions: "",
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
      openCommitDialog: vi.fn(),
      closeCommitDialog: vi.fn(),
      checkoutBranch: vi.fn(async (branchName: string) => {
        calls.push(`checkout:${branchName}`);
        if (options.checkoutSucceeds === false) {
          errorRef.current = "checkout failed";
          setNotice({ kind: "error", text: "checkout failed" });
          return false;
        }
        return true;
      }),
      deleteBranch: vi.fn(async (branchName: string, force?: boolean) => {
        calls.push(force ? `delete-force:${branchName}` : `delete:${branchName}`);
        const response = deleteResponses.shift();
        if (response && !response.success) {
          errorRef.current = response.errorText ?? "delete failed";
          setNotice({ kind: "error", text: response.errorText ?? "delete failed" });
          return false;
        }
        errorRef.current = null;
        return true;
      }),
      createBranchFromName: vi.fn().mockResolvedValue(true),
      checkoutSelectedBranch: vi.fn().mockResolvedValue(true),
      createBranch: vi.fn(async () => {
        const branchName = newBranchName.trim();
        calls.push(`create:${branchName}`);
        if (options.createSucceeds === false) {
          errorRef.current = "create failed";
          setNotice({ kind: "error", text: "create failed" });
          return false;
        }
        errorRef.current = null;
        setNewBranchName("");
        return true;
      }),
      ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
      ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
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

    return (
      <ComposerFooterBranchPopover
        controller={controller}
        selectedThreadId={options.selectedThreadId === undefined ? "thread-1" : options.selectedThreadId}
        selectedThreadBranch={options.selectedThreadBranch ?? null}
        onUpdateThreadBranch={onUpdateThreadBranch}
        onClose={onClose}
      />
    );
  }

  return {
    ...render(<Harness />, { wrapper: createI18nWrapper("en-US") }),
    calls,
    onClose,
    onUpdateThreadBranch,
  };
}

describe("ComposerFooterBranchPopover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    fireEvent.change(container.querySelector('.branch-create-panel .branch-search-input') as HTMLInputElement, {
      target: { value: "feature/new-branch" },
    });
    fireEvent.click(container.querySelector(".branch-create-primary") as HTMLButtonElement);

    await waitFor(() => {
      expect(calls).toEqual(["create:feature/new-branch", "metadata:feature/new-branch"]);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the popover open and shows an error when metadata update fails", async () => {
    const { calls, container, onClose } = renderPopover({
      metadataHandler: async () => { throw new Error("metadata failed"); },
    });

    fireEvent.click(screen.getByRole("menuitem", { name: /feature\/ui/ }));

    await waitFor(() => {
      expect((container.querySelector(".branch-banner-error") as HTMLElement | null)?.textContent).toContain("metadata failed");
    });
    expect(calls).toEqual(["select:feature/ui", "checkout:feature/ui", "metadata:feature/ui"]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders loading and non-repository states explicitly", () => {
    const loadingView = renderPopover({ loading: true, status: null });
    expect(screen.getByText("Loading Git branches")).toBeInTheDocument();
    loadingView.unmount();

    renderPopover({ status: createStatus({ isRepository: false, repoRoot: null }) });
    expect(screen.getByText("The current workspace is not a Git repository")).toBeInTheDocument();
  });

  it("shows loading while branch refs are still lazy-loading", () => {
    renderPopover({ branchRefsLoaded: false, branchRefsLoading: true });

    expect(screen.getByText("Loading Git branches")).toBeInTheDocument();
  });

  it("deletes a local branch from the context menu after confirmation", async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    const { calls } = renderPopover({ selectedThreadBranch: "feature/agent" });

    fireEvent.contextMenu(screen.getByRole("menuitem", { name: /feature\/ui/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete branch" }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith("Delete branch feature/ui?");
      expect(calls).toContain("delete:feature/ui");
    });
  });

  it("does not allow deleting the current branch from the context menu", () => {
    const { container } = renderPopover();
    const branchButtons = container.querySelectorAll(".branch-item");

    fireEvent.contextMenu(branchButtons[0]!.parentElement as HTMLElement);
    expect(screen.queryByRole("menuitem", { name: "Delete branch" })).toBeNull();
  });

  it("offers force delete when branch is not fully merged", async () => {
    const confirm = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const { container, calls } = renderPopover({
      deleteResponses: [{ success: false, errorText: "git branch -d feature/ui failed: error: the branch 'feature/ui' is not fully merged" }],
    });

    const branchButtons = container.querySelectorAll(".branch-item");
    fireEvent.contextMenu(branchButtons[2]!.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete branch" }));

    await waitFor(() => {
      expect(confirm).toHaveBeenNthCalledWith(1, "Delete branch feature/ui?");
      expect(confirm).toHaveBeenNthCalledWith(2, "Branch feature/ui is not fully merged. Force delete it?");
      expect(calls).toContain("delete:feature/ui");
      expect(calls).toContain("delete-force:feature/ui");
    });
  });

  it("cancels branch deletion when confirmation is rejected", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    const { calls } = renderPopover({ selectedThreadBranch: "feature/agent" });

    fireEvent.contextMenu(screen.getByRole("menuitem", { name: /feature\/ui/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete branch" }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith("Delete branch feature/ui?");
    });
    expect(calls).not.toContain("delete:feature/ui");
  });

  it("falls back to HEAD when remembered branch is missing and skips metadata for drafts", async () => {
    const { calls, container, onUpdateThreadBranch } = renderPopover({
      selectedThreadId: null,
      selectedThreadBranch: "feature/missing",
    });

    expect(container.textContent).toContain("feature/missing");
    expect(container.textContent).toContain("main");
    fireEvent.click(screen.getByRole("menuitem", { name: /feature\/ui/ }));

    await waitFor(() => {
      expect(calls).toEqual(["select:feature/ui", "checkout:feature/ui"]);
    });
    expect(onUpdateThreadBranch).not.toHaveBeenCalled();
  });
});
