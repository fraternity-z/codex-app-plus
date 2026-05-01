import { useEffect } from "react";
import type { ResolvedTheme } from "../domain/theme";
import {
  applyAppAppearanceVariables,
  getAppearanceThemeColors,
  type AppPreferences,
} from "../features/settings";

type AppAppearancePreferences = Pick<
  AppPreferences,
  "appearanceColors" | "contrast"
>;

export function useAppAppearanceVariables(
  preferences: AppAppearancePreferences,
  resolvedTheme: ResolvedTheme,
): void {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    applyAppAppearanceVariables(
      document.documentElement,
      {
        colors: getAppearanceThemeColors(
          preferences.appearanceColors,
          resolvedTheme,
        ),
        contrast: preferences.contrast,
      },
      resolvedTheme,
    );
  }, [preferences, resolvedTheme]);
}
