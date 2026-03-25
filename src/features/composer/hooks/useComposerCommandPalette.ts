import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { CollaborationPreset } from "../../../domain/timeline";
import type { AppState } from "../../../domain/types";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { CustomPromptOutput } from "../../../bridge/types";
import type { AppStoreApi } from "../../../state/store";
import { useAppDispatch, useAppSelector } from "../../../state/store";
import type { ComposerCommandPaletteItem } from "../ui/ComposerCommandPalette";
import { executeSlashCommand, focusTextarea, readTextareaCaret, toPermissionLevel } from "../model/composerCommandActions";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { customPromptNameFromPaletteKey } from "../model/customPromptPalette";
import { createCustomPromptCommandInsert } from "../model/customPromptTemplate";
import { getActiveComposerTrigger, replaceComposerTrigger, type ComposerActiveTrigger } from "../model/composerInputTriggers";
import { createPaletteItems, createTriggerKey, getPaletteTitle, type PaletteMode } from "../model/composerPaletteData";
import { parseComposerSlashQuery } from "../model/composerSlashCommands";
import { stopMentionSession, syncMentionSession, type MentionSessionRefs } from "../model/composerMentionSession";
import {
  applySlashPermissionLevel,
  executeDirectSlashCommand,
  resumeSlashThread,
  type SlashExecutionContext,
  type SlashExecutionDependencies,
} from "../service/composerSlashCommandExecutor";
import {
  useSelectedConversation,
  useSlashCollections,
  useSlashRuntimeState,
} from "./composerCommandPaletteState";

type ManualPaletteMode = "slash-model" | "slash-permissions" | "slash-collab" | "slash-resume" | null;

interface UseComposerCommandPaletteOptions {
  readonly inputText: string;
  readonly selectedRootPath: string | null;
  readonly selectedThreadId: string | null;
  readonly collaborationPreset: CollaborationPreset;
  readonly isResponding: boolean;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly selectedServiceTier: ServiceTier | null;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly composerCommandBridge: ComposerCommandBridge;
  readonly onInputChange: (text: string) => void;
  readonly onAppendMentionPath: (path: string, nextText: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onToggleDiff: () => void;
  readonly onSelectModel: (model: string) => void;
  readonly onSelectServiceTier: (serviceTier: ServiceTier | null) => void;
  readonly onSelectPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onLogout: () => Promise<void>;
}

export type { UseComposerCommandPaletteOptions };

interface UseComposerCommandPaletteState {
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly open: boolean;
  readonly title: string;
  readonly items: ReadonlyArray<ComposerCommandPaletteItem>;
  readonly selectedIndex: number;
  readonly dismiss: () => Promise<void>;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readonly onSelectItem: (index: number) => void;
  readonly syncFromTextInput: (value: string, caret: number) => void;
  readonly syncFromTextareaSelection: () => void;
}

const NO_WORKSPACE_MESSAGE = "请先选择工作区后再使用 @ 文件提及。";
const LOCAL_OR_PICKER_COMMANDS = new Set(["new", "clear", "diff", "mention", "model", "approvals", "permissions", "collab", "resume"]);

export function useComposerCommandPalette(
  options: UseComposerCommandPaletteOptions,
): UseComposerCommandPaletteState {
  const dispatch = useAppDispatch();
  const customPrompts = useAppSelector((state) => state.customPrompts);
  const trigger = usePaletteTrigger(options.inputText);
  const mention = useMentionPalette(options, dispatch, trigger.mode, trigger.activeTrigger);
  const selectedConversation = useSelectedConversation(options.selectedThreadId);
  const runtimeState = useSlashRuntimeState(options.selectedThreadId);
  const mentionSession = useAppSelector(
    useMemo(
      () => (state: AppState) => mention.sessionId === null ? null : state.fuzzySearchSessionsById[mention.sessionId] ?? null,
      [mention.sessionId],
    ),
  );
  const collections = useSlashCollections(options, runtimeState.realtimeState);
  const items = useMemo(
    () => createPaletteItems(trigger.mode, trigger.activeTrigger, options.models, options.selectedModel, options.permissionLevel, mentionSession, mention.error, collections),
    [collections, mention.error, mentionSession, options.models, options.permissionLevel, options.selectedModel, trigger.activeTrigger, trigger.mode],
  );
  const [selectedIndex, setSelectedIndex] = useBoundedSelection(items.length);
  const slashContext = useMemo<SlashExecutionContext>(() => ({
    selectedThreadId: options.selectedThreadId,
    selectedRootPath: options.selectedRootPath,
    selectedServiceTier: options.selectedServiceTier,
    collaborationPreset: options.collaborationPreset,
    selectedConversation,
    configSnapshot: runtimeState.configSnapshot,
    account: runtimeState.account,
    rateLimits: runtimeState.rateLimits,
    connectionStatus: runtimeState.connectionStatus,
    realtimeState: runtimeState.realtimeState,
    collaborationModes: runtimeState.collaborationModes,
    taskRunning: options.isResponding,
  }), [options.collaborationPreset, options.isResponding, options.selectedRootPath, options.selectedServiceTier, options.selectedThreadId, runtimeState.account, runtimeState.collaborationModes, runtimeState.configSnapshot, runtimeState.connectionStatus, runtimeState.rateLimits, runtimeState.realtimeState, selectedConversation]);
  const slashDeps = useMemo<SlashExecutionDependencies>(() => ({
    composerCommandBridge: options.composerCommandBridge,
    dispatch,
    onSelectServiceTier: options.onSelectServiceTier,
    onSelectPermissionLevel: options.onSelectPermissionLevel,
    onSelectCollaborationPreset: options.onSelectCollaborationPreset,
    onLogout: options.onLogout,
  }), [dispatch, options.composerCommandBridge, options.onLogout, options.onSelectCollaborationPreset, options.onSelectPermissionLevel, options.onSelectServiceTier]);
  const dismiss = useCallback(async () => {
    trigger.suppressCurrentTrigger();
    trigger.setManualMode(null);
    mention.clearError();
    setSelectedIndex(0);
    await mention.stop();
  }, [mention, setSelectedIndex, trigger]);
  const selectItem = useSelectPaletteItem(options, trigger, mention, dismiss, slashContext, slashDeps, customPrompts);
  const selectCurrentItem = useCallback(() => selectItem(items[selectedIndex] ?? null), [items, selectedIndex, selectItem]);
  const handleKeyDown = usePaletteKeyboard(trigger.mode, items.length, setSelectedIndex, dismiss, selectCurrentItem);

  return {
    textareaRef: trigger.textareaRef,
    open: trigger.mode !== null,
    title: getPaletteTitle(trigger.mode),
    items,
    selectedIndex,
    dismiss,
    handleKeyDown,
    onSelectItem: (index) => void selectItem(items[index] ?? null),
    syncFromTextInput: trigger.syncFromTextInput,
    syncFromTextareaSelection: trigger.syncFromTextareaSelection,
  };
}

function usePaletteTrigger(inputText: string) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [manualMode, setManualMode] = useState<ManualPaletteMode>(null);
  const [suppressedTriggerKey, setSuppressedTriggerKey] = useState<string | null>(null);
  const detectedTrigger = useMemo(() => getActiveComposerTrigger(inputText, caret), [caret, inputText]);
  const triggerKey = useMemo(() => createTriggerKey(detectedTrigger), [detectedTrigger]);
  const activeTrigger = useMemo(() => suppressedTriggerKey === triggerKey ? null : detectedTrigger, [detectedTrigger, suppressedTriggerKey, triggerKey]);
  const mode = useMemo<PaletteMode>(() => manualMode ?? (activeTrigger?.kind === "slash" ? "slash-root" : activeTrigger?.kind === "mention" ? "mention" : null), [activeTrigger, manualMode]);

  useEffect(() => {
    if (suppressedTriggerKey !== null && suppressedTriggerKey !== triggerKey) setSuppressedTriggerKey(null);
  }, [suppressedTriggerKey, triggerKey]);
  useEffect(() => setCaret(readTextareaCaret(textareaRef.current, inputText.length)), [inputText]);

  return {
    textareaRef,
    activeTrigger,
    mode,
    setManualMode,
    setSuppressedTriggerKey,
    suppressCurrentTrigger: () => setSuppressedTriggerKey(triggerKey),
    syncFromTextInput: (value: string, nextCaret: number) => {
      if (manualMode !== null) setManualMode(null);
      setCaret(Math.max(0, Math.min(nextCaret, value.length)));
    },
    syncFromTextareaSelection: () => setCaret(readTextareaCaret(textareaRef.current, inputText.length)),
  };
}

function useMentionPalette(options: UseComposerCommandPaletteOptions, dispatch: AppStoreApi["dispatch"], mode: PaletteMode, activeTrigger: ComposerActiveTrigger | null) {
  const previousThreadIdRef = useRef(options.selectedThreadId);
  const previousRootPathRef = useRef(options.selectedRootPath);
  const refs = useMentionSessionRefs();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => stopMentionSession({ composerCommandBridge: options.composerCommandBridge, dispatch, refs, setMentionSessionId: setSessionId }), [dispatch, options.composerCommandBridge, refs]);

  useEffect(() => {
    if (previousThreadIdRef.current === options.selectedThreadId && previousRootPathRef.current === options.selectedRootPath) return;
    previousThreadIdRef.current = options.selectedThreadId;
    previousRootPathRef.current = options.selectedRootPath;
    void stop();
    setError(null);
  }, [options.selectedRootPath, options.selectedThreadId, stop]);
  useEffect(() => {
    if (mode !== "mention" || activeTrigger?.kind !== "mention") return void stop();
    if (options.selectedRootPath === null) {
      setError(NO_WORKSPACE_MESSAGE);
      return void stop();
    }
    void syncMentionSession({ composerCommandBridge: options.composerCommandBridge, dispatch, refs, setMentionSessionId: setSessionId, rootPath: options.selectedRootPath, query: activeTrigger.query, setPaletteError: setError });
  }, [activeTrigger, dispatch, mode, options.composerCommandBridge, options.selectedRootPath, stop, refs]);

  return { sessionId, error, clearError: () => setError(null), stop };
}

function useMentionSessionRefs(): MentionSessionRefs {
  const sessionIdRef = useRef<string | null>(null);
  const rootPathRef = useRef<string | null>(null);
  const syncedQueryRef = useRef<string | null>(null);
  const syncTokenRef = useRef(0);
  return useMemo(() => ({ sessionIdRef, rootPathRef, syncedQueryRef, syncTokenRef }), []);
}

function useBoundedSelection(itemCount: number) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => setSelectedIndex((current) => itemCount === 0 ? 0 : Math.min(current, itemCount - 1)), [itemCount]);
  return [selectedIndex, setSelectedIndex] as const;
}

function useSelectPaletteItem(options: UseComposerCommandPaletteOptions, trigger: ReturnType<typeof usePaletteTrigger>, mention: ReturnType<typeof useMentionPalette>, dismiss: () => Promise<void>, slashContext: SlashExecutionContext, slashDeps: SlashExecutionDependencies, customPrompts: ReadonlyArray<CustomPromptOutput>) {
  return useCallback(async (item: ComposerCommandPaletteItem | null) => {
    if (item === null || item.disabled) return;
    try {
      if (trigger.mode === "mention" && trigger.activeTrigger?.kind === "mention") return selectMentionItem(item, options, trigger, dismiss);
      if (trigger.mode === "slash-model") return selectModelItem(item.key, options.onSelectModel, dismiss, trigger.textareaRef);
      if (trigger.mode === "slash-permissions") return selectPermissionItem(item.key, slashContext.configSnapshot, slashDeps, dismiss, trigger.textareaRef);
      if (trigger.mode === "slash-collab") return selectCollaborationItem(item.key, options.onSelectCollaborationPreset, dismiss, trigger.textareaRef);
      if (trigger.mode === "slash-resume") return selectResumeItem(item.key, slashContext, slashDeps, dismiss, trigger.textareaRef);
      await selectRootSlashItem(item.key, options, trigger, mention, slashContext, slashDeps, customPrompts);
    } catch (error) {
      slashDeps.dispatch({
        type: "banner/pushed",
        banner: {
          id: `slash:error:${item.key}`,
          level: "error",
          title: "Slash 命令执行失败",
          detail: toErrorMessage(error),
          source: "slash-command",
        },
      });
    }
  }, [customPrompts, dismiss, mention, options, slashContext, slashDeps, trigger]);
}

async function selectMentionItem(item: ComposerCommandPaletteItem, options: UseComposerCommandPaletteOptions, trigger: ReturnType<typeof usePaletteTrigger>, dismiss: () => Promise<void>): Promise<void> {
  const mentionReference = item.description ?? item.key;
  const next = replaceComposerTrigger(options.inputText, trigger.activeTrigger!.range, "");
  options.onInputChange(next.text);
  options.onAppendMentionPath(mentionReference, next.text);
  await dismiss();
  focusTextarea(trigger.textareaRef, next.caret);
}

async function selectModelItem(itemKey: string, onSelectModel: (model: string) => void, dismiss: () => Promise<void>, textareaRef: RefObject<HTMLTextAreaElement>): Promise<void> {
  onSelectModel(itemKey);
  await dismiss();
  focusTextarea(textareaRef, readTextareaCaret(textareaRef.current, 0));
}

async function selectPermissionItem(itemKey: string, configSnapshot: ConfigReadResponse | null, slashDeps: SlashExecutionDependencies, dismiss: () => Promise<void>, textareaRef: RefObject<HTMLTextAreaElement>): Promise<void> {
  await applySlashPermissionLevel(toPermissionLevel(itemKey), configSnapshot, slashDeps);
  await dismiss();
  focusTextarea(textareaRef, readTextareaCaret(textareaRef.current, 0));
}

async function selectCollaborationItem(itemKey: string, onSelectCollaborationPreset: (preset: CollaborationPreset) => void, dismiss: () => Promise<void>, textareaRef: RefObject<HTMLTextAreaElement>): Promise<void> {
  onSelectCollaborationPreset(itemKey as CollaborationPreset);
  await dismiss();
  focusTextarea(textareaRef, readTextareaCaret(textareaRef.current, 0));
}

async function selectResumeItem(itemKey: string, slashContext: SlashExecutionContext, slashDeps: SlashExecutionDependencies, dismiss: () => Promise<void>, textareaRef: RefObject<HTMLTextAreaElement>): Promise<void> {
  await resumeSlashThread(itemKey, slashContext, slashDeps);
  await dismiss();
  focusTextarea(textareaRef, readTextareaCaret(textareaRef.current, 0));
}

async function selectRootSlashItem(itemKey: string, options: UseComposerCommandPaletteOptions, trigger: ReturnType<typeof usePaletteTrigger>, mention: ReturnType<typeof useMentionPalette>, slashContext: SlashExecutionContext, slashDeps: SlashExecutionDependencies, customPrompts: ReadonlyArray<CustomPromptOutput>): Promise<void> {
  if (trigger.activeTrigger?.kind !== "slash") return;
  const customPromptName = customPromptNameFromPaletteKey(itemKey);
  if (customPromptName !== null) {
    return selectCustomPromptItem(customPromptName, customPrompts, options, trigger);
  }
  const parsed = parseComposerSlashQuery(trigger.activeTrigger.query);
  mention.clearError();
  if (LOCAL_OR_PICKER_COMMANDS.has(itemKey)) {
    await executeSlashCommand(itemKey, { inputText: options.inputText, activeTrigger: trigger.activeTrigger, onInputChange: options.onInputChange, onCreateThread: options.onCreateThread, onToggleDiff: options.onToggleDiff }, trigger.textareaRef, trigger.setManualMode, trigger.setSuppressedTriggerKey);
    return;
  }
  await executeDirectSlashCommand(itemKey, parsed.argumentsText, slashContext, slashDeps);
  await executeSlashCommand(itemKey, { inputText: options.inputText, activeTrigger: trigger.activeTrigger, onInputChange: options.onInputChange, onCreateThread: options.onCreateThread, onToggleDiff: options.onToggleDiff }, trigger.textareaRef, trigger.setManualMode, trigger.setSuppressedTriggerKey);
}

async function selectCustomPromptItem(
  promptName: string,
  customPrompts: ReadonlyArray<CustomPromptOutput>,
  options: UseComposerCommandPaletteOptions,
  trigger: ReturnType<typeof usePaletteTrigger>,
): Promise<void> {
  const prompt = customPrompts.find((item) => item.name === promptName) ?? null;
  if (prompt === null || trigger.activeTrigger?.kind !== "slash") {
    return;
  }
  const insert = createCustomPromptCommandInsert(prompt);
  const next = replaceComposerTrigger(options.inputText, trigger.activeTrigger.range, insert.text);
  options.onInputChange(next.text);
  trigger.setSuppressedTriggerKey(null);
  const caret = insert.cursor === null
    ? next.caret
    : trigger.activeTrigger.range.start + insert.cursor;
  focusTextarea(trigger.textareaRef, caret);
}

function usePaletteKeyboard(mode: PaletteMode, itemCount: number, setSelectedIndex: Dispatch<SetStateAction<number>>, dismiss: () => Promise<void>, selectCurrentItem: () => Promise<void>) {
  return useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === null || itemCount === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % itemCount);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + itemCount) % itemCount);
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void selectCurrentItem();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      void dismiss();
      return true;
    }
    return false;
  }, [dismiss, itemCount, mode, selectCurrentItem, setSelectedIndex]);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
