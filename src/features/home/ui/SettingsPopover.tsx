import type { SVGProps } from "react";
import type { AuthStatus, AccountSummary } from "../../../domain/types";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { AppServerClient } from "../../../protocol/appServerClient";
import { useI18n } from "../../../i18n";
import { OfficialSettingsGearIcon } from "../../shared/ui/officialIcons";
import { AccountLimitsSection } from "./AccountLimitsSection";
import "../../../styles/replica/replica-settings-popover.css";

interface SettingsPopoverProps {
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
  readonly rateLimits: RateLimitSnapshot | null;
  readonly account: AccountSummary | null;
  readonly appServerClient: AppServerClient;
  readonly onOpenSettings: () => void;
  readonly onLogin: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
}

function authStatusLabel(
  status: AuthStatus,
  mode: string | null,
  account: AccountSummary | null,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (status === "authenticated") {
    if (mode === "chatgpt" && account?.email) {
      return account.email;
    }
    if (mode === "chatgpt") return t("home.settingsPopover.authStatus.chatgpt");
    if (mode === "apikey") return t("home.settingsPopover.authStatus.apiKey");
    return t("home.settingsPopover.authStatus.authenticated");
  }
  if (status === "needs_login") {
    return t("home.settingsPopover.authStatus.needsLogin");
  }
  return t("home.settingsPopover.authStatus.unknown");
}

function SettingsPopoverUserIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path
        d="M9 1.875C5.065 1.875 1.875 5.065 1.875 9S5.065 16.125 9 16.125 16.125 12.935 16.125 9 12.935 1.875 9 1.875Zm0 3.55a2.275 2.275 0 1 1 0 4.55 2.275 2.275 0 0 1 0-4.55Zm0 9.4a5.77 5.77 0 0 1-3.975-1.584c.446-1.238 1.991-2.19 3.975-2.19s3.529.952 3.975 2.19A5.77 5.77 0 0 1 9 14.825Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsPopoverGaugeIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path
        d="M3.45 12.45a6.2 6.2 0 1 1 11.1 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M9 12.25 12.4 7.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M8.05 12.45a.95.95 0 1 0 1.9 0 .95.95 0 0 0-1.9 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsPopoverLogoutIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path
        d="M7.25 3.25H4.75c-.69 0-1.25.56-1.25 1.25v9c0 .69.56 1.25 1.25 1.25h2.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 5.75 13.5 9l-3.25 3.25"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.35 9H7.25"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SettingsPopover(props: SettingsPopoverProps): JSX.Element {
  const { t } = useI18n();
  const showLogin = props.authStatus !== "authenticated";
  const accountStatus = authStatusLabel(props.authStatus, props.authMode, props.account, t);

  return (
    <div className="settings-popover" role="menu" aria-label={t("home.settingsPopover.menuLabel")}>
      <div className="settings-popover-row settings-popover-status" title={accountStatus}>
        <SettingsPopoverUserIcon className="settings-popover-icon" />
        <span>{accountStatus}</span>
      </div>
      <div className="settings-popover-row settings-popover-account">
        <OfficialSettingsGearIcon className="settings-popover-icon" />
        <span>{t("home.settingsPopover.authStatus.accountLabel")}</span>
      </div>
      <div className="settings-popover-separator" role="separator" />
      <button type="button" className="settings-popover-item" onClick={props.onOpenSettings}>
        <span className="settings-popover-item-left">
          <OfficialSettingsGearIcon className="settings-popover-icon" />
          <span>{t("home.settingsPopover.settings.action")}</span>
        </span>
      </button>
      <div className="settings-popover-separator" role="separator" />
      {props.authStatus === "authenticated" ? (
        <AccountLimitsSection
          rateLimits={props.rateLimits}
          leadingIcon={<SettingsPopoverGaugeIcon className="settings-popover-icon" />}
        />
      ) : null}
      {showLogin ? (
        <button type="button" className="settings-popover-item" onClick={() => void props.onLogin()} disabled={props.authBusy}>
          <span className="settings-popover-item-left">
            <SettingsPopoverLogoutIcon className="settings-popover-icon" />
            <span>{props.authLoginPending ? t("home.settingsPopover.login.pending") : t("home.settingsPopover.login.action")}</span>
          </span>
        </button>
      ) : (
        <button type="button" className="settings-popover-item settings-popover-danger" onClick={() => void props.onLogout()} disabled={props.authBusy}>
          <span className="settings-popover-item-left">
            <SettingsPopoverLogoutIcon className="settings-popover-icon" />
            <span>{t("home.settingsPopover.logout.action")}</span>
          </span>
        </button>
      )}
    </div>
  );
}
