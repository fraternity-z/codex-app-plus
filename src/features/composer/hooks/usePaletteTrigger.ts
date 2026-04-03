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
import type { ComposerActiveTrigger } from "../model/composerInputTriggers";
import { getActiveComposerTrigger } from "../model/composerInputTriggers";
import { createTriggerKey, type PaletteMode } from "../model/composerPaletteData";
import { readTextareaCaret } from "../model/composerCommandActions";

export type ManualPaletteMode = "slash-model" | "slash-permissions" | "slash-collab" | "slash-resume" | "slash-personality" | null;

export interface PaletteTriggerState {
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly activeTrigger: ComposerActiveTrigger | null;
  readonly mode: PaletteMode;
  readonly setManualMode: Dispatch<SetStateAction<ManualPaletteMode>>;
  readonly setSuppressedTriggerKey: Dispatch<SetStateAction<string | null>>;
  readonly suppressCurrentTrigger: () => void;
  readonly syncFromTextInput: (value: string, nextCaret: number) => void;
  readonly syncFromTextareaSelection: () => void;
}

export function usePaletteTrigger(inputText: string): PaletteTriggerState {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [manualMode, setManualMode] = useState<ManualPaletteMode>(null);
  const [suppressedTriggerKey, setSuppressedTriggerKey] = useState<string | null>(null);
  const detectedTrigger = useMemo(() => getActiveComposerTrigger(inputText, caret), [caret, inputText]);
  const triggerKey = useMemo(() => createTriggerKey(detectedTrigger), [detectedTrigger]);
  const activeTrigger = useMemo(() => suppressedTriggerKey === triggerKey ? null : detectedTrigger, [detectedTrigger, suppressedTriggerKey, triggerKey]);
  const mode = useMemo<PaletteMode>(() => {
    if (manualMode !== null) {
      return manualMode;
    }
    if (activeTrigger?.kind === "slash") {
      return "slash-root";
    }
    if (activeTrigger?.kind === "mention") {
      return "mention";
    }
    if (activeTrigger?.kind === "skill") {
      return "skill";
    }
    return null;
  }, [activeTrigger, manualMode]);

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

export function useBoundedSelection(itemCount: number) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => setSelectedIndex((current) => itemCount === 0 ? 0 : Math.min(current, itemCount - 1)), [itemCount]);
  return [selectedIndex, setSelectedIndex] as const;
}

export function usePaletteKeyboard(mode: PaletteMode, itemCount: number, setSelectedIndex: Dispatch<SetStateAction<number>>, dismiss: () => Promise<void>, selectCurrentItem: () => Promise<void>, completeCurrentItem: () => void) {
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
    if (event.key === "Tab") {
      event.preventDefault();
      completeCurrentItem();
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
  }, [completeCurrentItem, dismiss, itemCount, mode, selectCurrentItem, setSelectedIndex]);
}
