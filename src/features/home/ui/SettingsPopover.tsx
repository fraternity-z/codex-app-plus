import { useState } from "react";
import type { AuthStatus } from "../../../domain/types";
import { createLanguageOptions, useI18n } from "../../../i18n";
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

function authStatusLabel(status: AuthStatus, mode: string | null, t: ReturnType<typeof useI18n>["t"]): string {
  if (status === "authenticated") {
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
  t: ReturnType<typeof useI18n>["t"]
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
      <div className="settings-popover-status">● {authStatusLabel(props.authStatus, props.authMode, t)}</div>
      <button type="button" className="settings-popover-item" onClick={props.onOpenSettings}>
        <span>⚙ {t("home.settingsPopover.settings.action")}</span>
      </button>
      <button
        type="button"
        className="settings-popover-item"
        aria-haspopup="menu"
        aria-expanded={languageMenuOpen}
        onClick={toggleLanguageMenu}
      >
        <span>● {t("home.settingsPopover.language.action")}</span>
        <span>{`${currentLanguageLabel} ${languageMenuOpen ? "‹" : "›"}`}</span>
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
                <span className="settings-popover-submenu-check">{selected ? "✓" : ""}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {showLogin ? (
        <button type="button" className="settings-popover-item" onClick={() => void props.onLogin()} disabled={props.authBusy}>
          <span>{props.authLoginPending ? `→ ${t("home.settingsPopover.login.pending")}` : `→ ${t("home.settingsPopover.login.action")}`}</span>
        </button>
      ) : (
        <button type="button" className="settings-popover-item settings-popover-danger" onClick={() => void props.onLogout()} disabled={props.authBusy}>
          <span>{`→ ${t("home.settingsPopover.logout.action")}`}</span>
        </button>
      )}
    </div>
  );
}
