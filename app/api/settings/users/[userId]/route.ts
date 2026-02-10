import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { roles, storeMembers } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

const updateUserSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign_role"),
    roleId: z.string().min(1),
  }),
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]),
  }),
]);

const activeOwnerCount = async (storeId: string) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .where(
      and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.status, "ACTIVE"),
        eq(roles.name, "Owner"),
      ),
    );

  return Number(row?.count ?? 0);
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { storeId, session } = await enforcePermission("members.update");
    const { userId } = await context.params;

    const payload = updateUserSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const [targetMembership] = await db
      .select({
        userId: storeMembers.userId,
        roleId: roles.id,
        roleName: roles.name,
        status: storeMembers.status,
      })
      .from(storeMembers)
      .innerJoin(roles, eq(storeMembers.roleId, roles.id))
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)))
      .limit(1);

    if (!targetMembership) {
      return NextResponse.json({ message: "ไม่พบสมาชิกในร้าน" }, { status: 404 });
    }

    if (payload.data.action === "assign_role") {
      const [targetRole] = await db
        .select({
          id: roles.id,
          name: roles.name,
        })
        .from(roles)
        .where(and(eq(roles.id, payload.data.roleId), eq(roles.storeId, storeId)))
        .limit(1);

      if (!targetRole) {
        return NextResponse.json({ message: "ไม่พบบทบาทที่เลือก" }, { status: 404 });
      }

      if (
        targetMembership.roleName === "Owner" &&
        targetRole.name !== "Owner" &&
        targetMembership.status === "ACTIVE"
      ) {
        const ownerCount = await activeOwnerCount(storeId);
        if (ownerCount <= 1) {
          return NextResponse.json(
            { message: "ไม่สามารถถอด Owner คนสุดท้ายออกได้" },
            { status: 400 },
          );
        }
      }

      await db
        .update(storeMembers)
        .set({ roleId: targetRole.id })
        .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)));
    }

    if (payload.data.action === "set_status") {
      if (
        targetMembership.roleName === "Owner" &&
        targetMembership.status === "ACTIVE" &&
        payload.data.status !== "ACTIVE"
      ) {
        const ownerCount = await activeOwnerCount(storeId);
        if (ownerCount <= 1) {
          return NextResponse.json(
            { message: "ไม่สามารถปิดใช้งาน Owner คนสุดท้ายได้" },
            { status: 400 },
          );
        }
      }

      if (session.userId === userId && payload.data.status !== "ACTIVE") {
        return NextResponse.json(
          { message: "ไม่สามารถปิดใช้งานบัญชีตัวเองได้" },
          { status: 400 },
        );
      }

      await db
        .update(storeMembers)
        .set({ status: payload.data.status })
        .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
