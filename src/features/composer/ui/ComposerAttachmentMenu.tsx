import type { CollaborationPreset } from "../../../domain/timeline";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import { useI18n } from "../../../i18n/useI18n";
import { useEffect, useRef, useState } from "react";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { ComposerPlanModeIcon } from "./ComposerPlanModeIcon";

interface ComposerAttachmentMenuProps {
  readonly collaborationPreset: CollaborationPreset;
  readonly serviceTier: ServiceTier | null;
  readonly multiAgentAvailable: boolean;
  readonly multiAgentEnabled: boolean;
  readonly multiAgentDisabled: boolean;
  readonly onAddAttachments: () => Promise<void>;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onSelectServiceTier: (serviceTier: ServiceTier | null) => void;
  readonly onToggleMultiAgent: () => Promise<void>;
  readonly onClose: () => void;
}

export function ComposerAttachmentMenu(props: ComposerAttachmentMenuProps): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="composer-attachment-popover" role="menu" aria-label={t("home.composer.openAttachmentMenu")}>
      <button type="button" className="composer-attachment-item" role="menuitem" onClick={() => void props.onAddAttachments()}>
        <span className="composer-attachment-item-content"><AttachmentIcon className="composer-attachment-icon" /><span>{t("home.composer.addFilesAndPhotos")}</span></span>
      </button>
      <div className="composer-attachment-separator" />
      <div className="composer-attachment-group">
        <PlanModeRow collaborationPreset={props.collaborationPreset} onToggle={() => props.onSelectCollaborationPreset(toggleCollaborationPreset(props.collaborationPreset))} />
      </div>
      <ServiceTierFolder serviceTier={props.serviceTier} onSelectServiceTier={props.onSelectServiceTier} />
      {props.multiAgentAvailable ? (
        <>
          <div className="composer-attachment-separator" />
          <div className="composer-attachment-row">
            <span className="composer-attachment-item-content"><AgentsIcon className="composer-attachment-icon" /><span>Multi-agent</span></span>
            <button type="button" className={props.multiAgentEnabled ? "composer-attachment-toggle composer-attachment-toggle-on" : "composer-attachment-toggle"} role="switch" aria-label={t("home.composer.toggleMultiAgent")} aria-checked={props.multiAgentEnabled} disabled={props.multiAgentDisabled} onClick={() => void props.onToggleMultiAgent()}><span className="composer-attachment-toggle-knob" /></button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const SERVICE_TIER_CLOSE_DELAY_MS = 160;

function useDelayedSubmenuState(): {
  readonly open: boolean;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  readonly toggleMenu: () => void;
} {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => clearCloseTimer, []);

  return {
    open,
    openMenu: () => {
      clearCloseTimer();
      setOpen(true);
    },
    closeMenu: () => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        closeTimerRef.current = null;
      }, SERVICE_TIER_CLOSE_DELAY_MS);
    },
    toggleMenu: () => {
      clearCloseTimer();
      setOpen((value) => !value);
    }
  };
}

function MenuCheck(): JSX.Element {
  return (
    <span className="composer-attachment-service-check" aria-hidden="true">
      {"\u2713"}
    </span>
  );
}

function ServiceTierFolder(props: {
  readonly serviceTier: ServiceTier | null;
  readonly onSelectServiceTier: (serviceTier: ServiceTier | null) => void;
}): JSX.Element {
  const { t } = useI18n();
  const submenu = useDelayedSubmenuState();
  const open = submenu.open;
  const triggerClassName = open
    ? "composer-attachment-folder-trigger composer-attachment-folder-trigger-active"
    : "composer-attachment-folder-trigger";
  const submenuClassName = open
    ? "composer-attachment-service-menu composer-attachment-service-menu-open"
    : "composer-attachment-service-menu";

  return (
    <div className="composer-attachment-folder" onMouseEnter={submenu.openMenu} onMouseLeave={submenu.closeMenu}>
      <button
        type="button"
        className={triggerClassName}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={submenu.toggleMenu}
      >
        <span className="composer-attachment-folder-label">{t("home.composer.serviceTierMenuLabel")}</span>
        <OfficialChevronRightIcon className="composer-attachment-folder-caret" />
      </button>
      <div className={submenuClassName} role="menu" aria-label={t("home.composer.serviceTierMenuTitle")} aria-hidden={!open}>
        <div className="composer-attachment-service-title">{t("home.composer.serviceTierMenuTitle")}</div>
        <ServiceTierMenuItem
          label={t("home.composer.serviceTierStandard")}
          description={t("home.composer.serviceTierStandardDescription")}
          selected={props.serviceTier === null}
          onClick={() => props.onSelectServiceTier(null)}
        />
        <ServiceTierMenuItem
          label={t("home.composer.serviceTierFast")}
          description={t("home.composer.serviceTierFastDescription")}
          selected={props.serviceTier === "fast"}
          onClick={() => props.onSelectServiceTier("fast")}
        />
        <ServiceTierMenuItem
          label={t("home.composer.serviceTierFlex")}
          description={t("home.composer.serviceTierFlexDescription")}
          selected={props.serviceTier === "flex"}
          onClick={() => props.onSelectServiceTier("flex")}
        />
      </div>
    </div>
  );
}

function ServiceTierMenuItem(props: {
  readonly label: string;
  readonly description: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  const className = props.selected
    ? "composer-attachment-service-option composer-attachment-service-option-selected"
    : "composer-attachment-service-option";

  return (
    <button
      type="button"
      className={className}
      role="menuitemradio"
      aria-checked={props.selected}
      onClick={props.onClick}
    >
      <span className="composer-attachment-service-copy">
        <span className="composer-attachment-service-label">{props.label}</span>
        <span className="composer-attachment-service-description">{props.description}</span>
      </span>
      {props.selected ? <MenuCheck /> : null}
    </button>
  );
}

function PlanModeRow(props: {
  readonly collaborationPreset: CollaborationPreset;
  readonly onToggle: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const enabled = props.collaborationPreset === "plan";
  const toggleClassName = enabled
    ? "composer-attachment-toggle composer-attachment-mode-toggle composer-attachment-toggle-on composer-attachment-mode-toggle-on"
    : "composer-attachment-toggle composer-attachment-mode-toggle";

  return (
    <div className="composer-attachment-mode-card" role="group" aria-label={t("home.composer.planMode")}>
      <span className="composer-attachment-mode-copy">
        <span className="composer-attachment-mode-icon-wrap" aria-hidden="true">
          <ComposerPlanModeIcon className="composer-attachment-mode-icon" />
        </span>
        <span className="composer-attachment-mode-label">{t("home.composer.planMode")}</span>
      </span>
      <button type="button" className={toggleClassName} role="switch" aria-label={t("home.composer.planMode")} aria-checked={enabled} onClick={props.onToggle}>
        <span className="composer-attachment-toggle-knob" />
      </button>
    </div>
  );
}

function AttachmentIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11.883 5.55 7.05 10.384a2.333 2.333 0 0 0 3.299 3.299l5.127-5.127a4 4 0 1 0-5.657-5.657L4.595 8.122a5.667 5.667 0 0 0 8.014 8.014l4.243-4.243" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AgentsIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.5 8.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm7 0a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM3.75 14.75a2.75 2.75 0 0 1 5.5 0m3.5 0a2.75 2.75 0 0 1 5.5 0M10 15a2.5 2.5 0 0 0-5 0m5 0a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function toggleCollaborationPreset(preset: CollaborationPreset): CollaborationPreset {
  return preset === "plan" ? "default" : "plan";
}
