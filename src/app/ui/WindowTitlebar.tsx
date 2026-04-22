import { type MouseEvent, useCallback } from "react";
import type { HostBridge } from "../../bridge/types";
import {
  OfficialCloseIcon,
  OfficialSidebarToggleIcon,
} from "../../features/shared/ui/officialIcons";

const WINDOW_CONTROL_SELECTOR = "[data-window-control='true']";

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

interface WindowTitlebarProps {
  readonly hostBridge: HostBridge;
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
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function isWindowControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(WINDOW_CONTROL_SELECTOR) !== null;
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
    <svg className="window-titlebar-nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 8H3M3 8L7 4M3 8L7 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ForwardIcon(): JSX.Element {
  return (
    <svg className="window-titlebar-nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WindowTitlebar(props: WindowTitlebarProps): JSX.Element | null {
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
