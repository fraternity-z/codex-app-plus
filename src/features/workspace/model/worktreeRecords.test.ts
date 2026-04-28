import { describe, expect, it } from "vitest";
import type { GitWorktreeEntry } from "../../../bridge/types";
import type { ManagedWorktreeRecord, WorkspaceRoot } from "../hooks/useWorkspaceRoots";
import {
  createDefaultWorktreeProjectName,
  filterManagedWorktreeEntries,
  findManagedWorktreeRecord,
} from "./worktreeRecords";

function createWorktree(path: string): GitWorktreeEntry {
  return {
    path,
    branch: null,
    head: "abc123",
    isCurrent: false,
    isLocked: false,
    prunable: false,
  };
}

function createRecord(path: string): ManagedWorktreeRecord {
  return {
    path,
    repoPath: "E:/code/repo",
    branch: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createRoot(name: string, path: string): WorkspaceRoot {
  return {
    id: name,
    name,
    path,
    launchScript: null,
    launchScripts: null,
  };
}

describe("worktreeRecords", () => {
  it("filters git worktrees to managed records with normalized paths", () => {
    const entries = [
      createWorktree("E:\\code\\repo"),
      createWorktree("E:\\code\\repo-copy"),
      createWorktree("E:\\code\\repo-other"),
    ];
    const records = [createRecord("e:/code/repo-copy")];

    expect(filterManagedWorktreeEntries(entries, records).map((entry) => entry.path)).toEqual([
      "E:\\code\\repo-copy",
    ]);
  });

  it("can include newly created paths and exclude deleted paths during refresh", () => {
    const entries = [
      createWorktree("E:/code/repo-copy"),
      createWorktree("E:/code/repo-new"),
    ];
    const records = [createRecord("E:/code/repo-copy")];

    expect(filterManagedWorktreeEntries(entries, records, ["E:/code/repo-new"], ["E:/code/repo-copy"]))
      .toEqual([createWorktree("E:/code/repo-new")]);
  });

  it("finds managed records by normalized path", () => {
    const record = createRecord("E:\\code\\repo-copy");

    expect(findManagedWorktreeRecord([record], "e:/code/repo-copy")).toBe(record);
  });

  it("creates a project name that does not collide with existing roots", () => {
    const root = createRoot("codex-app-plus", "E:/code/codex-app-plus");
    const roots = [
      root,
      createRoot("codex-app-plus_2", "E:/worktrees/codex-app-plus_2"),
    ];

    expect(createDefaultWorktreeProjectName(root, roots)).toBe("codex-app-plus_3");
  });
});
