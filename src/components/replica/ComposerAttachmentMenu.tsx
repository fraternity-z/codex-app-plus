import type { McpShortcut } from "../../domain/types";

interface ComposerAttachmentMenuProps {
  readonly planModeEnabled: boolean;
  readonly mcpShortcuts: ReadonlyArray<McpShortcut>;
  readonly onTogglePlanMode: () => void;
  readonly onInsertMcpShortcut: (shortcut: McpShortcut) => void;
  readonly onClose: () => void;
}

export function ComposerAttachmentMenu(props: ComposerAttachmentMenuProps): JSX.Element {
  return (
    <div className="composer-attachment-popover" role="menu" aria-label="Add content">
      <button type="button" className="composer-attachment-item" role="menuitem" onClick={props.onClose}>
        <span className="composer-attachment-item-content"><AttachmentIcon className="composer-attachment-icon" /><span>Add files and photos</span></span>
      </button>
      <div className="composer-attachment-separator" />
      <div className="composer-attachment-row">
        <span className="composer-attachment-item-content"><PlanModeIcon className="composer-attachment-icon" /><span>Plan mode</span></span>
        <button type="button" className={props.planModeEnabled ? "composer-attachment-toggle composer-attachment-toggle-on" : "composer-attachment-toggle"} role="switch" aria-label="Toggle plan mode" aria-checked={props.planModeEnabled} onClick={props.onTogglePlanMode}><span className="composer-attachment-toggle-knob" /></button>
      </div>
      <div className="composer-attachment-separator" />
      <div className="composer-attachment-shortcuts">
        <strong className="composer-attachment-shortcuts-title">MCP shortcuts</strong>
        {props.mcpShortcuts.length === 0 ? <p className="home-request-copy">No MCP tools are currently available.</p> : props.mcpShortcuts.slice(0, 8).map((shortcut) => <button key={shortcut.id} type="button" className="composer-attachment-item" role="menuitem" onClick={() => props.onInsertMcpShortcut(shortcut)}><span className="composer-attachment-item-content"><McpShortcutIcon className="composer-attachment-icon" /><span>{`${shortcut.server}/${shortcut.tool.name}`}</span></span></button>)}
      </div>
    </div>
  );
}

function AttachmentIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11.883 5.55 7.05 10.384a2.333 2.333 0 0 0 3.299 3.299l5.127-5.127a4 4 0 1 0-5.657-5.657L4.595 8.122a5.667 5.667 0 0 0 8.014 8.014l4.243-4.243" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlanModeIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 5.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M4.5 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M4.5 14.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="11.5" cy="5.5" r="1.6" stroke="currentColor" strokeWidth="1.4" /><circle cx="8.5" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.4" /><circle cx="14.5" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.4" /></svg>;
}

function McpShortcutIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.304 6.31 6.39 8.223a2.708 2.708 0 0 0 3.83 3.83l1.722-1.722" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M11.696 13.69 13.61 11.777a2.708 2.708 0 0 0-3.83-3.83L8.058 9.668" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M14.5 6.25h1.25v1.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M15.75 6.25 13.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}
