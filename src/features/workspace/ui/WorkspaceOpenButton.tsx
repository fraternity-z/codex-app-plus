import { useCallback, useRef, useState } from "react";
import type { HostBridge, WorkspaceOpener } from "../../../bridge/types";
import terminalIconUrl from "../../../assets/official/apps/microsoft-terminal.png";
import vscodeIconUrl from "../../../assets/official/apps/vscode.png";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

const OPEN_TEXT = "\u6253\u5f00";
const OPEN_METHODS_TEXT = "\u6253\u5f00\u65b9\u5f0f";
const SELECT_OPEN_METHOD_TEXT = "\u9009\u62e9\u6253\u5f00\u65b9\u5f0f";
const CURRENT_WORKSPACE_TEXT = "\u5f53\u524d\u5de5\u4f5c\u533a";
const WINDOWS_DRIVE_SEGMENT_PATTERN = /^[A-Za-z]:$/;

interface WorkspaceOpenButtonProps {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly selectedOpener: WorkspaceOpener;
  readonly onSelectOpener: (opener: WorkspaceOpener) => void;
}

interface WorkspaceOpenerOption {
  readonly id: WorkspaceOpener;
  readonly label: string;
  readonly renderIcon: (className: string) => JSX.Element;
}

function ImageOptionIcon(props: {
  readonly className: string;
  readonly src: string;
}): JSX.Element {
  return <img className={props.className} src={props.src} alt="" />;
}

function VisualStudioOptionIcon(props: { readonly className: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#6B4CE6" d="M20.28 3.71a1.2 1.2 0 0 1 .72 1.1v14.38a1.2 1.2 0 0 1-.72 1.1l-8.66 3.65a1.2 1.2 0 0 1-1.26-.2l-4.28-3.87-2.89 1.47A.8.8 0 0 1 2 20.62V3.38a.8.8 0 0 1 1.15-.72l2.93 1.49 4.26-3.87a1.2 1.2 0 0 1 1.27-.2Zm-8.44 4.07L7.92 12l3.92 4.22 6.16 2.63V5.15Z" />
    </svg>
  );
}

function GitHubDesktopOptionIcon(props: { readonly className: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#8250DF" />
      <path
        fill="#FFF"
        d="M12 6.45a5.55 5.55 0 0 0-1.76 10.81v-1.88c-1.16.25-1.48-.49-1.59-.79-.06-.17-.3-.72-.5-.86-.17-.09-.41-.33-.01-.34.38-.01.66.35.75.5.44.73 1.14.52 1.42.4.04-.32.17-.53.3-.66-1.03-.12-2.1-.52-2.1-2.32 0-.52.18-.95.49-1.29-.05-.12-.22-.62.05-1.29 0 0 .4-.13 1.32.49.38-.11.79-.17 1.2-.17.41 0 .82.06 1.2.17.92-.63 1.32-.49 1.32-.49.27.67.1 1.17.05 1.29.3.34.49.77.49 1.29 0 1.81-1.08 2.2-2.11 2.32.17.14.32.41.32.83v2.01A5.55 5.55 0 0 0 12 6.45Z"
      />
    </svg>
  );
}

function FileExplorerOptionIcon(props: { readonly className: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F2B01E" d="M3 7.6A1.6 1.6 0 0 1 4.6 6h4.3c.46 0 .89.2 1.2.54l.9 1.06h8.4A1.6 1.6 0 0 1 21 9.2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path fill="#FFD45C" d="M3 9.1h18v2.2H3Z" />
      <path fill="#0B84F3" d="M7 12.7h10v4.1H7Z" />
    </svg>
  );
}

function GitBashOptionIcon(props: { readonly className: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.4" y="2.8" width="6.2" height="6.2" rx="1.1" transform="rotate(45 6.4 2.8)" fill="#4AA3FF" />
      <rect x="11" y="7.4" width="6.2" height="6.2" rx="1.1" transform="rotate(45 11 7.4)" fill="#F35BA7" />
      <rect x="6.4" y="12" width="6.2" height="6.2" rx="1.1" transform="rotate(45 6.4 12)" fill="#FFD24D" />
      <rect x="11" y="16.6" width="6.2" height="6.2" rx="1.1" transform="rotate(45 11 16.6)" fill="#7CD992" />
    </svg>
  );
}

const WORKSPACE_OPENER_OPTIONS = [
  {
    id: "vscode",
    label: "VS Code",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={vscodeIconUrl} />
  },
  {
    id: "visualStudio",
    label: "Visual Studio",
    renderIcon: (className: string) => <VisualStudioOptionIcon className={className} />
  },
  {
    id: "githubDesktop",
    label: "GitHub Desktop",
    renderIcon: (className: string) => <GitHubDesktopOptionIcon className={className} />
  },
  {
    id: "explorer",
    label: "File Explorer",
    renderIcon: (className: string) => <FileExplorerOptionIcon className={className} />
  },
  {
    id: "terminal",
    label: "Terminal",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={terminalIconUrl} />
  },
  {
    id: "gitBash",
    label: "Git Bash",
    renderIcon: (className: string) => <GitBashOptionIcon className={className} />
  }
] as const satisfies ReadonlyArray<WorkspaceOpenerOption>;

function assertSelectedRootPath(selectedRootPath: string | null): string {
  if (selectedRootPath === null) {
    throw new Error("\u6253\u5f00\u5de5\u4f5c\u533a\u524d\u5fc5\u987b\u5148\u9009\u62e9\u4e00\u4e2a\u5de5\u4f5c\u533a\u3002");
  }
  return selectedRootPath;
}

function encodeFileUrlPath(path: string): string {
  return path
    .replace(/\\+/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment, index) => {
      if (index === 0 && WINDOWS_DRIVE_SEGMENT_PATTERN.test(segment)) {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}

function createVsCodeWorkspaceUrl(path: string): string {
  return `vscode://file/${encodeFileUrlPath(path)}`;
}

function findWorkspaceOpenerOption(opener: WorkspaceOpener): WorkspaceOpenerOption {
  return WORKSPACE_OPENER_OPTIONS.find((option) => option.id === opener) ?? WORKSPACE_OPENER_OPTIONS[0];
}

function WorkspaceOpenMenu(props: {
  readonly selectedOpener: WorkspaceOpener;
  readonly onSelectOpener: (opener: WorkspaceOpener) => void;
}): JSX.Element {
  return (
    <div className="toolbar-split-menu" role="menu" aria-label={OPEN_METHODS_TEXT}>
      <div className="toolbar-menu-title">{OPEN_METHODS_TEXT}</div>
      <div className="toolbar-menu-list">
        {WORKSPACE_OPENER_OPTIONS.map((option) => {
          const selected = option.id === props.selectedOpener;
          const className = selected ? "toolbar-menu-item toolbar-menu-item-active" : "toolbar-menu-item";
          return (
            <button
              key={option.id}
              type="button"
              className={className}
              role="menuitemradio"
              aria-checked={selected}
              aria-label={option.label}
              onClick={() => props.onSelectOpener(option.id)}
            >
              {option.renderIcon("toolbar-menu-icon")}
              <span className="toolbar-menu-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceOpenButton(props: WorkspaceOpenButtonProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canOpenWorkspace = props.selectedRootPath !== null;
  const selectedOption = findWorkspaceOpenerOption(props.selectedOpener);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu);

  const openSelectedWorkspace = useCallback(async () => {
    const selectedRootPath = assertSelectedRootPath(props.selectedRootPath);

    try {
      if (props.selectedOpener === "vscode") {
        await props.hostBridge.app.openExternal(createVsCodeWorkspaceUrl(selectedRootPath));
        return;
      }
      if (props.selectedOpener === "explorer") {
        await props.hostBridge.app.openExternal(selectedRootPath);
        return;
      }
      await props.hostBridge.app.openWorkspace({
        path: selectedRootPath,
        opener: props.selectedOpener
      });
    } catch (error) {
      console.error(`Failed to open workspace with ${selectedOption.label}`, error);
      window.alert(`${selectedOption.label}\u6253\u5f00\u5931\u8d25\uff1a${String(error)}`);
    }
  }, [props.hostBridge.app, props.selectedOpener, props.selectedRootPath, selectedOption.label]);

  const selectOpener = useCallback(
    (opener: WorkspaceOpener) => {
      props.onSelectOpener(opener);
      closeMenu();
    },
    [closeMenu, props.onSelectOpener]
  );

  return (
    <div className={menuOpen ? "toolbar-split toolbar-split-open" : "toolbar-split"} ref={containerRef}>
      <button
        type="button"
        className="toolbar-split-main"
        data-opener={props.selectedOpener}
        disabled={!canOpenWorkspace}
        aria-label={`\u4f7f\u7528 ${selectedOption.label} ${OPEN_TEXT}${CURRENT_WORKSPACE_TEXT}`}
        onClick={() => void openSelectedWorkspace()}
      >
        {selectedOption.renderIcon("toolbar-app-icon")}
        <span className="toolbar-split-main-text">{OPEN_TEXT}</span>
      </button>
      <button
        type="button"
        className="toolbar-split-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={SELECT_OPEN_METHOD_TEXT}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <OfficialChevronRightIcon className="toolbar-caret-icon" />
      </button>
      {menuOpen ? <WorkspaceOpenMenu selectedOpener={props.selectedOpener} onSelectOpener={selectOpener} /> : null}
    </div>
  );
}
