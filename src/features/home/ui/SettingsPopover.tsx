import type { AuthStatus } from "../../../domain/types";
import "../../../styles/replica/replica-settings-popover.css";

interface SettingsPopoverProps {
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
  readonly onOpenSettings: () => void;
  readonly onLogin: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
}

function authStatusLabel(status: AuthStatus, mode: string | null): string {
  if (status === "authenticated") {
    if (mode === "chatgpt") return "已通过 ChatGPT 登录";
    if (mode === "apikey") return "已通过 API Key 登录";
    return "已登录";
  }
  if (status === "needs_login") {
    return "未登录";
  }
  return "鉴权状态未知";
}

export function SettingsPopover(props: SettingsPopoverProps): JSX.Element {
  const showLogin = props.authStatus !== "authenticated";

  return (
    <div className="settings-popover" role="menu" aria-label="设置菜单">
      <div className="settings-popover-status">● {authStatusLabel(props.authStatus, props.authMode)}</div>
      <button type="button" className="settings-popover-item" onClick={props.onOpenSettings}>
        <span>⚙ 设置</span>
      </button>
      <button type="button" className="settings-popover-item" disabled>
        <span>● 语言</span>
        <span>›</span>
      </button>
      {showLogin ? (
        <button type="button" className="settings-popover-item" onClick={() => void props.onLogin()} disabled={props.authBusy}>
          <span>{props.authLoginPending ? "→ 正在登录…" : "→ 登录 ChatGPT"}</span>
        </button>
      ) : (
        <button type="button" className="settings-popover-item settings-popover-danger" onClick={() => void props.onLogout()} disabled={props.authBusy}>
          <span>→ 退出登录</span>
        </button>
      )}
    </div>
  );
}
