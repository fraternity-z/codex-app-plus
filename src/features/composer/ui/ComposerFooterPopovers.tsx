import type { ComposerPermissionLevel } from "../model/composerPermission";
import { useI18n } from "../../../i18n/useI18n";
import { OfficialArrowTopRightIcon } from "../../shared/ui/officialIcons";

export type PermissionLevel = ComposerPermissionLevel;

interface PermissionOption {
  readonly key: PermissionLevel;
  readonly label: string;
  readonly icon: string;
}

export function permissionLabel(
  level: PermissionLevel,
  t?: (key: "home.composer.defaultPermission" | "home.composer.fullPermission") => string,
): string {
  if (t) {
    return level === "full" ? t("home.composer.fullPermission") : t("home.composer.defaultPermission");
  }
  return level === "full" ? "Full access" : "Default permission";
}

export function WorkspacePopover(props: {
  readonly canSendToCloud: boolean;
  readonly sendToCloudPending: boolean;
  readonly onClose: () => void;
  readonly onLinkCodexWeb: () => void;
  readonly onSendToCloud: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const sendToCloudDisabled = !props.canSendToCloud || props.sendToCloudPending;

  return (
    <div className="composer-footer-popover" role="menu" aria-label={t("home.composer.usageLocation")}>
      <div className="composer-footer-popover-title">{t("home.composer.continueUsing")}</div>
      <button
        type="button"
        className="composer-footer-popover-item"
        role="menuitem"
        onClick={props.onClose}
      >
        <span className="popover-item-left">
          <span className="popover-item-icon" aria-hidden="true">
            {"\u25c6"}
          </span>
          {t("home.composer.localProject")}
        </span>
        <span className="popover-item-right popover-check" aria-hidden="true">
          {"\u2713"}
        </span>
      </button>
      <button
        type="button"
        className="composer-footer-popover-item"
        role="menuitem"
        onClick={() => {
          props.onLinkCodexWeb();
          props.onClose();
        }}
      >
        <span className="popover-item-left">
          <span className="popover-item-icon" aria-hidden="true">
            {"\u25cb"}
          </span>
          {t("home.composer.linkCodexWeb")}
        </span>
        <OfficialArrowTopRightIcon className="popover-item-right popover-external" />
      </button>
      <button
        type="button"
        className={sendToCloudDisabled ? "composer-footer-popover-item composer-footer-popover-item-disabled" : "composer-footer-popover-item"}
        role="menuitem"
        disabled={sendToCloudDisabled}
        onClick={() => {
          props.onSendToCloud();
          props.onClose();
        }}
      >
        <span className="popover-item-left">
          <span className="popover-item-icon" aria-hidden="true">
            {"\u25cb"}
          </span>
          {props.sendToCloudPending ? t("home.composer.codexCloudSubmitting") : t("home.composer.sendToCloud")}
        </span>
      </button>
    </div>
  );
}

export function PermissionsPopover(props: {
  readonly selected: PermissionLevel;
  readonly onSelect: (level: PermissionLevel) => void;
}): JSX.Element {
  const { t } = useI18n();
  const { selected, onSelect } = props;
  const permissionOptions: ReadonlyArray<PermissionOption> = [
    { key: "default", label: t("home.composer.defaultPermission"), icon: "\u25cb" },
    { key: "full", label: t("home.composer.fullPermission"), icon: "!" }
  ];

  return (
    <div className="composer-footer-popover composer-footer-popover-sm" role="menu" aria-label={t("home.composer.permissionLevel")}>
      {permissionOptions.map((option) => (
        <button
          key={option.key}
          type="button"
          className="composer-footer-popover-item"
          role="menuitem"
          onClick={() => onSelect(option.key)}
        >
          <span className="popover-item-left">
            <span className="popover-item-icon" aria-hidden="true">
              {option.icon}
            </span>
            {option.label}
          </span>
          {option.key === selected ? (
            <span className="popover-item-right popover-check" aria-hidden="true">
              {"\u2713"}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
