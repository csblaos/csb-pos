import { z } from "zod";
import { appLanguageValues, defaultAppLanguage } from "@/lib/i18n/types";
import { storeTypeValues } from "@/lib/storefront/types";

export const sessionStoreTypeSchema = z.enum(storeTypeValues);
export const sessionLanguageSchema = z.enum(appLanguageValues);

export const sessionSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  language: sessionLanguageSchema.default(defaultAppLanguage),
  hasStoreMembership: z.boolean(),
  activeStoreId: z.string().nullable(),
  activeStoreName: z.string().nullable(),
  activeStoreType: sessionStoreTypeSchema.nullable().default(null),
  activeBranchId: z.string().nullable(),
  activeBranchName: z.string().nullable(),
  activeBranchCode: z.string().nullable(),
  activeRoleId: z.string().nullable(),
  activeRoleName: z.string().nullable(),
});

export type AppSession = z.infer<typeof sessionSchema>;
