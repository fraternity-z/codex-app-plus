import { useEffect } from "react";
import type { ResolvedTheme } from "../domain/theme";
import { applyCodeStyleVariables, type AppPreferences } from "../features/settings";

type AppCodeStylePreference = Pick<AppPreferences, "codeStyle">;

export function useAppCodeStyleVariables(
  preferences: AppCodeStylePreference,
  resolvedTheme: ResolvedTheme,
): void {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    applyCodeStyleVariables(
      document.documentElement,
      preferences.codeStyle,
      resolvedTheme,
    );
  }, [preferences.codeStyle, resolvedTheme]);
}
