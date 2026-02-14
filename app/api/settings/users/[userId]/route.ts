import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { enforceUserSessionLimitNow, invalidateUserSessions } from "@/lib/auth/session";
import {
  ensureMainBranchExists,
  getMemberBranchAccess,
  replaceMemberBranchAccess,
} from "@/lib/branches/access";
import { db } from "@/lib/db/client";
import {
  roles,
  storeBranches,
  storeMembers,
  users,
} from "@/lib/db/schema";
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
  z.object({
    action: z.literal("set_session_limit"),
    sessionLimit: z.number().int().min(1).max(10).nullable(),
  }),
  z.object({
    action: z.literal("reset_password"),
  }),
  z.object({
    action: z.literal("set_branch_access"),
    mode: z.enum(["ALL", "SELECTED"]),
    branchIds: z.array(z.string().min(1)).optional(),
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("members.view");
    const { userId } = await context.params;
    await ensureMainBranchExists(storeId);

    const [membership] = await db
      .select({ userId: storeMembers.userId })
      .from(storeMembers)
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ message: "ไม่พบสมาชิกในร้าน" }, { status: 404 });
    }

    const [branches, branchAccess] = await Promise.all([
      db
        .select({ id: storeBranches.id })
        .from(storeBranches)
        .where(eq(storeBranches.storeId, storeId)),
      getMemberBranchAccess(userId, storeId),
    ]);

    const validBranchIdSet = new Set(branches.map((branch) => branch.id));
    const branchIds =
      branchAccess.mode === "SELECTED"
        ? branchAccess.branchIds.filter((branchId) => validBranchIdSet.has(branchId))
        : [];

    return NextResponse.json({
      ok: true,
      branchAccess: {
        mode: branchAccess.mode,
        branchIds,
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

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

      await invalidateUserSessions(userId);
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

      await invalidateUserSessions(userId);
    }

    if (payload.data.action === "set_session_limit") {
      await db
        .update(users)
        .set({ sessionLimit: payload.data.sessionLimit })
        .where(eq(users.id, userId));

      await enforceUserSessionLimitNow(userId);
    }

    if (payload.data.action === "set_branch_access") {
      try {
        await replaceMemberBranchAccess({
          userId,
          storeId,
          mode: payload.data.mode,
          branchIds: payload.data.branchIds ?? [],
        });
      } catch (error) {
        if (error instanceof Error && error.message === "REQUIRE_BRANCH_SELECTION") {
          return NextResponse.json(
            { message: "กรุณาเลือกอย่างน้อย 1 สาขา" },
            { status: 400 },
          );
        }
        if (error instanceof Error && error.message === "INVALID_BRANCH_SELECTION") {
          return NextResponse.json(
            { message: "พบสาขาที่เลือกไม่ถูกต้อง" },
            { status: 400 },
          );
        }
        throw error;
      }

      await invalidateUserSessions(userId);
    }

    if (payload.data.action === "reset_password") {
      const temporaryPassword = generateTemporaryPassword(10);
      const passwordHash = await hashPassword(temporaryPassword);

      await db
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          passwordUpdatedAt: null,
        })
        .where(eq(users.id, userId));

      await invalidateUserSessions(userId);
      return NextResponse.json({ ok: true, temporaryPassword });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
