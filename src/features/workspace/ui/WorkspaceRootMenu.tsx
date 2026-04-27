import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/useI18n";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

interface WorkspaceRootMenuProps {
  readonly rootName: string;
  readonly x: number;
  readonly y: number;
  readonly canDeleteWorktree?: boolean;
  readonly onClose: () => void;
  readonly onRemove: () => void | Promise<void>;
  readonly onOpenInFileExplorer?: () => void | Promise<void>;
  readonly onCreateWorktree?: () => void | Promise<void>;
  readonly onDeleteWorktree?: () => void | Promise<void>;
  readonly onCleanupSessions?: () => void | Promise<void>;
}

type WorkspaceRootMenuAction = "openInFileExplorer" | "remove" | "createWorktree" | "deleteWorktree" | "cleanupSessions";

export function WorkspaceRootMenu(props: WorkspaceRootMenuProps): JSX.Element {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingAction, setPendingAction] = useState<WorkspaceRootMenuAction | null>(null);

  const closeOverlay = useCallback(() => {
    if (pendingAction === null) {
      props.onClose();
    }
  }, [pendingAction, props]);

  const runAction = useCallback(async (
    action: WorkspaceRootMenuAction,
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

  const menu = (
    <div ref={containerRef} className="thread-context-menu workspace-root-menu" style={{ left: props.x, top: props.y }} role="menu" aria-label={t("home.workspaceSection.rootMoreAria", { name: props.rootName })}>
      {props.onOpenInFileExplorer ? (
        <button type="button" className="thread-context-menu-item" role="menuitem" onClick={() => void runAction("openInFileExplorer", props.onOpenInFileExplorer)} disabled={pendingAction !== null}>
          {pendingAction === "openInFileExplorer" ? t("home.workspaceSection.openingInFileExplorer") : t("home.workspaceSection.openInFileExplorer")}
        </button>
      ) : null}
      {props.onCreateWorktree ? (
        <button type="button" className="thread-context-menu-item" role="menuitem" onClick={() => void runAction("createWorktree", props.onCreateWorktree)} disabled={pendingAction !== null}>
          {pendingAction === "createWorktree" ? t("home.workspaceSection.creatingWorktree") : t("home.workspaceSection.createWorktree")}
        </button>
      ) : null}
      {props.onCleanupSessions ? (
        <button type="button" className="thread-context-menu-item thread-context-menu-item-danger" role="menuitem" onClick={() => void runAction("cleanupSessions", props.onCleanupSessions)} disabled={pendingAction !== null}>
          {pendingAction === "cleanupSessions" ? t("home.workspaceSection.cleaningSessions") : t("home.workspaceSection.cleanupSessions")}
        </button>
      ) : null}
      {props.canDeleteWorktree && props.onDeleteWorktree ? (
        <button type="button" className="thread-context-menu-item thread-context-menu-item-danger" role="menuitem" onClick={() => void runAction("deleteWorktree", props.onDeleteWorktree)} disabled={pendingAction !== null}>
          {pendingAction === "deleteWorktree" ? t("home.workspaceSection.deletingWorktree") : t("home.workspaceSection.deleteWorktree")}
        </button>
      ) : null}
      <button type="button" className="thread-context-menu-item thread-context-menu-item-danger" role="menuitem" onClick={() => void runAction("remove", props.onRemove)} disabled={pendingAction !== null}>
        {pendingAction === "remove" ? t("home.workspaceSection.removingRoot") : t("home.workspaceSection.removeRoot")}
      </button>
    </div>
  );

  return <>{typeof document === "undefined" ? menu : createPortal(menu, document.body)}</>;
}
