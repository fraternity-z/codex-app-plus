import {
  clampCodeFontSize,
  clampTerminalFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeTerminalFontFamily,
  normalizeUiFontFamily,
} from "./fontPreferences";

export interface AppFontSettings {
  readonly uiFontFamily: string;
  readonly uiFontSize: number;
  readonly codeFontFamily: string;
  readonly codeFontSize: number;
  readonly terminalFontFamily: string;
  readonly terminalFontSize: number;
}

export interface TerminalFontSettings {
  readonly fontFamily: string;
  readonly fontSize: number;
}

export const APP_UI_FONT_FAMILY_VAR = "--app-ui-font-family";
export const APP_UI_FONT_SIZE_VAR = "--app-ui-font-size";
export const APP_CODE_FONT_FAMILY_VAR = "--app-code-font-family";
export const APP_CODE_FONT_SIZE_VAR = "--app-code-font-size";
export const APP_TERMINAL_FONT_FAMILY_VAR = "--app-terminal-font-family";
export const APP_TERMINAL_FONT_SIZE_VAR = "--app-terminal-font-size";

function formatFontSize(value: number): string {
  return `${value}px`;
}

function readRootCssVar(styles: CSSStyleDeclaration, variableName: string): string {
  return styles.getPropertyValue(variableName).trim();
}

export function applyAppFontVariables(
  root: HTMLElement,
  settings: AppFontSettings,
): void {
  root.style.setProperty(
    APP_UI_FONT_FAMILY_VAR,
    normalizeUiFontFamily(settings.uiFontFamily),
  );
  root.style.setProperty(
    APP_UI_FONT_SIZE_VAR,
    formatFontSize(clampUiFontSize(settings.uiFontSize)),
  );
  root.style.setProperty(
    APP_CODE_FONT_FAMILY_VAR,
    normalizeCodeFontFamily(settings.codeFontFamily),
  );
  root.style.setProperty(
    APP_CODE_FONT_SIZE_VAR,
    formatFontSize(clampCodeFontSize(settings.codeFontSize)),
  );
  root.style.setProperty(
    APP_TERMINAL_FONT_FAMILY_VAR,
    normalizeTerminalFontFamily(settings.terminalFontFamily),
  );
  root.style.setProperty(
    APP_TERMINAL_FONT_SIZE_VAR,
    formatFontSize(clampTerminalFontSize(settings.terminalFontSize)),
  );
}

export function readTerminalFontSettingsFromDocument(): TerminalFontSettings {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      fontFamily: normalizeTerminalFontFamily(undefined),
      fontSize: clampTerminalFontSize(Number.NaN),
    };
  }

  const styles = window.getComputedStyle(document.documentElement);
  return {
    fontFamily: normalizeTerminalFontFamily(
      readRootCssVar(styles, APP_TERMINAL_FONT_FAMILY_VAR),
    ),
    fontSize: clampTerminalFontSize(
      Number.parseFloat(readRootCssVar(styles, APP_TERMINAL_FONT_SIZE_VAR)),
    ),
  };
}
