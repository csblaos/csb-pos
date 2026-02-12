import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

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

    const updateValues: Partial<typeof users.$inferInsert> = {};

    if (payload.data.name !== undefined) {
      updateValues.name = payload.data.name;
    }
    if (payload.data.systemRole !== undefined) {
      updateValues.systemRole = payload.data.systemRole;
    }
    if (payload.data.canCreateStores !== undefined) {
      updateValues.canCreateStores = payload.data.canCreateStores;
    }

    if (payload.data.maxStores !== undefined) {
      updateValues.maxStores = payload.data.maxStores;
    }
    if (payload.data.canCreateBranches !== undefined) {
      updateValues.canCreateBranches = payload.data.canCreateBranches;
    }
    if (payload.data.maxBranchesPerStore !== undefined) {
      updateValues.maxBranchesPerStore = payload.data.maxBranchesPerStore;
    }
    if (payload.data.sessionLimit !== undefined) {
      updateValues.sessionLimit = payload.data.sessionLimit;
    }

    if (payload.data.canCreateStores === false) {
      updateValues.maxStores = null;
    }
    if (payload.data.canCreateBranches === false) {
      updateValues.maxBranchesPerStore = null;
    }

    await db.update(users).set(updateValues).where(eq(users.id, userId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
