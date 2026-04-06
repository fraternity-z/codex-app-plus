import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption, ComposerSelection } from "../model/composerPreferences";
import {
  appendComposerFileReferencePaths,
  parseComposerFileReferenceDraft,
  removeComposerFileReferencePath,
  serializeComposerFileReferenceDraft,
  toComposerFileReferencePath,
} from "../model/composerFileReferences";
import type { SendTurnOptions } from "../../conversation/hooks/useWorkspaceConversation";
import { useComposerSelection } from "../hooks/useComposerSelection";
import type { CollaborationPreset, ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../../domain/timeline";
import { ComposerAttachmentMenu } from "./ComposerAttachmentMenu";
import { ComposerCommandPalette } from "./ComposerCommandPalette";
import { ComposerDraftChips } from "./ComposerDraftChips";
import { ComposerFooter } from "./ComposerFooter";
import { ComposerModelControls } from "./ComposerModelControls";
import { ComposerQueuedFollowUpsPanel } from "./ComposerQueuedFollowUpsPanel";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import type { WorkspaceGitController } from "../../git/model/types";
import { OfficialPlusIcon } from "../../shared/ui/officialIcons";
import { useComposerCommandPalette } from "../hooks/useComposerCommandPalette";
import { useComposerSelectionPersistence } from "../hooks/useComposerSelectionPersistence";
import { useComposerAttachments } from "../hooks/useComposerAttachments";
import { useComposerTextareaAutosize } from "../hooks/useComposerTextareaAutosize";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import { useI18n } from "../../../i18n/useI18n";

const MIN_TRIMMED_MESSAGE_LENGTH = 1;
const MAX_COMPOSER_INPUT_EXTRA_ROWS = 3;
type ReportErrorFn = ReturnType<typeof useUiBannerNotifications>["reportError"];

export interface HomeComposerProps {
  readonly appServerReady?: boolean;
  readonly busy: boolean;
  readonly inputText: string;
  readonly collaborationPreset: CollaborationPreset;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
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
  readonly composerCommandBridge: ComposerCommandBridge;
  readonly multiAgentAvailable?: boolean;
  readonly multiAgentEnabled?: boolean;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onInputChange: (text: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly onSetMultiAgentEnabled?: (enabled: boolean) => Promise<void>;
  readonly onSelectPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onToggleDiff: () => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onLogout?: () => Promise<void>;
  readonly onPromoteQueuedFollowUp: (followUpId: string) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}

export function HomeComposer(props: HomeComposerProps): JSX.Element {
  const { t } = useI18n();
  const { reportError } = useUiBannerNotifications("composer");
  const defaultServiceTier = props.defaultServiceTier ?? null;
  const multiAgentAvailable = props.multiAgentAvailable ?? false;
  const multiAgentEnabled = props.multiAgentEnabled ?? false;
  const setMultiAgentEnabled = props.onSetMultiAgentEnabled ?? (async () => undefined);
  const logout = props.onLogout ?? (async () => undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [multiAgentPending, setMultiAgentPending] = useState(false);
  const {
    composerBodyText,
    fileReferencePaths,
    appendFileReferenceTexts,
    appendWorkspaceFilePaths,
    removeFileReference,
    updateComposerBodyText,
  } = useHomeComposerDraft({
    inputText: props.inputText,
    onInputChange: props.onInputChange,
    selectedRootPath: props.selectedRootPath,
  });
  const { attachments, clearAttachments, openFilePicker, removeAttachment, handlePaste } = useComposerAttachments({
    selectedThreadId: props.selectedThreadId,
    onInsertFilePaths: appendWorkspaceFilePaths,
  });
  const composerSelection = useComposerSelection(props.models, props.defaultModel, props.defaultEffort, defaultServiceTier);
  const { handleSelectModel, handleSelectEffort, handleSelectServiceTier } = useComposerSelectionPersistence({ models: props.models, defaultModel: props.defaultModel, defaultEffort: props.defaultEffort, defaultServiceTier, selectedModel: composerSelection.selectedModel, selectedEffort: composerSelection.selectedEffort, selectedServiceTier: composerSelection.selectedServiceTier, replaceSelection: composerSelection.replaceSelection, persistSelection: props.onPersistComposerSelection });
  const commandPalette = useComposerCommandPalette({
    inputText: composerBodyText,
    selectedRootPath: props.selectedRootPath,
    selectedThreadId: props.selectedThreadId,
    collaborationPreset: props.collaborationPreset,
    isResponding: props.isResponding,
    models: props.models,
    selectedModel: composerSelection.selectedModel,
    selectedEffort: composerSelection.selectedEffort,
    selectedServiceTier: composerSelection.selectedServiceTier,
    permissionLevel: props.permissionLevel,
    composerCommandBridge: props.composerCommandBridge,
    onInputChange: updateComposerBodyText,
    onAppendMentionPath: (path, nextText) => appendFileReferenceTexts([path], nextText),
    onCreateThread: props.onCreateThread,
    onSendTurn: props.onSendTurn,
    onToggleDiff: props.onToggleDiff,
    onSelectModel: handleSelectModel,
    onSelectServiceTier: handleSelectServiceTier,
    onSelectPermissionLevel: props.onSelectPermissionLevel,
    onSelectCollaborationPreset: props.onSelectCollaborationPreset,
    onLogout: logout,
  });
  const appServerReady = props.appServerReady !== false;
  const interactionDisabled = props.busy || multiAgentPending;
  const hasDraftToSend = hasDraftContent(composerBodyText, attachments.length > 0 || fileReferencePaths.length > 0);
  const canSend = appServerReady
    && !interactionDisabled
    && hasDraftToSend;
  const showInterruptAction = props.isResponding && !hasDraftToSend;
  const buttonDisabled = showInterruptAction
    ? interactionDisabled || !appServerReady || props.interruptPending
    : interactionDisabled || !appServerReady || !canSend;
  const buttonLabel = showInterruptAction ? "Stop response" : "Send message";

  useComposerTextareaAutosize({ textareaRef: commandPalette.textareaRef, value: composerBodyText, maxExtraRows: MAX_COMPOSER_INPUT_EXTRA_ROWS });
  useToolbarMenuDismissal(commandPalette.open, containerRef, () => void commandPalette.dismiss());

  const { handlePromoteQueuedFollowUp, submit } = useHomeComposerActions({
    attachments,
    canSend,
    clearAttachments,
    collaborationPreset: props.collaborationPreset,
    composerSelection,
    dismissPalette: commandPalette.dismiss,
    inputText: props.inputText,
    onPromoteQueuedFollowUp: props.onPromoteQueuedFollowUp,
    onSendTurn: props.onSendTurn,
    permissionLevel: props.permissionLevel,
    promoteFailedMessage: t("home.composer.promoteFailed"),
    reportError,
    sendFailedMessage: t("home.composer.sendFailed"),
  });

  const handleToggleMultiAgent = useCallback(async () => {
    setMenuOpen(false);
    setMultiAgentPending(true);
    try {
      await setMultiAgentEnabled(!multiAgentEnabled);
    } finally {
      setMultiAgentPending(false);
    }
  }, [multiAgentEnabled, setMultiAgentEnabled]);

  return (
    <footer className="composer-area">
      <div className="composer-stack">
        <ComposerQueuedFollowUpsPanel
          queuedFollowUps={props.queuedFollowUps}
          interruptPending={props.interruptPending}
          onPromoteQueuedFollowUp={handlePromoteQueuedFollowUp}
          onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
          onClearQueuedFollowUps={props.onClearQueuedFollowUps}
        />
        <div className="composer-card" ref={containerRef}>
          {multiAgentPending ? <ComposerReloadOverlay /> : null}
          {menuOpen ? <button type="button" className="composer-popover-backdrop" aria-label={t("home.composer.closeAttachmentMenu")} onClick={() => setMenuOpen(false)} /> : null}
          {commandPalette.open ? <ComposerCommandPalette open={true} title={commandPalette.title} items={commandPalette.items} selectedIndex={commandPalette.selectedIndex} onSelectItem={commandPalette.onSelectItem} onHoverItem={commandPalette.onHoverItem} /> : null}
          <ComposerDraftChips attachments={attachments} filePaths={fileReferencePaths} onRemoveAttachment={removeAttachment} onRemoveFilePath={removeFileReference} />
          <textarea ref={commandPalette.textareaRef} rows={1} className="composer-input" placeholder={getComposerPlaceholder(props.selectedRootPath)} value={composerBodyText} disabled={interactionDisabled} onPaste={(event) => void handlePaste(event)} onSelect={commandPalette.syncFromTextareaSelection} onKeyDown={(event) => handleInputKeyDown(event, props, attachments.length > 0 || fileReferencePaths.length > 0, commandPalette.handleKeyDown, submit)} onChange={(event) => handleInputChange(event.currentTarget.value, event.currentTarget.selectionStart, updateComposerBodyText, commandPalette.syncFromTextInput)} />
          <div className="composer-bar">
            <div className="composer-left">
              <div className="composer-plus-anchor">
                {menuOpen ? <ComposerAttachmentMenu collaborationPreset={props.collaborationPreset} serviceTier={composerSelection.selectedServiceTier} multiAgentAvailable={multiAgentAvailable} multiAgentEnabled={multiAgentEnabled} multiAgentDisabled={interactionDisabled || props.isResponding} onAddAttachments={() => handleAddAttachments(openFilePicker, setMenuOpen)} onSelectCollaborationPreset={props.onSelectCollaborationPreset} onSelectServiceTier={handleSelectServiceTier} onToggleMultiAgent={handleToggleMultiAgent} onClose={() => setMenuOpen(false)} /> : null}
                <button type="button" className={menuOpen ? "composer-mini-btn composer-mini-btn-active" : "composer-mini-btn"} aria-label={t("home.composer.openAttachmentMenu")} aria-haspopup="menu" aria-expanded={menuOpen} disabled={interactionDisabled} onClick={() => void toggleAttachmentMenu(menuOpen, setMenuOpen, commandPalette.dismiss)}>
                  <OfficialPlusIcon className="composer-plus-icon" />
                </button>
              </div>
              <ComposerModelControls disabled={interactionDisabled} models={props.models} selectedModel={composerSelection.selectedModel} selectedEffort={composerSelection.selectedEffort} supportedEfforts={composerSelection.selectedModelOption?.supportedEfforts ?? []} onSelectModel={handleSelectModel} onSelectEffort={handleSelectEffort} />
            </div>
            <button type="button" className="send-btn" aria-label={buttonLabel} disabled={buttonDisabled} onClick={() => showInterruptAction ? void props.onInterruptTurn() : submit()}>
              {showInterruptAction ? <PauseResponseIcon className="send-icon" /> : <SendArrowIcon className="send-icon" />}
            </button>
          </div>
        </div>
      </div>
      <ComposerFooter permissionLevel={props.permissionLevel} gitController={props.gitController} selectedThreadId={props.selectedThreadId} selectedThreadBranch={props.selectedThreadBranch} onSelectPermission={props.onSelectPermissionLevel} onUpdateThreadBranch={props.onUpdateThreadBranch} />
    </footer>
  );
}

function useHomeComposerDraft(args: {
  readonly inputText: string;
  readonly onInputChange: (text: string) => void;
  readonly selectedRootPath: string | null;
}) {
  const fileReferenceDraft = useMemo(
    () => parseComposerFileReferenceDraft(args.inputText),
    [args.inputText],
  );
  const composerBodyText = fileReferenceDraft.bodyText;
  const fileReferencePaths = fileReferenceDraft.filePaths;

  const updateComposerBodyText = useCallback((nextBodyText: string) => {
    if (fileReferencePaths.length === 0) {
      args.onInputChange(nextBodyText);
      return;
    }
    args.onInputChange(serializeComposerFileReferenceDraft(nextBodyText, fileReferencePaths));
  }, [args.onInputChange, fileReferencePaths]);

  const appendFileReferenceTexts = useCallback((paths: ReadonlyArray<string>, nextBodyText?: string) => {
    const nextInputText = nextBodyText === undefined
      ? appendComposerFileReferencePaths(args.inputText, paths)
      : serializeComposerFileReferenceDraft(nextBodyText, [...fileReferencePaths, ...paths]);
    args.onInputChange(nextInputText);
  }, [args.inputText, args.onInputChange, fileReferencePaths]);

  const appendWorkspaceFilePaths = useCallback((paths: ReadonlyArray<string>) => {
    appendFileReferenceTexts(paths.map((path) => toComposerFileReferencePath(path, args.selectedRootPath)));
  }, [appendFileReferenceTexts, args.selectedRootPath]);

  const removeFileReference = useCallback((path: string) => {
    args.onInputChange(removeComposerFileReferencePath(args.inputText, path));
  }, [args.inputText, args.onInputChange]);

  return {
    composerBodyText,
    fileReferencePaths,
    appendFileReferenceTexts,
    appendWorkspaceFilePaths,
    removeFileReference,
    updateComposerBodyText,
  };
}

function useHomeComposerActions(args: {
  readonly attachments: ReturnType<typeof useComposerAttachments>["attachments"];
  readonly canSend: boolean;
  readonly clearAttachments: () => void;
  readonly collaborationPreset: CollaborationPreset;
  readonly composerSelection: ReturnType<typeof useComposerSelection>;
  readonly dismissPalette: () => Promise<void>;
  readonly inputText: string;
  readonly onPromoteQueuedFollowUp: (followUpId: string) => Promise<void>;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly promoteFailedMessage: string;
  readonly reportError: ReportErrorFn;
  readonly sendFailedMessage: string;
}) {
  const submit = useCallback((followUpOverride?: FollowUpMode) => {
    void submitTurn({
      attachments: args.attachments,
      canSend: args.canSend,
      clearAttachments: args.clearAttachments,
      collaborationPreset: args.collaborationPreset,
      composerSelection: args.composerSelection,
      dismissPalette: args.dismissPalette,
      followUpOverride,
      inputText: args.inputText,
      onSendTurn: args.onSendTurn,
      permissionLevel: args.permissionLevel,
      reportError: args.reportError,
      sendFailedMessage: args.sendFailedMessage,
    });
  }, [args]);

  const handlePromoteQueuedFollowUp = useCallback((followUpId: string) => {
    void args.onPromoteQueuedFollowUp(followUpId).catch((error) => {
      args.reportError(args.promoteFailedMessage, error);
    });
  }, [args]);

  return { handlePromoteQueuedFollowUp, submit };
}

function ComposerReloadOverlay(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="composer-reload-overlay" role="status" aria-live="polite">
      <span className="composer-reload-spinner" aria-hidden="true" />
      <span>{t("home.composer.reloadingCodex")}</span>
    </div>
  );
}

function getComposerPlaceholder(selectedRootPath: string | null): string {
  return selectedRootPath === null ? "Ask Codex anything" : "Describe the task, ask a question, or queue a follow-up";
}

function handleInputChange(
  value: string,
  caret: number,
  onInputChange: (text: string) => void,
  syncFromTextInput: (value: string, caret: number) => void,
): void {
  onInputChange(value);
  syncFromTextInput(value, caret);
}

function handleInputKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  props: HomeComposerProps,
  hasAttachments: boolean,
  handlePaletteKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean,
  submit: (followUpOverride?: FollowUpMode) => void,
): void {
  if (handlePaletteKeyDown(event)) {
    return;
  }
  handleComposerEnterKey(event, props.inputText, props.composerEnterBehavior, props.isResponding, hasDraftContent(props.inputText, hasAttachments), submit, () => void props.onInterruptTurn());
}

function handleComposerEnterKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
  inputText: string,
  composerEnterBehavior: ComposerEnterBehavior,
  isResponding: boolean,
  hasDraftToSend: boolean,
  submit: (followUpOverride?: FollowUpMode) => void,
  interrupt: () => void,
): void {
  if (event.key !== "Enter") {
    return;
  }
  const metaPressed = event.metaKey || event.ctrlKey;
  if (event.shiftKey || !shouldSendOnEnter(inputText, composerEnterBehavior, metaPressed)) {
    return;
  }
  event.preventDefault();
  if (isResponding && !hasDraftToSend) {
    interrupt();
    return;
  }
  submit();
}

function hasDraftContent(inputText: string, hasAttachments: boolean): boolean {
  return inputText.trim().length >= MIN_TRIMMED_MESSAGE_LENGTH || hasAttachments;
}

function shouldSendOnEnter(inputText: string, behavior: ComposerEnterBehavior, metaPressed: boolean): boolean {
  if (metaPressed || behavior === "enter") {
    return true;
  }
  return !inputText.includes("\n");
}

async function submitTurn(args: {
  readonly attachments: ReturnType<typeof useComposerAttachments>["attachments"];
  readonly canSend: boolean;
  readonly clearAttachments: () => void;
  readonly collaborationPreset: CollaborationPreset;
  readonly composerSelection: ReturnType<typeof useComposerSelection>;
  readonly dismissPalette: () => Promise<void>;
  readonly followUpOverride?: FollowUpMode;
  readonly inputText: string;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly reportError: ReportErrorFn;
  readonly sendFailedMessage: string;
}): Promise<void> {
  if (!args.canSend) {
    return;
  }
  try {
    await args.dismissPalette();
    await args.onSendTurn({
      text: args.inputText,
      attachments: args.attachments,
      selection: {
        model: args.composerSelection.selectedModel,
        effort: args.composerSelection.selectedEffort,
        serviceTier: args.composerSelection.selectedServiceTier,
      },
      permissionLevel: args.permissionLevel,
      collaborationPreset: args.collaborationPreset,
      followUpOverride: args.followUpOverride,
    });
    args.clearAttachments();
  } catch (error) {
    args.reportError(args.sendFailedMessage, error);
  }
}

async function handleAddAttachments(openFilePicker: () => Promise<void>, setMenuOpen: (updater: (value: boolean) => boolean) => void): Promise<void> {
  await openFilePicker();
  setMenuOpen(() => false);
}

async function toggleAttachmentMenu(
  menuOpen: boolean,
  setMenuOpen: (updater: (value: boolean) => boolean) => void,
  dismissPalette: () => Promise<void>,
): Promise<void> {
  await dismissPalette();
  setMenuOpen(() => !menuOpen);
}

function SendArrowIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.3V2.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M3.2 7.1L8 2.3l4.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PauseResponseIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" /></svg>;
}
