import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import {
  findUserByIdFromPostgres,
  updateSystemAdminUserConfigInPostgres,
} from "@/lib/platform/postgres-settings-admin-write";

const updateUserConfigSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    systemRole: z.enum(["USER", "SUPERADMIN", "SYSTEM_ADMIN"]).optional(),
    canCreateStores: z.boolean().nullable().optional(),
    maxStores: z.number().int().min(1).max(100).nullable().optional(),
    canCreateBranches: z.boolean().nullable().optional(),
    maxBranchesPerStore: z.number().int().min(0).max(500).nullable().optional(),
    sessionLimit: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.name !== undefined ||
      payload.systemRole !== undefined ||
      payload.canCreateStores !== undefined ||
      payload.maxStores !== undefined ||
      payload.canCreateBranches !== undefined ||
      payload.maxBranchesPerStore !== undefined ||
      payload.sessionLimit !== undefined,
    {
      message: "ไม่มีข้อมูลสำหรับอัปเดต",
      path: ["name"],
    },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { session } = await enforceSystemAdminSession();

    const { userId } = await context.params;
    const payload = updateUserConfigSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    const targetUser = await findUserByIdFromPostgres(userId);
    if (targetUser === undefined) {
      throw new Error("PostgreSQL system-admin write path is not available");
    }

    if (!targetUser) {
      return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    }

    if (
      userId === session.userId &&
      payload.data.systemRole !== undefined &&
      payload.data.systemRole !== "SYSTEM_ADMIN"
    ) {
      return NextResponse.json(
        { message: "ไม่สามารถลดสิทธิ์ SYSTEM_ADMIN ของบัญชีตัวเองได้" },
        { status: 400 },
      );
    }

    await updateSystemAdminUserConfigInPostgres({
      userId,
      name: payload.data.name,
      systemRole: payload.data.systemRole,
      canCreateStores: payload.data.canCreateStores,
      maxStores:
        payload.data.canCreateStores === false
          ? null
          : payload.data.maxStores,
      canCreateBranches: payload.data.canCreateBranches,
      maxBranchesPerStore:
        payload.data.canCreateBranches === false
          ? null
          : payload.data.maxBranchesPerStore,
      sessionLimit: payload.data.sessionLimit,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
