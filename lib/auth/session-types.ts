import { z } from "zod";

export const sessionSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  hasStoreMembership: z.boolean(),
  activeStoreId: z.string().nullable(),
  activeStoreName: z.string().nullable(),
  activeRoleId: z.string().nullable(),
  activeRoleName: z.string().nullable(),
});

export type AppSession = z.infer<typeof sessionSchema>;
