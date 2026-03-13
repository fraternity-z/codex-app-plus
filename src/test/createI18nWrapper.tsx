import type { PropsWithChildren } from "react";
import { I18nProvider, type Locale } from "../i18n";

export function createI18nWrapper(locale: Locale = "zh-CN") {
  return function I18nWrapper({ children }: PropsWithChildren): JSX.Element {
    return <I18nProvider language={locale} setLanguage={() => undefined}>{children}</I18nProvider>;
  };
}
