import type { MessageKey } from "./messages/schema";
import type { UiLanguage } from "./types";

export interface LanguageOption {
  readonly value: UiLanguage;
  readonly label: string;
}

type Translator = (key: MessageKey) => string;

export function createLanguageOptions(t: Translator): ReadonlyArray<LanguageOption> {
  return [
    { value: "auto", label: t("settings.general.language.options.auto") },
    { value: "zh-CN", label: t("settings.general.language.options.zhCN") },
    { value: "en-US", label: t("settings.general.language.options.enUS") }
  ];
}
