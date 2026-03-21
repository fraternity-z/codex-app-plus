import { useEffect } from "react";
import type { AppPreferences } from "../features/settings/hooks/useAppPreferences";
import { applyAppFontVariables } from "../features/settings/model/fontCssVars";

type AppFontPreferences = Pick<
  AppPreferences,
  | "uiFontFamily"
  | "uiFontSize"
  | "codeFontFamily"
  | "codeFontSize"
  | "terminalFontFamily"
  | "terminalFontSize"
>;

export function useAppFontVariables(preferences: AppFontPreferences): void {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    applyAppFontVariables(document.documentElement, preferences);
  }, [preferences]);
}
