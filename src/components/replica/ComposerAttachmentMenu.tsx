import type { CollaborationPreset } from "../../domain/timeline";
import type { ServiceTier } from "../../protocol/generated/ServiceTier";

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
  return (
    <div className="composer-attachment-popover" role="menu" aria-label="Add content">
      <button type="button" className="composer-attachment-item" role="menuitem" onClick={() => void props.onAddAttachments()}>
        <span className="composer-attachment-item-content"><AttachmentIcon className="composer-attachment-icon" /><span>Add files and photos</span></span>
      </button>
      <div className="composer-attachment-separator" />
      <div className="composer-attachment-group">
        <PlanModeRow collaborationPreset={props.collaborationPreset} onToggle={() => props.onSelectCollaborationPreset(toggleCollaborationPreset(props.collaborationPreset))} />
      </div>
      <div className="composer-attachment-group">
        <div className="composer-attachment-group-title">Service tier</div>
        <div className="composer-attachment-choice-grid" role="group" aria-label="Service tier">
          <MenuChoiceButton label="Auto" selected={props.serviceTier === null} onClick={() => props.onSelectServiceTier(null)} />
          <MenuChoiceButton label="Fast" selected={props.serviceTier === "fast"} onClick={() => props.onSelectServiceTier("fast")} />
          <MenuChoiceButton label="Flex" selected={props.serviceTier === "flex"} onClick={() => props.onSelectServiceTier("flex")} />
        </div>
      </div>
      {props.multiAgentAvailable ? (
        <>
          <div className="composer-attachment-separator" />
          <div className="composer-attachment-row">
            <span className="composer-attachment-item-content"><AgentsIcon className="composer-attachment-icon" /><span>Multi-agent</span></span>
            <button type="button" className={props.multiAgentEnabled ? "composer-attachment-toggle composer-attachment-toggle-on" : "composer-attachment-toggle"} role="switch" aria-label="Toggle multi-agent" aria-checked={props.multiAgentEnabled} disabled={props.multiAgentDisabled} onClick={() => void props.onToggleMultiAgent()}><span className="composer-attachment-toggle-knob" /></button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlanModeRow(props: {
  readonly collaborationPreset: CollaborationPreset;
  readonly onToggle: () => void;
}): JSX.Element {
  const enabled = props.collaborationPreset === "plan";
  const toggleClassName = enabled
    ? "composer-attachment-toggle composer-attachment-mode-toggle composer-attachment-toggle-on composer-attachment-mode-toggle-on"
    : "composer-attachment-toggle composer-attachment-mode-toggle";

  return (
    <div className="composer-attachment-mode-card" role="group" aria-label="计划模式">
      <span className="composer-attachment-mode-copy">
        <span className="composer-attachment-mode-icon-wrap" aria-hidden="true">
          <PlanModeIcon className="composer-attachment-mode-icon" />
        </span>
        <span className="composer-attachment-mode-label">计划模式</span>
      </span>
      <button type="button" className={toggleClassName} role="switch" aria-label="计划模式" aria-checked={enabled} onClick={props.onToggle}>
        <span className="composer-attachment-toggle-knob" />
      </button>
    </div>
  );
}

function MenuChoiceButton(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.selected ? "composer-attachment-choice composer-attachment-choice-selected" : "composer-attachment-choice"}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function AttachmentIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11.883 5.55 7.05 10.384a2.333 2.333 0 0 0 3.299 3.299l5.127-5.127a4 4 0 1 0-5.657-5.657L4.595 8.122a5.667 5.667 0 0 0 8.014 8.014l4.243-4.243" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlanModeIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 5.5h1.5m2 0h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 10h4.5m2 0h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 14.5h1.5m2 0h5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.5" cy="5.5" r="1" fill="currentColor" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="6.5" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}

function AgentsIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.5 8.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm7 0a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM3.75 14.75a2.75 2.75 0 0 1 5.5 0m3.5 0a2.75 2.75 0 0 1 5.5 0M10 15a2.5 2.5 0 0 0-5 0m5 0a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function toggleCollaborationPreset(preset: CollaborationPreset): CollaborationPreset {
  return preset === "plan" ? "default" : "plan";
}
