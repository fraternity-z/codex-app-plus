import { useCallback, useRef, useState } from "react";
import type { HostBridge, WorkspaceOpener } from "../../../bridge/types";
import { useI18n } from "../../../i18n/useI18n";
import fileExplorerIconUrl from "../../../assets/official/apps/file-explorer.png";
import gitBashIconUrl from "../../../assets/official/apps/git-bash.png";
import githubDesktopIconUrl from "../../../assets/official/apps/github-desktop.png";
import terminalIconUrl from "../../../assets/official/apps/microsoft-terminal.png";
import visualStudioIconUrl from "../../../assets/official/apps/visual-studio.png";
import vscodeIconUrl from "../../../assets/official/apps/vscode.png";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

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

const WORKSPACE_OPENER_OPTIONS = [
  {
    id: "vscode",
    label: "VS Code",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={vscodeIconUrl} />
  },
  {
    id: "visualStudio",
    label: "Visual Studio",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={visualStudioIconUrl} />
  },
  {
    id: "githubDesktop",
    label: "GitHub Desktop",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={githubDesktopIconUrl} />
  },
  {
    id: "explorer",
    label: "File Explorer",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={fileExplorerIconUrl} />
  },
  {
    id: "terminal",
    label: "Terminal",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={terminalIconUrl} />
  },
  {
    id: "gitBash",
    label: "Git Bash",
    renderIcon: (className: string) => <ImageOptionIcon className={className} src={gitBashIconUrl} />
  }
] as const satisfies ReadonlyArray<WorkspaceOpenerOption>;

function assertSelectedRootPath(selectedRootPath: string | null): string {
  if (selectedRootPath === null) {
    throw new Error("Select a workspace before opening it.");
  }
  return selectedRootPath;
}

function findWorkspaceOpenerOption(opener: WorkspaceOpener): WorkspaceOpenerOption {
  return WORKSPACE_OPENER_OPTIONS.find((option) => option.id === opener) ?? WORKSPACE_OPENER_OPTIONS[0];
}

function WorkspaceOpenMenu(props: {
  readonly selectedOpener: WorkspaceOpener;
  readonly onSelectOpener: (opener: WorkspaceOpener) => void;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="toolbar-split-menu" role="menu" aria-label={t("home.toolbar.openMethods")}>
      <div className="toolbar-menu-title">{t("home.toolbar.openMethods")}</div>
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
  const { t } = useI18n();
  const { notifyError } = useUiBannerNotifications("workspace-open");
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
        await props.hostBridge.app.openWorkspace({
          path: selectedRootPath,
          opener: props.selectedOpener
        });
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
      notifyError(t("home.toolbar.openFailed", { opener: selectedOption.label }), error);
    }
  }, [notifyError, props.hostBridge.app, props.selectedOpener, props.selectedRootPath, selectedOption.label, t]);

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
        aria-label={t("home.toolbar.openCurrentWorkspace", { opener: selectedOption.label })}
        onClick={() => void openSelectedWorkspace()}
      >
        {selectedOption.renderIcon("toolbar-app-icon")}
        <span className="toolbar-split-main-text">{t("home.toolbar.open")}</span>
      </button>
      <button
        type="button"
        className="toolbar-split-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t("home.toolbar.selectOpenMethod")}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <OfficialChevronRightIcon className="toolbar-caret-icon" />
      </button>
      {menuOpen ? <WorkspaceOpenMenu selectedOpener={props.selectedOpener} onSelectOpener={selectOpener} /> : null}
    </div>
  );
}
