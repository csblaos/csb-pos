import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const updateSuperadminSchema = z.object({
  action: z.literal("set_store_creation_config"),
  canCreateStores: z.boolean(),
  maxStores: z.number().int().min(1).max(100).nullable(),
  canCreateBranches: z.boolean().nullable(),
  maxBranchesPerStore: z.number().int().min(0).max(500).nullable(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    await enforceSystemAdminSession();

    const { userId } = await context.params;
    const payload = updateSuperadminSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const [targetUser] = await db
      .select({
        id: users.id,
        systemRole: users.systemRole,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    }

    if (targetUser.systemRole !== "SUPERADMIN") {
      return NextResponse.json(
        { message: "อนุญาตแก้ไขเฉพาะบัญชี SUPERADMIN" },
        { status: 400 },
      );
    }

    await db
      .update(users)
      .set({
        canCreateStores: payload.data.canCreateStores,
        maxStores: payload.data.canCreateStores ? payload.data.maxStores : null,
        canCreateBranches: payload.data.canCreateBranches,
        maxBranchesPerStore:
          payload.data.canCreateBranches === false
            ? null
            : payload.data.maxBranchesPerStore,
      })
      .where(eq(users.id, userId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
