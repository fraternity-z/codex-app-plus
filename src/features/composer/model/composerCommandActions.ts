import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ComposerPermissionLevel } from "./composerPermission";
import type { ComposerActiveTrigger } from "./composerInputTriggers";
import { replaceComposerTrigger } from "./composerInputTriggers";

export interface SlashCommandExecutionOptions {
  readonly inputText: string;
  readonly activeTrigger: ComposerActiveTrigger | null;
  readonly onInputChange: (text: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onToggleDiff: () => void;
}

export function focusTextarea(textareaRef: RefObject<HTMLTextAreaElement>, caret: number): void {
  window.requestAnimationFrame(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(caret, caret);
  });
}

export function readTextareaCaret(textarea: HTMLTextAreaElement | null, fallback: number): number {
  return textarea?.selectionStart ?? fallback;
}

export async function executeSlashCommand(
  itemKey: string,
  options: SlashCommandExecutionOptions,
  textareaRef: RefObject<HTMLTextAreaElement>,
  setManualMode: Dispatch<SetStateAction<"slash-model" | "slash-permissions" | null>>,
  setSuppressedTriggerKey: Dispatch<SetStateAction<string | null>>,
): Promise<void> {
  if (options.activeTrigger?.kind !== "slash") {
    return;
  }

  const replacement = itemKey === "mention" ? "@" : "";
  const next = replaceComposerTrigger(options.inputText, options.activeTrigger.range, replacement);
  options.onInputChange(next.text);
  setSuppressedTriggerKey(null);
  if (itemKey === "clear" || itemKey === "new") {
    await options.onCreateThread();
  }
  if (itemKey === "diff") {
    options.onToggleDiff();
  }
  if (itemKey === "model") {
    setManualMode("slash-model");
  }
  if (itemKey === "approvals" || itemKey === "permissions") {
    setManualMode("slash-permissions");
  }
  focusTextarea(textareaRef, next.caret);
}

export function toPermissionLevel(value: string): ComposerPermissionLevel {
  return value === "full" ? "full" : "default";
}
