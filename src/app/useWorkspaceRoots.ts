import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreadSummary } from "../domain/types";

const STORAGE_KEY = "codex-app-plus.workspace-roots";
const EMPTY_ARRAY: ReadonlyArray<WorkspaceRoot> = [];

export interface WorkspaceRoot {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface AddWorkspaceRootInput {
  readonly name: string;
  readonly path: string;
}

function trimText(value: string): string {
  return value.trim();
}

function inferNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
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
  const path = trimText(rawPath);
  if (path.length === 0) {
    return null;
  }
  const rawName = typeof record.name === "string" ? record.name : inferNameFromPath(path);
  const name = trimText(rawName);
  if (name.length === 0) {
    return null;
  }
  return { id: record.id, name, path };
}

function parseStoredRoots(raw: string | null): ReadonlyArray<WorkspaceRoot> {
  if (raw === null) {
    return EMPTY_ARRAY;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return EMPTY_ARRAY;
    }
    const roots: Array<WorkspaceRoot> = [];
    for (const item of parsed) {
      const root = normalizeStoredRoot(item);
      if (root !== null) {
        roots.push(root);
      }
    }
    return roots;
  } catch {
    return EMPTY_ARRAY;
  }
}

function rootKey(root: Pick<WorkspaceRoot, "path" | "name">): string {
  const pathKey = trimText(root.path).toLowerCase();
  if (pathKey.length > 0) {
    return pathKey;
  }
  return trimText(root.name).toLowerCase();
}

function createRootFromThread(thread: ThreadSummary): WorkspaceRoot | null {
  const path = trimText(thread.cwd ?? thread.title);
  if (path.length === 0) {
    return null;
  }
  const title = trimText(thread.title);
  const name = title.length > 0 ? title : inferNameFromPath(path);
  return { id: `thread-${rootKey({ name, path })}`, name, path };
}

function mergeRoots(
  first: ReadonlyArray<WorkspaceRoot>,
  second: ReadonlyArray<WorkspaceRoot>
): ReadonlyArray<WorkspaceRoot> {
  const seen = new Set<string>();
  const merged: Array<WorkspaceRoot> = [];
  for (const root of [...first, ...second]) {
    const key = rootKey(root);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(root);
  }
  return merged;
}

function rootsEqual(
  first: ReadonlyArray<WorkspaceRoot>,
  second: ReadonlyArray<WorkspaceRoot>
): boolean {
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    const left = first[index];
    const right = second[index];
    if (left.id !== right.id || left.name !== right.name || left.path !== right.path) {
      return false;
    }
  }
  return true;
}

function sanitizeInput(input: AddWorkspaceRootInput): WorkspaceRoot | null {
  const path = trimText(input.path);
  if (path.length === 0) {
    return null;
  }
  const explicitName = trimText(input.name);
  const name = explicitName.length > 0 ? explicitName : inferNameFromPath(path);
  if (name.length === 0) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    name,
    path
  };
}

export interface WorkspaceRootController {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  selectRoot: (rootId: string) => void;
  addRoot: (input: AddWorkspaceRootInput) => void;
}

export function useWorkspaceRoots(
  threads: ReadonlyArray<ThreadSummary>,
  loadThreads: () => Promise<void>
): WorkspaceRootController {
  const [roots, setRoots] = useState<ReadonlyArray<WorkspaceRoot>>(() =>
    parseStoredRoots(window.localStorage.getItem(STORAGE_KEY))
  );
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  useEffect(() => {
    void loadThreads().catch(() => undefined);
  }, [loadThreads]);

  useEffect(() => {
    const threadRoots = threads
      .map((thread) => createRootFromThread(thread))
      .filter((root): root is WorkspaceRoot => root !== null);
    const merged = mergeRoots(roots, threadRoots);
    if (!rootsEqual(roots, merged)) {
      setRoots(merged);
    }
  }, [roots, threads]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roots));
  }, [roots]);

  useEffect(() => {
    if (selectedRootId !== null && roots.some((root) => root.id === selectedRootId)) {
      return;
    }
    setSelectedRootId(roots[0]?.id ?? null);
  }, [roots, selectedRootId]);

  const addRoot = useCallback((input: AddWorkspaceRootInput) => {
    const root = sanitizeInput(input);
    if (root === null) {
      return;
    }
    setRoots((current) => mergeRoots(current, [root]));
  }, []);

  const value = useMemo(
    () => ({ roots, selectedRootId, selectRoot: setSelectedRootId, addRoot }),
    [addRoot, roots, selectedRootId]
  );
  return value;
}
