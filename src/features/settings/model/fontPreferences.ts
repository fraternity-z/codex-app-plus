const DEFAULT_UI_FONT_STACK =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Microsoft YaHei UI", sans-serif';
const DEFAULT_CODE_FONT_STACK =
  'Consolas, "Cascadia Mono", "Cascadia Code", "Courier New", monospace';

export const DEFAULT_UI_FONT_FAMILY = DEFAULT_UI_FONT_STACK;
export const DEFAULT_CODE_FONT_FAMILY = DEFAULT_CODE_FONT_STACK;

export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 18;
export const UI_FONT_SIZE_DEFAULT = 14;

export const CODE_FONT_SIZE_MIN = 11;
export const CODE_FONT_SIZE_MAX = 18;
export const CODE_FONT_SIZE_DEFAULT = 13;

function clampFontSize(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, minimum), maximum);
}

export function clampUiFontSize(value: number): number {
  return clampFontSize(
    value,
    UI_FONT_SIZE_MIN,
    UI_FONT_SIZE_MAX,
    UI_FONT_SIZE_DEFAULT,
  );
}

export function clampCodeFontSize(value: number): number {
  return clampFontSize(
    value,
    CODE_FONT_SIZE_MIN,
    CODE_FONT_SIZE_MAX,
    CODE_FONT_SIZE_DEFAULT,
  );
}

export function normalizeFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeUiFontFamily(value: unknown): string {
  return normalizeFontFamily(value, DEFAULT_UI_FONT_FAMILY);
}

export function normalizeCodeFontFamily(value: unknown): string {
  return normalizeFontFamily(value, DEFAULT_CODE_FONT_FAMILY);
}
