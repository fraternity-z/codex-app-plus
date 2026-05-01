import { useEffect } from "react";
import { applyAppFontVariables, type AppPreferences } from "../features/settings";

type AppFontPreferences = Pick<
  AppPreferences,
  "uiFontFamily" | "uiFontSize" | "codeFontFamily" | "codeFontSize"
>;

export function useAppFontVariables(preferences: AppFontPreferences): void {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    applyAppFontVariables(document.documentElement, preferences);
  }, [preferences]);
}
