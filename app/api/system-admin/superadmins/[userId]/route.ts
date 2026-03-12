import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import {
  findUserByIdFromPostgres,
  updateSuperadminConfigInPostgres,
} from "@/lib/platform/postgres-settings-admin-write";

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

    const targetUser = await findUserByIdFromPostgres(userId);
    if (targetUser === undefined) {
      throw new Error("PostgreSQL system-admin write path is not available");
    }

    if (!targetUser) {
      return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    }

    if (targetUser.systemRole !== "SUPERADMIN") {
      return NextResponse.json(
        { message: "อนุญาตแก้ไขเฉพาะบัญชี SUPERADMIN" },
        { status: 400 },
      );
    }

    await updateSuperadminConfigInPostgres({
      userId,
      canCreateStores: payload.data.canCreateStores,
      maxStores: payload.data.canCreateStores ? payload.data.maxStores : null,
      canCreateBranches: payload.data.canCreateBranches,
      maxBranchesPerStore:
        payload.data.canCreateBranches === false
          ? null
          : payload.data.maxBranchesPerStore,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
