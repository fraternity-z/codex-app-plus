import { useCallback, useEffect, useMemo, useState } from "react";
import { inferWorkspaceNameFromPath, normalizeWorkspacePath, trimWorkspaceText } from "../model/workspacePath";
import {
  normalizeWorkspaceLaunchScriptConfig,
  type LaunchScriptEntry,
} from "../model/workspaceLaunchScripts";
import { writeStoredJson, readStoredJson } from "../../shared/utils/storageJson";

const ROOTS_STORAGE_KEY = "codex-app-plus.workspace-roots";
const MANAGED_WORKTREES_STORAGE_KEY = "codex-app-plus.managed-worktrees";
const EMPTY_ROOTS: ReadonlyArray<WorkspaceRoot> = [];
const EMPTY_MANAGED_WORKTREES: ReadonlyArray<ManagedWorktreeRecord> = [];

export interface WorkspaceRoot {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly launchScript?: string | null;
  readonly launchScripts?: ReadonlyArray<LaunchScriptEntry> | null;
}

export interface ManagedWorktreeRecord {
  readonly path: string;
  readonly branch: string | null;
  readonly createdAt: string;
}

export interface AddWorkspaceRootInput {
  readonly name: string;
  readonly path: string;
}

export interface UpdateWorkspaceLaunchScriptsInput {
  readonly rootId: string;
  readonly launchScript: string | null;
  readonly launchScripts: ReadonlyArray<LaunchScriptEntry> | null;
}

export interface WorkspaceRootController {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly managedWorktrees: ReadonlyArray<ManagedWorktreeRecord>;
  readonly selectedRoot: WorkspaceRoot | null;
  readonly selectedRootId: string | null;
  selectRoot: (rootId: string) => void;
  addRoot: (input: AddWorkspaceRootInput) => void;
  removeRoot: (rootId: string) => void;
  reorderRoots: (fromIndex: number, toIndex: number) => void;
  addManagedWorktree: (input: { readonly path: string; readonly branch: string | null }) => void;
  removeManagedWorktree: (path: string) => void;
  updateWorkspaceLaunchScripts: (input: UpdateWorkspaceLaunchScriptsInput) => void;
}

function normalizeStoredRoot(value: unknown): WorkspaceRoot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { id?: unknown; name?: unknown; path?: unknown };
  if (typeof record.id !== "string") {
    return null;
  }

  const rawPath = typeof record.path === "string" ? record.path : record.name;
  if (typeof rawPath !== "string") {
    return null;
  }

  const path = trimWorkspaceText(rawPath);
  if (path.length === 0) {
    return null;
  }

  const rawName = typeof record.name === "string" ? record.name : inferWorkspaceNameFromPath(path);
  const name = trimWorkspaceText(rawName);
  if (name.length === 0) {
    return null;
  }

  return {
    id: record.id,
    name,
    path,
    ...normalizeWorkspaceLaunchScriptConfig(record),
  };
}

function parseStoredRootsValue(value: unknown): ReadonlyArray<WorkspaceRoot> {
  if (!Array.isArray(value)) {
    return EMPTY_ROOTS;
  }
  return value.map(normalizeStoredRoot).filter((root): root is WorkspaceRoot => root !== null);
}

function normalizeManagedWorktree(value: unknown): ManagedWorktreeRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as { path?: unknown; branch?: unknown; createdAt?: unknown };
  const path = typeof record.path === "string" ? trimWorkspaceText(record.path) : "";
  if (path.length === 0) {
    return null;
  }
  return {
    path,
    branch: typeof record.branch === "string" ? record.branch : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
  };
}

function parseManagedWorktreesValue(value: unknown): ReadonlyArray<ManagedWorktreeRecord> {
  if (!Array.isArray(value)) {
    return EMPTY_MANAGED_WORKTREES;
  }
  return value.map(normalizeManagedWorktree).filter((item): item is ManagedWorktreeRecord => item !== null);
}

function rootKey(root: Pick<WorkspaceRoot, "name" | "path">): string {
  const pathKey = normalizeWorkspacePath(root.path);
  return pathKey.length > 0 ? pathKey : trimWorkspaceText(root.name).toLowerCase();
}

function mergeRoots(
  first: ReadonlyArray<WorkspaceRoot>,
  second: ReadonlyArray<WorkspaceRoot>
): ReadonlyArray<WorkspaceRoot> {
  const merged = new Map<string, WorkspaceRoot>();
  for (const root of [...first, ...second]) {
    const key = rootKey(root);
    if (!merged.has(key)) {
      merged.set(key, root);
    }
  }
  return [...merged.values()];
}

function sanitizeInput(input: AddWorkspaceRootInput): WorkspaceRoot | null {
  const path = trimWorkspaceText(input.path);
  if (path.length === 0) {
    return null;
  }

  const explicitName = trimWorkspaceText(input.name);
  const name = explicitName.length > 0 ? explicitName : inferWorkspaceNameFromPath(path);
  if (name.length === 0) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    name,
    path,
    launchScript: null,
    launchScripts: null,
  };
}

function removeRootByKey(roots: ReadonlyArray<WorkspaceRoot>, key: string): ReadonlyArray<WorkspaceRoot> {
  return roots.filter((root) => rootKey(root) !== key);
}

function clampIndex(index: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index > max) {
    return max;
  }
  return index;
}

function reorderRootsByIndex(
  roots: ReadonlyArray<WorkspaceRoot>,
  fromIndex: number,
  toIndex: number
): ReadonlyArray<WorkspaceRoot> {
  if (roots.length < 2) {
    return roots;
  }
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return roots;
  }
  if (fromIndex < 0 || fromIndex >= roots.length) {
    return roots;
  }

  const targetIndex = clampIndex(toIndex, roots.length - 1);
  if (targetIndex === fromIndex) {
    return roots;
  }

  const next = [...roots];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return roots;
  }
  next.splice(targetIndex, 0, moved);
  return next;
}

export function useWorkspaceRoots(): WorkspaceRootController {
  const [roots, setRoots] = useState<ReadonlyArray<WorkspaceRoot>>(() =>
    readStoredJson(ROOTS_STORAGE_KEY, parseStoredRootsValue, EMPTY_ROOTS)
  );
  const [managedWorktrees, setManagedWorktrees] = useState<ReadonlyArray<ManagedWorktreeRecord>>(() =>
    readStoredJson(MANAGED_WORKTREES_STORAGE_KEY, parseManagedWorktreesValue, EMPTY_MANAGED_WORKTREES)
  );
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  useEffect(() => {
    writeStoredJson(ROOTS_STORAGE_KEY, roots);
  }, [roots]);

  useEffect(() => {
    writeStoredJson(MANAGED_WORKTREES_STORAGE_KEY, managedWorktrees);
  }, [managedWorktrees]);

  useEffect(() => {
    if (selectedRootId !== null && roots.some((root) => root.id === selectedRootId)) {
      return;
    }
    setSelectedRootId(roots[0]?.id ?? null);
  }, [roots, selectedRootId]);

  const addRoot = useCallback(
    (input: AddWorkspaceRootInput) => {
      const root = sanitizeInput(input);
      if (root === null) {
        return;
      }

      const key = rootKey(root);
      const existingRoot = roots.find((item) => rootKey(item) === key);
      setRoots((current) => mergeRoots(current, [root]));
      setSelectedRootId(existingRoot?.id ?? root.id);
    },
    [roots]
  );

  const removeRoot = useCallback(
    (rootId: string) => {
      const root = roots.find((item) => item.id === rootId);
      if (root === undefined) {
        return;
      }
      setRoots((current) => removeRootByKey(current, rootKey(root)));
    },
    [roots]
  );

  const updateWorkspaceLaunchScripts = useCallback(
    (input: UpdateWorkspaceLaunchScriptsInput) => {
      setRoots((current) => current.map((root) => {
        if (root.id !== input.rootId) {
          return root;
        }
        return {
          ...root,
          launchScript: input.launchScript,
          launchScripts: input.launchScripts,
        };
      }));
    },
    [],
  );

  const reorderRoots = useCallback((fromIndex: number, toIndex: number) => {
    setRoots((current) => reorderRootsByIndex(current, fromIndex, toIndex));
  }, []);

  const addManagedWorktree = useCallback((input: { readonly path: string; readonly branch: string | null }) => {
    const normalizedPath = trimWorkspaceText(input.path);
    if (normalizedPath.length === 0) {
      return;
    }
    setManagedWorktrees((current) => {
      const pathKey = normalizeWorkspacePath(normalizedPath);
      const remaining = current.filter((item) => normalizeWorkspacePath(item.path) !== pathKey);
      return [...remaining, { path: normalizedPath, branch: input.branch, createdAt: new Date().toISOString() }];
    });
  }, []);

  const removeManagedWorktree = useCallback((path: string) => {
    const pathKey = normalizeWorkspacePath(path);
    setManagedWorktrees((current) => current.filter((item) => normalizeWorkspacePath(item.path) !== pathKey));
  }, []);

  const selectedRoot = useMemo(
    () => roots.find((root) => root.id === selectedRootId) ?? null,
    [roots, selectedRootId],
  );

  return useMemo(
    () => ({
      roots,
      managedWorktrees,
      selectedRoot,
      selectedRootId,
      selectRoot: setSelectedRootId,
      addRoot,
      removeRoot,
      reorderRoots,
      addManagedWorktree,
      removeManagedWorktree,
      updateWorkspaceLaunchScripts,
    }),
    [
      addManagedWorktree,
      addRoot,
      managedWorktrees,
      removeManagedWorktree,
      removeRoot,
      reorderRoots,
      roots,
      selectedRoot,
      selectedRootId,
      updateWorkspaceLaunchScripts,
    ]
  );
}
