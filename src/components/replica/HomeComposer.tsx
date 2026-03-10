import { useState, type KeyboardEvent } from "react";
import { getAttachmentLabel } from "../../app/composerAttachments";
import type { ComposerPermissionLevel } from "../../app/composerPermission";
import type { ComposerModelOption, ComposerSelection } from "../../app/composerPreferences";
import type { SendTurnOptions } from "../../app/useWorkspaceConversation";
import { useComposerSelection } from "../../app/useComposerSelection";
import type { ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../domain/timeline";
import { AttachmentClip } from "./AttachmentClip";
import { ComposerAttachmentMenu } from "./ComposerAttachmentMenu";
import { ComposerFooter } from "./ComposerFooter";
import type { WorkspaceGitController } from "./git/types";
import { ComposerModelControls } from "./ComposerModelControls";
import { OfficialPlusIcon } from "./officialIcons";
import { useComposerSelectionPersistence } from "./useComposerSelectionPersistence";
import { useComposerAttachments } from "./useComposerAttachments";

const MIN_TRIMMED_MESSAGE_LENGTH = 1;

export interface HomeComposerProps {
  readonly busy: boolean;
  readonly inputText: string;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly selectedRootPath: string | null;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly gitController: WorkspaceGitController;
  readonly selectedThreadId: string | null;
  readonly selectedThreadBranch: string | null;
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly onSelectPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
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

function handleComposerEnterKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
  options: {
    readonly inputText: string;
    readonly composerEnterBehavior: ComposerEnterBehavior;
    readonly followUpQueueMode: FollowUpMode;
    readonly isResponding: boolean;
    readonly submit: (followUpOverride?: FollowUpMode) => void;
    readonly interrupt: () => void;
  }
): void {
  if (event.key !== "Enter") {
    return;
  }
  const metaPressed = event.metaKey || event.ctrlKey;
  if (event.shiftKey && metaPressed) {
    event.preventDefault();
    if (options.isResponding) {
      options.interrupt();
      return;
    }
    options.submit(getOppositeMode(options.followUpQueueMode));
    return;
  }
  if (event.shiftKey || !shouldSendOnEnter(options.inputText, options.composerEnterBehavior, metaPressed)) {
    return;
  }
  event.preventDefault();
  if (options.isResponding) {
    options.interrupt();
    return;
  }
  options.submit();
}

function reportComposerSubmitError(error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error("发送消息失败", error);
  window.alert(`发送消息失败: ${detail}`);
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
              {followUp.text.trim().length === 0 ? null : <p>{followUp.text}</p>}
              {followUp.attachments.length === 0 ? null : (
                <div className="composer-queue-attachments">
                  {followUp.attachments.map((attachment) => (
                    <AttachmentClip key={attachment.id} label={getAttachmentLabel(attachment)} tone={attachment.kind} />
                  ))}
                </div>
              )}
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
  const { attachments, clearAttachments, openFilePicker, removeAttachment, handlePaste } = useComposerAttachments({ selectedThreadId: props.selectedThreadId });
  const composerSelection = useComposerSelection(props.models, props.defaultModel, props.defaultEffort);
  const { handleSelectModel, handleSelectEffort } = useComposerSelectionPersistence({
    models: props.models,
    defaultModel: props.defaultModel,
    defaultEffort: props.defaultEffort,
    selectedModel: composerSelection.selectedModel,
    selectedEffort: composerSelection.selectedEffort,
    replaceSelection: composerSelection.replaceSelection,
    persistSelection: props.onPersistComposerSelection
  });
  const hasMessageText = props.inputText.trim().length >= MIN_TRIMMED_MESSAGE_LENGTH;
  const canSend = !props.busy && (hasMessageText || attachments.length > 0);
  const buttonDisabled = props.isResponding ? props.interruptPending : !canSend;
  const buttonLabel = props.isResponding ? "Pause response" : "Send message";
  const placeholder = getComposerPlaceholder(props.selectedRootPath);

  const submit = (followUpOverride?: FollowUpMode) => {
    void submitTurn(followUpOverride);
  };

  const submitTurn = async (followUpOverride?: FollowUpMode) => {
    if (!canSend) {
      return;
    }

    try {
      await props.onSendTurn({
        text: props.inputText,
        attachments,
        selection: createSelection(composerSelection.selectedModel, composerSelection.selectedEffort),
        permissionLevel: props.permissionLevel,
        planModeEnabled,
        followUpOverride,
      });
      clearAttachments();
    } catch (error) {
      reportComposerSubmitError(error);
    }
  };

  const handleAddAttachments = async () => {
    await openFilePicker();
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
        {attachments.length === 0 ? null : (
          <div className="composer-attachment-draft" aria-label="Attached files and images">
            {attachments.map((attachment) => (
              <AttachmentClip key={attachment.id} label={getAttachmentLabel(attachment)} tone={attachment.kind} onRemove={() => removeAttachment(attachment.id)} />
            ))}
          </div>
        )}
        <textarea
          className="composer-input"
          placeholder={placeholder}
          value={props.inputText}
          onPaste={(event) => void handlePaste(event)}
          onKeyDown={(event) => handleComposerEnterKey(event, {
            inputText: props.inputText,
            composerEnterBehavior: props.composerEnterBehavior,
            followUpQueueMode: props.followUpQueueMode,
            isResponding: props.isResponding,
            submit,
            interrupt: () => void props.onInterruptTurn()
          })}
          onChange={(event) => props.onInputChange(event.currentTarget.value)}
        />
        <div className="composer-bar">
          <div className="composer-left">
            <div className="composer-plus-anchor">
              {menuOpen ? <ComposerAttachmentMenu planModeEnabled={planModeEnabled} onAddAttachments={handleAddAttachments} onTogglePlanMode={() => setPlanModeEnabled((value) => !value)} onClose={() => setMenuOpen(false)} /> : null}
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
              onSelectModel={handleSelectModel}
              onSelectEffort={handleSelectEffort}
            />
          </div>
          <button
            type="button"
            className="send-btn"
            aria-label={buttonLabel}
            disabled={buttonDisabled}
            onClick={() => props.isResponding ? void props.onInterruptTurn() : submit()}
          >
            {props.isResponding ? <PauseResponseIcon className="send-icon" /> : <SendArrowIcon className="send-icon" />}
          </button>
        </div>
      </div>
      <ComposerFooter
        permissionLevel={props.permissionLevel}
        gitController={props.gitController}
        selectedThreadId={props.selectedThreadId}
        selectedThreadBranch={props.selectedThreadBranch}
        onSelectPermission={props.onSelectPermissionLevel}
        onUpdateThreadBranch={props.onUpdateThreadBranch}
      />
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

function PauseResponseIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}
