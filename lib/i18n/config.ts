import {
  appLanguageLabelMap,
  appLanguageLocaleMap,
  appLanguageValues,
  defaultAppLanguage,
  type AppLanguage,
} from "@/lib/i18n/types";

export {
  appLanguageLabelMap,
  appLanguageLocaleMap,
  appLanguageValues,
  defaultAppLanguage,
};

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === "string" &&
  (appLanguageValues as readonly string[]).includes(value);

export const resolveAppLanguage = (value: unknown): AppLanguage =>
  isAppLanguage(value) ? value : defaultAppLanguage;

export const getAppLanguageLocale = (language: AppLanguage) => appLanguageLocaleMap[language];

export const getAppLanguageLabel = (language: AppLanguage) => appLanguageLabelMap[language];

