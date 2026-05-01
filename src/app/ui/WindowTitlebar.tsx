import { Suspense, lazy, type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import type { AppUpdateState } from "../../domain/types";
import {
  OfficialCloseIcon,
  OfficialSidebarToggleIcon,
} from "../../features/shared";

const WINDOW_CONTROL_SELECTOR = "[data-window-control='true']";
const BYTES_PER_KIB = 1_024;
const BYTES_PER_MIB = 1_048_576;

const LazyOpenSourceLicensesDialog = lazy(async () => {
  const module = await import("../../features/shared/ui/OpenSourceLicensesDialog");
  return { default: module.OpenSourceLicensesDialog };
});

interface WindowTitlebarSidebarControl {
  readonly collapsed: boolean;
  readonly collapseLabel: string;
  readonly expandLabel: string;
  readonly onToggle: () => void;
}

interface WindowTitlebarNavigationControl {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly onGoBack: () => void;
  readonly onGoForward: () => void;
}

interface WindowTitlebarAboutControl {
  readonly appUpdate: AppUpdateState;
  readonly onCheckForUpdate: () => Promise<void>;
  readonly onInstallUpdate: () => Promise<void>;
}

interface WindowTitlebarProps {
  readonly hostBridge: HostBridge;
  readonly aboutControl?: WindowTitlebarAboutControl | null;
  readonly navigationControl?: WindowTitlebarNavigationControl | null;
  readonly sidebarControl?: WindowTitlebarSidebarControl | null;
}

function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const platform = navigator.platform ?? "";
  const userAgent = navigator.userAgent ?? "";
  return /windows|win32|win64/i.test(`${platform} ${userAgent}`);
}

function ChromeButton(props: {
  readonly ariaLabel: string;
  readonly ariaPressed?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.className ?? "window-titlebar-button"}
      aria-label={props.ariaLabel}
      aria-pressed={props.ariaPressed}
      disabled={props.disabled}
      data-window-control="true"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function isWindowControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(WINDOW_CONTROL_SELECTOR) !== null;
}

function formatBytes(value: number): string {
  if (value >= BYTES_PER_MIB) {
    return `${(value / BYTES_PER_MIB).toFixed(1)} MB`;
  }
  if (value >= BYTES_PER_KIB) {
    return `${Math.round(value / BYTES_PER_KIB)} KB`;
  }
  return `${value} B`;
}

function formatCheckedAt(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createUpdateStatusLabel(appUpdate: AppUpdateState): string {
  if (appUpdate.status === "checking") {
    return "正在检查可用更新…";
  }
  if (appUpdate.status === "downloading" && appUpdate.nextVersion !== null) {
    return `发现新版本 ${appUpdate.nextVersion}，正在后台下载。`;
  }
  if (appUpdate.status === "downloaded" && appUpdate.nextVersion !== null) {
    return `新版本 ${appUpdate.nextVersion} 已下载完成，可以立即安装。`;
  }
  if (appUpdate.status === "installing") {
    return "正在安装更新并重启应用…";
  }
  if (appUpdate.status === "upToDate") {
    return "当前已经是最新版本。";
  }
  if (appUpdate.status === "error") {
    return "更新流程出现错误。";
  }
  return "当前会在启动后自动检查更新。";
}

function createProgressLabel(appUpdate: AppUpdateState): string | null {
  if (appUpdate.status !== "downloading") {
    return null;
  }
  if (appUpdate.totalBytes === null) {
    return `已下载 ${formatBytes(appUpdate.downloadedBytes)}`;
  }
  return `已下载 ${formatBytes(appUpdate.downloadedBytes)} / ${formatBytes(appUpdate.totalBytes)}`;
}

function isUpdateBusy(status: AppUpdateState["status"]): boolean {
  return status === "checking" || status === "downloading" || status === "installing";
}

function MinimizeIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.5 5.5h7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.8" y="1.8" width="6.4" height="6.4" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.05" />
    </svg>
  );
}

function BackIcon(): JSX.Element {
  return (
    <svg className="window-titlebar-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12H5.5M11.5 6L5.5 12L11.5 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForwardIcon(): JSX.Element {
  return (
    <svg className="window-titlebar-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12H18.5M12.5 6L18.5 12L12.5 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AboutDropdown(props: {
  readonly appUpdate: AppUpdateState;
  onCheckForUpdate: () => Promise<void>;
}): JSX.Element {
  const [licensesOpen, setLicensesOpen] = useState(false);
  const currentVersion = props.appUpdate.currentVersion ?? "未知版本";
  const checkedAt = formatCheckedAt(props.appUpdate.lastCheckedAt);
  const progressLabel = createProgressLabel(props.appUpdate);
  const progressPercent = props.appUpdate.progressPercent === null ? null : Math.round(props.appUpdate.progressPercent * 100);
  const checkBusy = isUpdateBusy(props.appUpdate.status);

  return (
    <div className="window-titlebar-about-popover" role="dialog" aria-label="关于">
      <div className="window-titlebar-about-popover-head">
        <strong>关于</strong>
        <p>查看当前桌面端版本信息，并在这里检查新版本。</p>
      </div>
      <div className="window-titlebar-about-popover-row">
        <span>当前版本</span>
        <strong>{currentVersion}</strong>
      </div>
      <div className="window-titlebar-about-popover-section">
        <div className="window-titlebar-about-popover-section-head">
          <div>
            <strong>应用更新</strong>
            <p>{createUpdateStatusLabel(props.appUpdate)}</p>
            {checkedAt !== null ? <p>最近检查：{checkedAt}</p> : null}
          </div>
          <button
            type="button"
            className="window-titlebar-popover-button"
            disabled={checkBusy}
            onClick={() => void props.onCheckForUpdate()}
          >
            {checkBusy ? "处理中…" : "检查更新"}
          </button>
        </div>
        {progressLabel !== null ? (
          <div className="window-titlebar-about-progress">
            <div className="window-titlebar-about-progress-meta">
              <span>{progressLabel}</span>
              <span>{progressPercent === null ? "..." : `${progressPercent}%`}</span>
            </div>
            <div className="window-titlebar-about-progress-bar" aria-hidden="true">
              <span
                className="window-titlebar-about-progress-fill"
                style={{ width: progressPercent === null ? "16%" : `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}
        {props.appUpdate.error !== null ? (
          <p className="window-titlebar-about-error">错误详情：{props.appUpdate.error}</p>
        ) : null}
        {props.appUpdate.notes !== null && props.appUpdate.notes.trim().length > 0 ? (
          <div className="window-titlebar-about-notes">
            <strong>版本说明</strong>
            <pre>{props.appUpdate.notes}</pre>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="window-titlebar-popover-button window-titlebar-popover-button-full"
        onClick={() => setLicensesOpen(true)}
      >
        查看许可
      </button>
      {licensesOpen ? (
        <Suspense fallback={null}>
          <LazyOpenSourceLicensesDialog
            open={licensesOpen}
            onClose={() => setLicensesOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export function WindowTitlebar(props: WindowTitlebarProps): JSX.Element | null {
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutContainerRef = useRef<HTMLDivElement | null>(null);
  const startWindowDragging = useCallback(() => {
    void props.hostBridge.app.startWindowDragging().catch((error: unknown) => {
      console.error("窗口拖拽启动失败", error);
    });
  }, [props.hostBridge.app]);
  const sendWindowAction = useCallback(
    (action: "minimize" | "toggleMaximize" | "close") => {
      void props.hostBridge.app.controlWindow(action).catch((error: unknown) => {
        console.error("窗口控制失败", error);
      });
    },
    [props.hostBridge.app]
  );
  const handleTitlebarMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.detail > 1 || isWindowControlTarget(event.target)) {
      return;
    }
    startWindowDragging();
  }, [startWindowDragging]);
  const handleTitlebarDoubleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (isWindowControlTarget(event.target)) {
      return;
    }
    sendWindowAction("toggleMaximize");
  }, [sendWindowAction]);

  useEffect(() => {
    if (!aboutOpen) {
      return;
    }
    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && aboutContainerRef.current?.contains(target)) {
        return;
      }
      setAboutOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAboutOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [aboutOpen]);

  if (!isWindowsPlatform()) {
    return null;
  }

  return (
    <header className="window-titlebar" onMouseDown={handleTitlebarMouseDown} onDoubleClick={handleTitlebarDoubleClick}>
      {props.sidebarControl ? (
        <ChromeButton
          ariaLabel={props.sidebarControl.collapsed ? props.sidebarControl.expandLabel : props.sidebarControl.collapseLabel}
          ariaPressed={props.sidebarControl.collapsed}
          className="window-titlebar-sidebar-toggle"
          onClick={props.sidebarControl.onToggle}
        >
          <OfficialSidebarToggleIcon className="window-titlebar-sidebar-icon" />
        </ChromeButton>
      ) : null}
      {props.navigationControl ? (
        <div className="window-titlebar-nav-group" data-window-control="true">
          <ChromeButton
            ariaLabel="返回上一页"
            className="window-titlebar-button window-titlebar-nav-button"
            disabled={!props.navigationControl.canGoBack}
            onClick={props.navigationControl.onGoBack}
          >
            <BackIcon />
          </ChromeButton>
          <ChromeButton
            ariaLabel="前进到下一页"
            className="window-titlebar-button window-titlebar-nav-button"
            disabled={!props.navigationControl.canGoForward}
            onClick={props.navigationControl.onGoForward}
          >
            <ForwardIcon />
          </ChromeButton>
        </div>
      ) : null}
      {props.aboutControl ? (
        <div className="window-titlebar-about-group" data-window-control="true" ref={aboutContainerRef}>
          <ChromeButton
            ariaLabel="打开关于"
            ariaPressed={aboutOpen}
            className={[
              "window-titlebar-text-button",
              aboutOpen ? "window-titlebar-text-button-active" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => setAboutOpen((open) => !open)}
          >
            <span className="window-titlebar-text-label">关于</span>
          </ChromeButton>
          {props.aboutControl.appUpdate.status === "downloaded" ? (
            <ChromeButton
              ariaLabel="升级安装"
              className="window-titlebar-text-button window-titlebar-text-button-primary"
              onClick={() => void props.aboutControl?.onInstallUpdate()}
            >
              <span className="window-titlebar-text-label">升级安装</span>
            </ChromeButton>
          ) : null}
          {aboutOpen ? (
            <AboutDropdown
              appUpdate={props.aboutControl.appUpdate}
              onCheckForUpdate={props.aboutControl.onCheckForUpdate}
            />
          ) : null}
        </div>
      ) : null}
      <div className="window-titlebar-drag-spacer" aria-hidden="true" />
      <div className="window-titlebar-controls" data-window-control="true">
        <ChromeButton ariaLabel="最小化窗口" onClick={() => sendWindowAction("minimize")}>
          <MinimizeIcon />
        </ChromeButton>
        <ChromeButton ariaLabel="最大化或还原窗口" onClick={() => sendWindowAction("toggleMaximize")}>
          <MaximizeIcon />
        </ChromeButton>
        <ChromeButton
          ariaLabel="关闭窗口"
          className="window-titlebar-button window-titlebar-button-close"
          onClick={() => sendWindowAction("close")}
        >
          <OfficialCloseIcon className="window-titlebar-close-icon" />
        </ChromeButton>
      </div>
    </header>
  );
}
