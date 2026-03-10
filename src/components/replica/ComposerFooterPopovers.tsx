import type { ComposerPermissionLevel } from "../../app/composerPermission";
import { OfficialArrowTopRightIcon } from "./officialIcons";

export type PermissionLevel = ComposerPermissionLevel;

interface PermissionOption {
  readonly key: PermissionLevel;
  readonly label: string;
  readonly icon: string;
}

const PERMISSION_OPTIONS: ReadonlyArray<PermissionOption> = [
  { key: "default", label: "默认权限", icon: "○" },
  { key: "full", label: "完全访问权限", icon: "!" }
];

export function permissionLabel(level: PermissionLevel): string {
  return level === "full" ? "完全访问权限" : "默认权限";
}

export function WorkspacePopover(props: { readonly onClose: () => void }): JSX.Element {
  return (
    <div className="composer-footer-popover" role="menu" aria-label="使用位置">
      <div className="composer-footer-popover-title">继续使用</div>
      <button
        type="button"
        className="composer-footer-popover-item"
        role="menuitem"
        onClick={props.onClose}
      >
        <span className="popover-item-left">
          <span className="popover-item-icon" aria-hidden="true">
            ◆
          </span>
          本地项目
        </span>
        <span className="popover-item-right popover-check" aria-hidden="true">
          ✓
        </span>
      </button>
      <button
        type="button"
        className="composer-footer-popover-item"
        role="menuitem"
        onClick={props.onClose}
      >
        <span className="popover-item-left">
          <span className="popover-item-icon" aria-hidden="true">
            ○
          </span>
          关联 Codex Web
        </span>
        <OfficialArrowTopRightIcon className="popover-item-right popover-external" />
      </button>
      <button
        type="button"
        className="composer-footer-popover-item composer-footer-popover-item-disabled"
        role="menuitem"
        disabled
      >
        <span className="popover-item-left">
          <span className="popover-item-icon" aria-hidden="true">
            ○
          </span>
          发送至云端
        </span>
      </button>
    </div>
  );
}

export function PermissionsPopover(props: {
  readonly selected: PermissionLevel;
  readonly onSelect: (level: PermissionLevel) => void;
}): JSX.Element {
  const { selected, onSelect } = props;
  return (
    <div className="composer-footer-popover composer-footer-popover-sm" role="menu" aria-label="权限级别">
      {PERMISSION_OPTIONS.map((option) => (
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
              ✓
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
