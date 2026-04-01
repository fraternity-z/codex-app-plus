import { useCallback, useState, type MouseEvent } from "react";
import type { WorkspaceRoot } from "../hooks/useWorkspaceRoots";

const ROOT_MENU_WIDTH_PX = 168;
const ROOT_MENU_OFFSET_PX = 6;
const VIEWPORT_PADDING_PX = 8;

export interface WorkspaceRootMenuState {
  readonly root: WorkspaceRoot;
  readonly x: number;
  readonly y: number;
}

function createRootMenuPosition(button: HTMLButtonElement): Pick<WorkspaceRootMenuState, "x" | "y"> {
  const bounds = button.getBoundingClientRect();
  const preferredX = bounds.right - ROOT_MENU_WIDTH_PX;
  const maxX = window.innerWidth - ROOT_MENU_WIDTH_PX - VIEWPORT_PADDING_PX;
  return {
    x: Math.max(VIEWPORT_PADDING_PX, Math.min(preferredX, maxX)),
    y: Math.max(VIEWPORT_PADDING_PX, bounds.bottom + ROOT_MENU_OFFSET_PX),
  };
}

export function useWorkspaceRootMenuState(options: {
  readonly onRemoveRoot: (rootId: string) => void;
  readonly onCreateWorktree?: (root: WorkspaceRoot) => void | Promise<void>;
  readonly onDeleteWorktree?: (root: WorkspaceRoot) => void | Promise<void>;
  readonly isWorktree?: (root: WorkspaceRoot) => boolean;
}) {
  const [menuState, setMenuState] = useState<WorkspaceRootMenuState | null>(null);

  const openMenu = useCallback((event: MouseEvent<HTMLButtonElement>, root: WorkspaceRoot) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuState({ root, ...createRootMenuPosition(event.currentTarget) });
  }, []);

  const closeMenu = useCallback(() => setMenuState(null), []);
  const handleRemoveRoot = useCallback(() => {
    if (menuState === null) {
      return;
    }
    options.onRemoveRoot(menuState.root.id);
    closeMenu();
  }, [closeMenu, menuState, options]);

  const handleCreateWorktree = useCallback(async () => {
    if (menuState === null || options.onCreateWorktree === undefined) {
      return;
    }
    await options.onCreateWorktree(menuState.root);
    closeMenu();
  }, [closeMenu, menuState, options]);

  const handleDeleteWorktree = useCallback(async () => {
    if (menuState === null || options.onDeleteWorktree === undefined) {
      return;
    }
    await options.onDeleteWorktree(menuState.root);
    closeMenu();
  }, [closeMenu, menuState, options]);

  return {
    menuState,
    openMenu,
    closeMenu,
    handleRemoveRoot,
    handleCreateWorktree,
    handleDeleteWorktree,
    canDeleteWorktree: menuState !== null && (options.isWorktree?.(menuState.root) ?? false),
  };
}
