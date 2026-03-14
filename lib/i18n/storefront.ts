import { translate } from "@/lib/i18n/translate";
import { normalizeStoreType, type StoreType } from "@/lib/storefront/types";
import type { AppLanguage } from "@/lib/i18n/types";

export const getLocalizedShellTitle = (
  language: AppLanguage | null | undefined,
  storeType: StoreType | null | undefined,
) => {
  const normalizedStoreType = normalizeStoreType(storeType);

  switch (normalizedStoreType) {
    case "CAFE":
      return translate(language, "shell.cafeTitle");
    case "RESTAURANT":
      return translate(language, "shell.restaurantTitle");
    case "OTHER":
      return translate(language, "shell.otherTitle");
    case "ONLINE_RETAIL":
    default:
      return translate(language, "shell.onlineTitle");
  }
};

export const getLocalizedShellModeNote = (
  language: AppLanguage | null | undefined,
  storeType: StoreType | null | undefined,
) => {
  const normalizedStoreType = normalizeStoreType(storeType);

  switch (normalizedStoreType) {
    case "CAFE":
      return translate(language, "shell.cafeNote");
    case "RESTAURANT":
      return translate(language, "shell.restaurantNote");
    case "OTHER":
      return translate(language, "shell.otherNote");
    case "ONLINE_RETAIL":
    default:
      return null;
  }
};
