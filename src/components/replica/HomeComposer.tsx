import { useState, type KeyboardEvent } from "react";
import type { ComposerModelOption, ComposerSelection } from "../../app/composerPreferences";
import type { SendTurnOptions } from "../../app/useWorkspaceConversation";
import { useComposerSelection } from "../../app/useComposerSelection";
import type { McpShortcut } from "../../domain/types";
import type { ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../domain/timeline";
import { ComposerAttachmentMenu } from "./ComposerAttachmentMenu";
import { ComposerFooter } from "./ComposerFooter";
import { ComposerModelControls } from "./ComposerModelControls";
import { OfficialPlusIcon } from "./officialIcons";

const MIN_TRIMMED_MESSAGE_LENGTH = 1;

export interface HomeComposerProps {
  readonly busy: boolean;
  readonly inputText: string;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly selectedRootPath: string | null;
  readonly mcpShortcuts: ReadonlyArray<McpShortcut>;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}

function createSelection(model: string | null, effort: ComposerSelection["effort"]): ComposerSelection {
  return { model, effort };
}

function getComposerPlaceholder(selectedRootPath: string | null): string {
  return selectedRootPath === null ? "Ask Codex anything" : "Describe the task, ask a question, or queue a follow-up";
}

function getOppositeMode(mode: FollowUpMode): FollowUpMode {
  if (mode === "queue") {
    return "steer";
  }
  return "queue";
}

function shouldSendOnEnter(inputText: string, behavior: ComposerEnterBehavior, metaPressed: boolean): boolean {
  if (metaPressed) {
    return true;
  }
  if (behavior === "enter") {
    return true;
  }
  return !inputText.includes("\n");
}

function QueuedFollowUpsPanel(props: {
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}): JSX.Element | null {
  if (props.queuedFollowUps.length === 0) {
    return null;
  }

  return (
    <section className="composer-queue-panel">
      <header className="composer-queue-header">
        <strong>Queued follow-ups</strong>
        <button type="button" className="composer-queue-clear" onClick={props.onClearQueuedFollowUps}>
          清空
        </button>
      </header>
      <ul className="composer-queue-list">
        {props.queuedFollowUps.map((followUp) => (
          <li key={followUp.id} className="composer-queue-item">
            <div>
              <strong>{followUp.mode}</strong>
              <p>{followUp.text}</p>
            </div>
            <button type="button" className="composer-queue-remove" onClick={() => props.onRemoveQueuedFollowUp(followUp.id)}>
              移除
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeComposer(props: HomeComposerProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [planModeEnabled, setPlanModeEnabled] = useState(false);
  const composerSelection = useComposerSelection(props.models, props.defaultModel, props.defaultEffort);
  const canSend = !props.busy && props.inputText.trim().length >= MIN_TRIMMED_MESSAGE_LENGTH;
  const placeholder = getComposerPlaceholder(props.selectedRootPath);

  const submit = (followUpOverride?: FollowUpMode) => {
    if (!canSend) {
      return;
    }
    void props.onSendTurn({
      selection: createSelection(composerSelection.selectedModel, composerSelection.selectedEffort),
      planModeEnabled,
      followUpOverride
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit(getOppositeMode(props.followUpQueueMode));
      return;
    }
    if (event.shiftKey) {
      return;
    }
    if (!shouldSendOnEnter(props.inputText, props.composerEnterBehavior, event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const handleInsertMcpShortcut = (shortcut: McpShortcut) => {
    const prefix = props.inputText.trim().length === 0 ? "" : `${props.inputText.trim()}\n\n`;
    props.onInputChange(`${prefix}Use MCP tool ${shortcut.server}/${shortcut.tool.name} for this task.`);
    setMenuOpen(false);
  };

  return (
    <footer className="composer-area">
      <QueuedFollowUpsPanel
        queuedFollowUps={props.queuedFollowUps}
        onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={props.onClearQueuedFollowUps}
      />
      <div className="composer-card">
        {menuOpen ? <button type="button" className="composer-popover-backdrop" aria-label="Close attachment menu" onClick={() => setMenuOpen(false)} /> : null}
        <textarea
          className="composer-input"
          placeholder={placeholder}
          value={props.inputText}
          onKeyDown={handleKeyDown}
          onChange={(event) => props.onInputChange(event.currentTarget.value)}
        />
        <div className="composer-bar">
          <div className="composer-left">
            <div className="composer-plus-anchor">
              {menuOpen ? <ComposerAttachmentMenu planModeEnabled={planModeEnabled} mcpShortcuts={props.mcpShortcuts} onTogglePlanMode={() => setPlanModeEnabled((value) => !value)} onInsertMcpShortcut={handleInsertMcpShortcut} onClose={() => setMenuOpen(false)} /> : null}
              <button
                type="button"
                className={menuOpen ? "composer-mini-btn composer-mini-btn-active" : "composer-mini-btn"}
                aria-label="Open attachment menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <OfficialPlusIcon className="composer-plus-icon" />
              </button>
            </div>
            <ComposerModelControls
              models={props.models}
              selectedModel={composerSelection.selectedModel}
              selectedEffort={composerSelection.selectedEffort}
              supportedEfforts={composerSelection.selectedModelOption?.supportedEfforts ?? []}
              onSelectModel={composerSelection.selectModel}
              onSelectEffort={composerSelection.selectEffort}
            />
          </div>
          <button type="button" className="send-btn" aria-label="Send message" disabled={!canSend} onClick={() => submit()}>
            <SendArrowIcon className="send-icon" />
          </button>
        </div>
      </div>
      <ComposerFooter />
    </footer>
  );
}

function SendArrowIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 13.3V2.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 7.1L8 2.3l4.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
