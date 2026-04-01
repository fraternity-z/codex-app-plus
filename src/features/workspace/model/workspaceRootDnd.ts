import type { WorkspaceRoot } from "../hooks/useWorkspaceRoots";

export const WORKSPACE_DND_TOP_THRESHOLD = 0.35;
export const WORKSPACE_DND_BOTTOM_THRESHOLD = 0.65;
export const WORKSPACE_DND_CENTER_HOVER_MS = 180;
export const WORKSPACE_DND_GROUP_SNAP_DISTANCE_PX = 16;

export interface WorkspaceDnDHoverState {
  readonly overId: string | null;
  readonly enteredAt: number;
}

export interface WorkspaceDropInput {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly activeId: string;
  readonly overId: string;
  readonly pointerY: number;
  readonly overTop: number;
  readonly overHeight: number;
  readonly now: number;
  readonly hoverState: WorkspaceDnDHoverState;
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").trim();
}

function stripDrivePrefix(input: string): string {
  return input.replace(/^[a-zA-Z]:/, "");
}

function inferGroupFallback(path: string): string {
  const normalized = normalizePath(path);
  if (normalized.length === 0) {
    return "";
  }
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.at(-1)?.toLowerCase() ?? "";
}

export function getWorkspaceGroupKey(root: WorkspaceRoot): string {
  const normalized = stripDrivePrefix(normalizePath(root.path));
  const segments = normalized.split("/").filter((part) => part.length > 0);
  if (segments.length > 0) {
    return segments[0]!.toLowerCase();
  }
  const fallback = inferGroupFallback(root.path);
  if (fallback.length > 0) {
    return fallback;
  }
  return root.name.trim().toLowerCase();
}

function clampInsertionIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index > length) {
    return length;
  }
  return index;
}

function findIndexById(roots: ReadonlyArray<WorkspaceRoot>, rootId: string): number {
  return roots.findIndex((root) => root.id === rootId);
}

function resolveR1InsertionIndex(
  overIndex: number,
  pointerY: number,
  overTop: number,
  overHeight: number
): number {
  const localY = pointerY - overTop;
  const ratio = overHeight <= 0 ? 0.5 : localY / overHeight;
  if (ratio < WORKSPACE_DND_TOP_THRESHOLD) {
    return overIndex;
  }
  if (ratio > WORKSPACE_DND_BOTTOM_THRESHOLD) {
    return overIndex + 1;
  }
  return overIndex;
}

function resolveR2InsertionIndex(
  activeIndex: number,
  overIndex: number,
  pointerY: number,
  overTop: number,
  overHeight: number,
  now: number,
  hoverState: WorkspaceDnDHoverState
): number | null {
  if (hoverState.overId === null) {
    return null;
  }
  const localY = pointerY - overTop;
  const ratio = overHeight <= 0 ? 0.5 : localY / overHeight;
  const inCenterZone = ratio >= WORKSPACE_DND_TOP_THRESHOLD && ratio <= WORKSPACE_DND_BOTTOM_THRESHOLD;
  if (!inCenterZone || hoverState.overId !== String(overIndex)) {
    return null;
  }
  if (now - hoverState.enteredAt < WORKSPACE_DND_CENTER_HOVER_MS) {
    return null;
  }
  return activeIndex < overIndex ? overIndex + 1 : overIndex;
}

function findContiguousGroupRange(
  roots: ReadonlyArray<WorkspaceRoot>,
  groupKey: string,
  nearIndex: number
): { start: number; end: number } | null {
  if (nearIndex < 0 || nearIndex >= roots.length) {
    return null;
  }
  if (getWorkspaceGroupKey(roots[nearIndex]!) !== groupKey) {
    return null;
  }
  let start = nearIndex;
  let end = nearIndex;
  while (start > 0 && getWorkspaceGroupKey(roots[start - 1]!) === groupKey) {
    start -= 1;
  }
  while (end < roots.length - 1 && getWorkspaceGroupKey(roots[end + 1]!) === groupKey) {
    end += 1;
  }
  return { start, end };
}

function resolveR3InsertionIndex(
  roots: ReadonlyArray<WorkspaceRoot>,
  activeGroupKey: string,
  insertionIndex: number,
  pointerY: number,
  overIndex: number,
  overTop: number,
  overHeight: number
): number {
  const previous = insertionIndex > 0 ? roots[insertionIndex - 1] : null;
  const next = insertionIndex < roots.length ? roots[insertionIndex] : null;

  const prevMatches = previous !== null && getWorkspaceGroupKey(previous) === activeGroupKey;
  const nextMatches = next !== null && getWorkspaceGroupKey(next) === activeGroupKey;
  if (!prevMatches && !nextMatches) {
    return insertionIndex;
  }

  const overCenterY = overTop + overHeight / 2;
  if (Math.abs(pointerY - overCenterY) > WORKSPACE_DND_GROUP_SNAP_DISTANCE_PX) {
    return insertionIndex;
  }

  return pointerY < overCenterY ? Math.max(0, overIndex) : Math.min(roots.length, overIndex + 1);
}

function resolveR4InsertionIndex(
  roots: ReadonlyArray<WorkspaceRoot>,
  activeIndex: number,
  activeGroupKey: string,
  insertionIndex: number
): number {
  const clamped = clampInsertionIndex(insertionIndex, roots.length);
  const near = clamped === roots.length ? roots.length - 1 : clamped;
  const range = findContiguousGroupRange(roots, activeGroupKey, near);
  if (range === null) {
    return clamped;
  }

  if (activeIndex < range.start) {
    return range.start;
  }
  if (activeIndex > range.end) {
    return range.end + 1;
  }
  return clamped;
}

function insertionIndexToTargetIndex(
  insertionIndex: number,
  activeIndex: number,
  rootsLength: number
): number {
  const clampedInsertion = clampInsertionIndex(insertionIndex, rootsLength);
  if (clampedInsertion > activeIndex) {
    return Math.min(rootsLength - 1, clampedInsertion - 1);
  }
  return Math.max(0, clampedInsertion);
}

export function resolveWorkspaceDropTargetIndex(input: WorkspaceDropInput): number {
  const activeIndex = findIndexById(input.roots, input.activeId);
  const overIndex = findIndexById(input.roots, input.overId);
  if (activeIndex < 0 || overIndex < 0 || input.roots.length <= 1) {
    return -1;
  }

  const activeRoot = input.roots[activeIndex]!;
  const activeGroupKey = getWorkspaceGroupKey(activeRoot);

  const r1 = resolveR1InsertionIndex(overIndex, input.pointerY, input.overTop, input.overHeight);
  const r2 = resolveR2InsertionIndex(
    activeIndex,
    overIndex,
    input.pointerY,
    input.overTop,
    input.overHeight,
    input.now,
    {
      overId: input.hoverState.overId === input.overId ? String(overIndex) : null,
      enteredAt: input.hoverState.enteredAt,
    }
  );

  const baseInsertion = r2 ?? r1;
  const r3 = resolveR3InsertionIndex(
    input.roots,
    activeGroupKey,
    baseInsertion,
    input.pointerY,
    overIndex,
    input.overTop,
    input.overHeight
  );
  const r4 = resolveR4InsertionIndex(input.roots, activeIndex, activeGroupKey, r3);

  return insertionIndexToTargetIndex(r4, activeIndex, input.roots.length);
}
