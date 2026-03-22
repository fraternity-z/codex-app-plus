import {
  clampCodeFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeUiFontFamily,
} from "./fontPreferences";

export interface AppFontSettings {
  readonly uiFontFamily: string;
  readonly uiFontSize: number;
  readonly codeFontFamily: string;
  readonly codeFontSize: number;
}

export interface TerminalFontSettings {
  readonly fontFamily: string;
  readonly fontSize: number;
}

export const APP_UI_FONT_FAMILY_VAR = "--app-ui-font-family";
export const APP_UI_FONT_SIZE_VAR = "--app-ui-font-size";
export const APP_CODE_FONT_FAMILY_VAR = "--app-code-font-family";
export const APP_CODE_FONT_SIZE_VAR = "--app-code-font-size";

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
}

export function readTerminalFontSettingsFromDocument(): TerminalFontSettings {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      fontFamily: normalizeCodeFontFamily(undefined),
      fontSize: clampCodeFontSize(Number.NaN),
    };
  }

  const styles = window.getComputedStyle(document.documentElement);
  return {
    fontFamily: normalizeCodeFontFamily(
      readRootCssVar(styles, APP_CODE_FONT_FAMILY_VAR),
    ),
    fontSize: clampCodeFontSize(
      Number.parseFloat(readRootCssVar(styles, APP_CODE_FONT_SIZE_VAR)),
    ),
  };
}
