export interface ComposerTriggerRange {
  readonly start: number;
  readonly end: number;
}

export interface ComposerActiveTrigger {
  readonly kind: "slash" | "mention";
  readonly query: string;
  readonly range: ComposerTriggerRange;
}

export function getActiveComposerTrigger(text: string, caret: number): ComposerActiveTrigger | null {
  if (caret < 0 || caret > text.length) {
    return null;
  }

  return getSlashTrigger(text, caret) ?? getMentionTrigger(text, caret);
}

export function replaceComposerTrigger(
  text: string,
  range: ComposerTriggerRange,
  replacement: string,
): { readonly text: string; readonly caret: number } {
  const nextText = `${text.slice(0, range.start)}${replacement}${text.slice(range.end)}`;
  const collapsed = collapseAdjacentSpaces(nextText, range.start + replacement.length);
  return { text: collapsed.text, caret: collapsed.caret };
}

function getSlashTrigger(text: string, caret: number): ComposerActiveTrigger | null {
  const lineStart = text.lastIndexOf("\n", Math.max(caret - 1, 0)) + 1;
  const currentLine = text.slice(lineStart, caret);
  const match = currentLine.match(/^\/([^\n]*)$/);
  if (match === null) {
    return null;
  }

  return {
    kind: "slash",
    query: (match[1] ?? "").trimStart(),
    range: { start: lineStart, end: caret },
  };
}

function getMentionTrigger(text: string, caret: number): ComposerActiveTrigger | null {
  const prefix = text.slice(0, caret);
  const match = prefix.match(/(?:^|[\s])@([^\s@]*)$/);
  if (match === null || match.index === undefined) {
    return null;
  }

  const atIndex = match.index + match[0].lastIndexOf("@");
  return {
    kind: "mention",
    query: match[1] ?? "",
    range: { start: atIndex, end: caret },
  };
}

function collapseAdjacentSpaces(text: string, caret: number): { readonly text: string; readonly caret: number } {
  if (caret <= 0 || caret >= text.length) {
    return { text, caret };
  }

  const left = text[caret - 1];
  const right = text[caret];
  if (left !== " " || right !== " ") {
    return { text, caret };
  }

  return { text: `${text.slice(0, caret)}${text.slice(caret + 1)}`, caret };
}
