export const appLanguageValues = ["lo", "th", "en"] as const;

export type AppLanguage = (typeof appLanguageValues)[number];

export const defaultAppLanguage: AppLanguage = "th";

export const appLanguageLocaleMap: Record<AppLanguage, string> = {
  lo: "lo-LA",
  th: "th-TH",
  en: "en-US",
};

export const appLanguageLabelMap: Record<
  AppLanguage,
  {
    nativeLabel: string;
    englishLabel: string;
  }
> = {
  lo: {
    nativeLabel: "ລາວ",
    englishLabel: "Lao",
  },
  th: {
    nativeLabel: "ไทย",
    englishLabel: "Thai",
  },
  en: {
    nativeLabel: "English",
    englishLabel: "English",
  },
};

