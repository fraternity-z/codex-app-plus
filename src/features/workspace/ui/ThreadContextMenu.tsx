import { useCallback, useRef, useState } from "react";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

interface ThreadContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly canArchive: boolean;
  readonly onArchive: () => Promise<void>;
  readonly onDelete: () => Promise<void>;
  readonly onClose: () => void;
}

type PendingAction = "archive" | "delete" | null;

function getActionLabel(action: PendingAction): string {
  if (action === "archive") {
    return "归档中...";
  }
  if (action === "delete") {
    return "删除中...";
  }
  return "";
}

export function ThreadContextMenu(props: ThreadContextMenuProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const closeOverlay = useCallback(() => {
    if (pendingAction === null) {
      props.onClose();
    }
  }, [pendingAction, props]);

  const runAction = useCallback(async (action: Exclude<PendingAction, null>, handler: () => Promise<void>) => {
    if (pendingAction !== null) {
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
    <div ref={containerRef} className="thread-context-menu" style={{ left: props.x, top: props.y }} role="menu" aria-label="会话操作菜单">
      {props.canArchive ? (
        <button type="button" className="thread-context-menu-item" role="menuitem" onClick={() => void runAction("archive", props.onArchive)} disabled={pendingAction !== null}>
          {pendingAction === "archive" ? getActionLabel(pendingAction) : "归档会话"}
        </button>
      ) : null}
      <button
        type="button"
        className="thread-context-menu-item thread-context-menu-item-danger"
        role="menuitem"
        onClick={() => void runAction("delete", props.onDelete)}
        disabled={pendingAction !== null}
      >
        {pendingAction === "delete" ? getActionLabel(pendingAction) : "删除会话"}
      </button>
    </div>
  );
}