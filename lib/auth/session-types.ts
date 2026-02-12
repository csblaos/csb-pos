import { z } from "zod";
import { storeTypeValues } from "@/lib/storefront/types";

export const sessionStoreTypeSchema = z.enum(storeTypeValues);

export const sessionSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  hasStoreMembership: z.boolean(),
  activeStoreId: z.string().nullable(),
  activeStoreName: z.string().nullable(),
  activeStoreType: sessionStoreTypeSchema.nullable().default(null),
  activeRoleId: z.string().nullable(),
  activeRoleName: z.string().nullable(),
});

export type AppSession = z.infer<typeof sessionSchema>;
