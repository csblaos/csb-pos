import type { StoreType } from "@/lib/storefront/types";

export type StorefrontLayoutPreset = {
  storeType: StoreType;
  shellTitle: string;
  appBgClassName: string;
  headerBgClassName: string;
  modeNoteText: string | null;
  modeNoteClassName: string;
};

