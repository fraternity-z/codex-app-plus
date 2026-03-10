import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useRef } from "react";
import type { ThreadSummary } from "../../domain/types";
import { useToolbarMenuDismissal } from "./useToolbarMenuDismissal";

interface ThreadContextMenuProps {
  readonly thread: ThreadSummary;
  readonly x: number;
  readonly y: number;
  readonly onDelete: () => Promise<void>;
  readonly onClose: () => void;
}

export function ThreadContextMenu(props: ThreadContextMenuProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  useToolbarMenuDismissal(true, containerRef, props.onClose);
  const handleDelete = useCallback(async () => {
    const title = props.thread.title.trim() || "未命名会话";
    const confirmed = await confirm(`确定删除会话“${title}”吗？删除后会从本地历史记录中永久移除。`);
    if (!confirmed) { props.onClose(); return; }
    await props.onDelete();
  }, [props]);

  return <div ref={containerRef} className="thread-context-menu" style={{ left: props.x, top: props.y }} role="menu" aria-label="会话操作菜单"><button type="button" className="thread-context-menu-item" role="menuitem" onClick={() => void handleDelete()}>删除会话</button></div>;
}
