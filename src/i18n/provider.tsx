import { createContext, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { formatMessage } from "./format";
import { resolveLocale } from "./locale";
import { MESSAGES_BY_LOCALE } from "./messages";
import type { MessageKey } from "./messages/schema";
import type { Locale, TranslationParams, UiLanguage } from "./types";

interface I18nContextValue {
  readonly language: UiLanguage;
  readonly locale: Locale;
  readonly setLanguage: (language: UiLanguage) => void;
  readonly t: (key: MessageKey, params?: TranslationParams) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

function useDocumentLocale(locale: Locale, t: I18nContextValue["t"]): void {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("app.document.title");
  }, [locale, t]);
}

interface I18nProviderProps extends PropsWithChildren {
  readonly language: UiLanguage;
  readonly setLanguage: (language: UiLanguage) => void;
}

export function I18nProvider(props: I18nProviderProps): JSX.Element {
  const locale = resolveLocale(props.language);
  const messages = useMemo(() => MESSAGES_BY_LOCALE[locale], [locale]);
  const value = useMemo<I18nContextValue>(() => ({
    language: props.language,
    locale,
    setLanguage: props.setLanguage,
    t: (key, params) => formatMessage(messages, key, params),
  }), [locale, messages, props.language, props.setLanguage]);

  useDocumentLocale(locale, value.t);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}
