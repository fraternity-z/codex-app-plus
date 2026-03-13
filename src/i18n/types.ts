export type Locale = "zh-CN" | "en-US";
export type UiLanguage = "auto" | Locale;
export type TranslationValue = string | number;
export type TranslationParams = Readonly<Record<string, TranslationValue>>;
