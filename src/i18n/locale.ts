import type { Locale, UiLanguage } from "./types";

const CHINESE_LANGUAGE_CODE = "zh";
const ENGLISH_LANGUAGE_CODE = "en";

export const DEFAULT_LOCALE: Locale = "en-US";

function getNavigatorLocaleCandidates(): ReadonlyArray<string> {
  if (typeof navigator === "undefined") {
    return [];
  }
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return typeof navigator.language === "string" ? [navigator.language] : [];
}

function matchSupportedLocale(candidate: string): Locale | null {
  const normalizedCandidate = candidate.trim().toLowerCase();
  if (normalizedCandidate === CHINESE_LANGUAGE_CODE || normalizedCandidate.startsWith(`${CHINESE_LANGUAGE_CODE}-`)) {
    return "zh-CN";
  }
  if (normalizedCandidate === ENGLISH_LANGUAGE_CODE || normalizedCandidate.startsWith(`${ENGLISH_LANGUAGE_CODE}-`)) {
    return "en-US";
  }
  return null;
}

export function detectSystemLocale(candidates?: ReadonlyArray<string>): Locale {
  const preferredCandidates = candidates ?? getNavigatorLocaleCandidates();
  for (const candidate of preferredCandidates) {
    const locale = matchSupportedLocale(candidate);
    if (locale !== null) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
}

export function resolveLocale(language: UiLanguage, candidates?: ReadonlyArray<string>): Locale {
  if (language === "auto") {
    return detectSystemLocale(candidates);
  }
  return language;
}
