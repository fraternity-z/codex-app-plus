interface SettingsPopoverProps {
  readonly onOpenSettings: () => void;
}

export function SettingsPopover({ onOpenSettings }: SettingsPopoverProps): JSX.Element {
  return (
    <div className="settings-popover" role="menu" aria-label="设置菜单">
      <div className="settings-popover-status">◉ 已通过 API 密钥登录</div>
      <button type="button" className="settings-popover-item" onClick={onOpenSettings}>
        <span>⚙ 设置</span>
      </button>
      <button type="button" className="settings-popover-item">
        <span>◌ 语言</span>
        <span>›</span>
      </button>
      <button type="button" className="settings-popover-item settings-popover-danger">
        <span>⇢ 退出登录</span>
      </button>
    </div>
  );
}
