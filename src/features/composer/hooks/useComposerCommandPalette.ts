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
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { AppState } from "../../../domain/types";
import type { AppStoreApi } from "../../../state/store";
import { useAppDispatch, useAppSelector } from "../../../state/store";
import type { ComposerCommandPaletteItem } from "../ui/ComposerCommandPalette";
import {
  executeSlashCommand,
  focusTextarea,
  readTextareaCaret,
  toPermissionLevel,
} from "../model/composerCommandActions";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { getActiveComposerTrigger, replaceComposerTrigger, type ComposerActiveTrigger } from "../model/composerInputTriggers";
import { createPaletteItems, createTriggerKey, getPaletteTitle, type PaletteMode } from "../model/composerPaletteData";
import { stopMentionSession, syncMentionSession, type MentionSessionRefs } from "../model/composerMentionSession";

type ManualPaletteMode = "slash-model" | "slash-permissions" | null;

interface UseComposerCommandPaletteOptions {
  readonly inputText: string;
  readonly selectedRootPath: string | null;
  readonly selectedThreadId: string | null;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly composerCommandBridge: ComposerCommandBridge;
  readonly onInputChange: (text: string) => void;
  readonly onAppendMentionPath: (path: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onToggleDiff: () => void;
  readonly onSelectModel: (model: string) => void;
  readonly onSelectPermissionLevel: (level: ComposerPermissionLevel) => void;
}

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

export function useComposerCommandPalette(
  options: UseComposerCommandPaletteOptions,
): UseComposerCommandPaletteState {
  const dispatch = useAppDispatch();
  const trigger = usePaletteTrigger(options.inputText);
  const mention = useMentionPalette(options, dispatch, trigger.mode, trigger.activeTrigger);
  const mentionSession = useAppSelector(
    useMemo(
      () => (state: AppState) => mention.sessionId === null ? null : state.fuzzySearchSessionsById[mention.sessionId] ?? null,
      [mention.sessionId],
    ),
  );
  const items = useMemo(
    () => createPaletteItems(trigger.mode, trigger.activeTrigger, options.models, options.selectedModel, options.permissionLevel, mentionSession, mention.error),
    [mention.error, mentionSession, options.models, options.permissionLevel, options.selectedModel, trigger.activeTrigger, trigger.mode],
  );
  const [selectedIndex, setSelectedIndex] = useBoundedSelection(items.length);
  const dismiss = useCallback(async () => {
    trigger.suppressCurrentTrigger();
    trigger.setManualMode(null);
    mention.clearError();
    setSelectedIndex(0);
    await mention.stop();
  }, [mention, setSelectedIndex, trigger]);
  const selectItem = useSelectPaletteItem(options, trigger, mention, dismiss);
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
    if (suppressedTriggerKey !== null && suppressedTriggerKey !== triggerKey) {
      setSuppressedTriggerKey(null);
    }
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
      if (manualMode !== null) {
        setManualMode(null);
      }
      setCaret(Math.max(0, Math.min(nextCaret, value.length)));
    },
    syncFromTextareaSelection: () => setCaret(readTextareaCaret(textareaRef.current, inputText.length)),
  };
}

function useMentionPalette(
  options: UseComposerCommandPaletteOptions,
  dispatch: AppStoreApi["dispatch"],
  mode: PaletteMode,
  activeTrigger: ComposerActiveTrigger | null,
) {
  const previousThreadIdRef = useRef(options.selectedThreadId);
  const previousRootPathRef = useRef(options.selectedRootPath);
  const refs = useMentionSessionRefs();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => stopMentionSession({ composerCommandBridge: options.composerCommandBridge, dispatch, refs, setMentionSessionId: setSessionId }), [dispatch, options.composerCommandBridge, refs]);

  useEffect(() => {
    if (previousThreadIdRef.current === options.selectedThreadId && previousRootPathRef.current === options.selectedRootPath) {
      return;
    }
    previousThreadIdRef.current = options.selectedThreadId;
    previousRootPathRef.current = options.selectedRootPath;
    void stop();
    setError(null);
  }, [options.selectedRootPath, options.selectedThreadId, stop]);
  useEffect(() => {
    if (mode !== "mention" || activeTrigger?.kind !== "mention") {
      void stop();
      return;
    }
    if (options.selectedRootPath === null) {
      setError(NO_WORKSPACE_MESSAGE);
      void stop();
      return;
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
  useEffect(() => {
    setSelectedIndex((current) => {
      if (itemCount === 0) {
        return 0;
      }
      return Math.min(current, itemCount - 1);
    });
  }, [itemCount]);
  return [selectedIndex, setSelectedIndex] as const;
}

function useSelectPaletteItem(
  options: UseComposerCommandPaletteOptions,
  trigger: ReturnType<typeof usePaletteTrigger>,
  mention: ReturnType<typeof useMentionPalette>,
  dismiss: () => Promise<void>,
) {
  return useCallback(async (item: ComposerCommandPaletteItem | null) => {
    if (item === null || item.disabled) {
      return;
    }
    if (trigger.mode === "mention" && trigger.activeTrigger?.kind === "mention") {
      const next = replaceComposerTrigger(options.inputText, trigger.activeTrigger.range, "");
      options.onInputChange(next.text);
      options.onAppendMentionPath(item.meta ?? item.label);
      await dismiss();
      focusTextarea(trigger.textareaRef, next.caret);
      return;
    }
    if (trigger.mode === "slash-model") {
      options.onSelectModel(item.key);
      await dismiss();
      focusTextarea(trigger.textareaRef, readTextareaCaret(trigger.textareaRef.current, 0));
      return;
    }
    if (trigger.mode === "slash-permissions") {
      options.onSelectPermissionLevel(toPermissionLevel(item.key));
      await dismiss();
      focusTextarea(trigger.textareaRef, readTextareaCaret(trigger.textareaRef.current, 0));
      return;
    }
    await executeSlashCommand(item.key, { inputText: options.inputText, activeTrigger: trigger.activeTrigger, onInputChange: options.onInputChange, onCreateThread: options.onCreateThread, onToggleDiff: options.onToggleDiff }, trigger.textareaRef, trigger.setManualMode, trigger.setSuppressedTriggerKey);
    mention.clearError();
  }, [dismiss, mention, options, trigger]);
}

function usePaletteKeyboard(
  mode: PaletteMode,
  itemCount: number,
  setSelectedIndex: Dispatch<SetStateAction<number>>,
  dismiss: () => Promise<void>,
  selectCurrentItem: () => Promise<void>,
) {
  return useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === null || itemCount === 0) {
      return false;
    }
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
