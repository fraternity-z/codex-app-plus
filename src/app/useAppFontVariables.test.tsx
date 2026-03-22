import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_PREFERENCES } from "../features/settings/hooks/useAppPreferences";
import {
  APP_CODE_FONT_FAMILY_VAR,
  APP_CODE_FONT_SIZE_VAR,
  APP_UI_FONT_FAMILY_VAR,
  APP_UI_FONT_SIZE_VAR,
  readTerminalFontSettingsFromDocument,
} from "../features/settings/model/fontCssVars";
import { useAppFontVariables } from "./useAppFontVariables";

describe("useAppFontVariables", () => {
  it("writes normalized UI and code font variables to the document root", () => {
    renderHook(() =>
      useAppFontVariables({
        ...DEFAULT_APP_PREFERENCES,
        uiFontFamily: "IBM Plex Sans",
        uiFontSize: 15,
        codeFontFamily: "JetBrains Mono",
        codeFontSize: 14,
      }),
    );

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue(APP_UI_FONT_FAMILY_VAR)).toBe("IBM Plex Sans");
    expect(rootStyle.getPropertyValue(APP_UI_FONT_SIZE_VAR)).toBe("15px");
    expect(rootStyle.getPropertyValue(APP_CODE_FONT_FAMILY_VAR)).toBe("JetBrains Mono");
    expect(rootStyle.getPropertyValue(APP_CODE_FONT_SIZE_VAR)).toBe("14px");
    expect(readTerminalFontSettingsFromDocument()).toEqual({
      fontFamily: "JetBrains Mono",
      fontSize: 14,
    });
  });
});
