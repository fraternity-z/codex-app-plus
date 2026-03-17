import { useCallback, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import { OfficialCloseIcon, OfficialCodexMarkIcon } from "../../features/shared/ui/officialIcons";
import appIconUrl from "../../../src-tauri/icons/32x32.png";

const APP_TITLE = "Codex App Plus";

interface WindowTitlebarProps {
  readonly hostBridge: HostBridge;
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
  readonly className?: string;
  readonly onClick: () => void;
  readonly children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.className ?? "window-titlebar-button"}
      aria-label={props.ariaLabel}
      data-tauri-drag-region="false"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
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

export function WindowTitlebar(props: WindowTitlebarProps): JSX.Element | null {
  const [iconFailed, setIconFailed] = useState(false);
  const sendWindowAction = useCallback(
    (action: "minimize" | "toggleMaximize" | "close") => {
      void props.hostBridge.app.controlWindow(action).catch((error: unknown) => {
        console.error("窗口控制失败", error);
      });
    },
    [props.hostBridge.app]
  );

  if (!isWindowsPlatform()) {
    return null;
  }

  return (
    <header className="window-titlebar" data-tauri-drag-region onDoubleClick={() => sendWindowAction("toggleMaximize")}>
      <div className="window-titlebar-brand" data-tauri-drag-region>
        {iconFailed ? (
          <OfficialCodexMarkIcon className="window-titlebar-logo" />
        ) : (
          <img
            className="window-titlebar-logo window-titlebar-logo-image"
            src={appIconUrl}
            alt=""
            onError={() => setIconFailed(true)}
          />
        )}
        <span className="window-titlebar-title">{APP_TITLE}</span>
      </div>
      <div className="window-titlebar-controls" data-tauri-drag-region="false">
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
