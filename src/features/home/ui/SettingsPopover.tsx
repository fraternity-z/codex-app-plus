import { useState } from "react";
import type { AuthStatus, AccountSummary } from "../../../domain/types";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { AppServerClient } from "../../../protocol/appServerClient";
import { createLanguageOptions, useI18n } from "../../../i18n";
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

function selectedLanguageLabel(
  language: ReturnType<typeof useI18n>["language"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  const options = createLanguageOptions(t);
  return options.find((option) => option.value === language)?.label ?? options[0]!.label;
}

export function SettingsPopover(props: SettingsPopoverProps): JSX.Element {
  const { language, setLanguage, t } = useI18n();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const showLogin = props.authStatus !== "authenticated";
  const languageOptions = createLanguageOptions(t);
  const currentLanguageLabel = selectedLanguageLabel(language, t);
  const toggleLanguageMenu = () => setLanguageMenuOpen((openValue) => !openValue);

  return (
    <div className="settings-popover" role="menu" aria-label={t("home.settingsPopover.menuLabel")}>
      <div className="settings-popover-status">● {authStatusLabel(props.authStatus, props.authMode, props.account, t)}</div>
      <button type="button" className="settings-popover-item" onClick={props.onOpenSettings}>
        <span>{"\u2699 "}{t("home.settingsPopover.settings.action")}</span>
      </button>
      {props.authStatus === "authenticated" ? (
        <AccountLimitsSection rateLimits={props.rateLimits} />
      ) : null}
      <button
        type="button"
        className="settings-popover-item"
        aria-haspopup="menu"
        aria-expanded={languageMenuOpen}
        onClick={toggleLanguageMenu}
      >
        <span>{"\u25cf "}{t("home.settingsPopover.language.action")}</span>
        <span>{`${currentLanguageLabel} ${languageMenuOpen ? "\u2039" : "\u203a"}`}</span>
      </button>
      {languageMenuOpen ? (
        <div className="settings-popover-submenu" role="menu" aria-label={t("home.settingsPopover.language.action")}>
          {languageOptions.map((option) => {
            const selected = option.value === language;
            const className = selected
              ? "settings-popover-submenu-item settings-popover-submenu-item-active"
              : "settings-popover-submenu-item";
            return (
              <button
                key={option.value}
                type="button"
                className={className}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setLanguage(option.value);
                  setLanguageMenuOpen(false);
                }}
              >
                <span className="settings-popover-submenu-check">{selected ? "\u2713" : ""}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {showLogin ? (
        <button type="button" className="settings-popover-item" onClick={() => void props.onLogin()} disabled={props.authBusy}>
          <span>{props.authLoginPending ? `\u2192 ${t("home.settingsPopover.login.pending")}` : `\u2192 ${t("home.settingsPopover.login.action")}`}</span>
        </button>
      ) : (
        <button type="button" className="settings-popover-item settings-popover-danger" onClick={() => void props.onLogout()} disabled={props.authBusy}>
          <span>{`\u2192 ${t("home.settingsPopover.logout.action")}`}</span>
        </button>
      )}
    </div>
  );
}
