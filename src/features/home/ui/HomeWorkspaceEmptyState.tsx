import { useCallback, useRef, useState } from "react";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";

const WORKSPACE_MENU_LABEL = "选择工作区";

interface HomeWorkspaceEmptyStateProps {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly onSelectRoot: (rootId: string) => void;
}

function WorkspaceSelectorMenu(props: {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly onSelectRoot: (rootId: string) => void;
}): JSX.Element {
  return (
    <div className="workspace-selector-menu" role="menu" aria-label={WORKSPACE_MENU_LABEL}>
      {props.roots.map((root) => {
        const selected = root.id === props.selectedRootId;
        const className = selected
          ? "workspace-selector-item workspace-selector-item-active"
          : "workspace-selector-item";
        return (
          <button
            key={root.id}
            type="button"
            className={className}
            role="menuitemradio"
            aria-checked={selected}
            aria-label={root.name}
            onClick={() => props.onSelectRoot(root.id)}
          >
            <span className="workspace-selector-item-copy">
              <span className="workspace-selector-item-title">{root.name}</span>
              <span className="workspace-selector-item-path">{root.path}</span>
            </span>
            <span className="workspace-selector-item-indicator" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function HomeWorkspaceEmptyState(props: HomeWorkspaceEmptyStateProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasSelectableRoots = props.roots.length > 0;
  const selectorClassName = props.selectedRootPath === null
    ? "workspace-selector workspace-selector-placeholder"
    : "workspace-selector";
  const title = props.selectedRootPath === null ? "Get started" : "Current workspace";
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu);

  const toggleMenu = useCallback(() => {
    if (!hasSelectableRoots) {
      return;
    }
    setMenuOpen((current) => !current);
  }, [hasSelectableRoots]);

  const selectRoot = useCallback((rootId: string) => {
    props.onSelectRoot(rootId);
    closeMenu();
  }, [closeMenu, props.onSelectRoot]);

  return (
    <main className="main-canvas">
      <div className="empty-state" aria-label="工作区空状态">
        <h2 className="empty-title">{title}</h2>
        <div className="workspace-selector-shell" ref={containerRef}>
          <button
            type="button"
            className={selectorClassName}
            aria-haspopup={hasSelectableRoots ? "menu" : undefined}
            aria-expanded={hasSelectableRoots ? menuOpen : undefined}
            aria-label={`${WORKSPACE_MENU_LABEL}：${props.selectedRootName}`}
            disabled={!hasSelectableRoots}
            onClick={toggleMenu}
          >
            <span className="workspace-selector-label">{props.selectedRootName}</span>
            <OfficialChevronRightIcon className="workspace-selector-caret" />
          </button>
          {menuOpen ? (
            <WorkspaceSelectorMenu
              roots={props.roots}
              selectedRootId={props.selectedRootId}
              onSelectRoot={selectRoot}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
