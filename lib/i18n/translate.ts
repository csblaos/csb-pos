import { resolveAppLanguage, getAppLanguageLocale } from "@/lib/i18n/config";
import { i18nMessages } from "@/lib/i18n/messages";
import type { AppLanguage } from "@/lib/i18n/types";

type TranslationValues = Record<string, string | number>;

const interpolate = (template: string, values?: TranslationValues) => {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!(key in values)) {
      return "";
    }

    return String(values[key]);
  });
};

export const translate = (
  language: AppLanguage | null | undefined,
  key: string,
  values?: TranslationValues,
) => {
  const resolvedLanguage = resolveAppLanguage(language);
  const template =
    i18nMessages[resolvedLanguage][key] ??
    i18nMessages.th[key] ??
    i18nMessages.en[key] ??
    key;

  return interpolate(template, values);
};

export const createTranslator = (language: AppLanguage | null | undefined) => {
  const resolvedLanguage = resolveAppLanguage(language);
  return (key: string, values?: TranslationValues) =>
    translate(resolvedLanguage, key, values);
};

export const formatNumberByLanguage = (
  language: AppLanguage | null | undefined,
  value: number,
) => value.toLocaleString(getAppLanguageLocale(resolveAppLanguage(language)));

