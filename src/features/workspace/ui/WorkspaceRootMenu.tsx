import { useCallback, useRef, useState } from "react";
import { useI18n } from "../../../i18n/useI18n";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

interface WorkspaceRootMenuProps {
  readonly rootName: string;
  readonly x: number;
  readonly y: number;
  readonly canDeleteWorktree?: boolean;
  readonly onClose: () => void;
  readonly onRemove: () => void | Promise<void>;
  readonly onCreateWorktree?: () => void | Promise<void>;
  readonly onDeleteWorktree?: () => void | Promise<void>;
}

export function WorkspaceRootMenu(props: WorkspaceRootMenuProps): JSX.Element {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingAction, setPendingAction] = useState<"remove" | "createWorktree" | "deleteWorktree" | null>(null);

  const closeOverlay = useCallback(() => {
    if (pendingAction === null) {
      props.onClose();
    }
  }, [pendingAction, props]);

  const runAction = useCallback(async (
    action: "remove" | "createWorktree" | "deleteWorktree",
    handler: (() => void | Promise<void>) | undefined,
  ) => {
    if (pendingAction !== null || handler === undefined) {
      return;
    }
    setPendingAction(action);
    try {
      await handler();
      props.onClose();
    } catch (error) {
      setPendingAction(null);
      throw error;
    }
  }, [pendingAction, props]);

  useToolbarMenuDismissal(true, containerRef, closeOverlay);

  return (
    <div ref={containerRef} className="thread-context-menu workspace-root-menu" style={{ left: props.x, top: props.y }} role="menu" aria-label={t("home.workspaceSection.rootMoreAria", { name: props.rootName })}>
      {props.onCreateWorktree ? (
        <button type="button" className="thread-context-menu-item" role="menuitem" onClick={() => void runAction("createWorktree", props.onCreateWorktree)} disabled={pendingAction !== null}>
          {pendingAction === "createWorktree" ? "Creating..." : "Create worktree"}
        </button>
      ) : null}
      {props.canDeleteWorktree && props.onDeleteWorktree ? (
        <button type="button" className="thread-context-menu-item thread-context-menu-item-danger" role="menuitem" onClick={() => void runAction("deleteWorktree", props.onDeleteWorktree)} disabled={pendingAction !== null}>
          {pendingAction === "deleteWorktree" ? "Deleting..." : "Delete worktree"}
        </button>
      ) : null}
      <button type="button" className="thread-context-menu-item thread-context-menu-item-danger" role="menuitem" onClick={() => void runAction("remove", props.onRemove)} disabled={pendingAction !== null}>
        {pendingAction === "remove" ? "Removing..." : "Remove from list"}
      </button>
    </div>
  );
}
