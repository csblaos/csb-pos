import { NextResponse } from "next/server";
import { z } from "zod";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { enforceUserSessionLimitNow, invalidateUserSessions } from "@/lib/auth/session";
import {
  ensureMainBranchExists,
  getMemberBranchAccess,
  listStoreBranches,
  replaceMemberBranchAccess,
} from "@/lib/branches/access";
import { execute, queryOne } from "@/lib/db/query";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { safeLogAuditEvent } from "@/server/services/audit.service";

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
  const row = await queryOne<{ count: number | string }>(
    `
      select count(*) as "count"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      where
        sm.store_id = :storeId
        and sm.status = 'ACTIVE'
        and r.name = 'Owner'
    `,
    {
      replacements: { storeId },
    },
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

    const membership = await queryOne<{ userId: string }>(
      `
        select user_id as "userId"
        from store_members
        where store_id = :storeId and user_id = :userId
        limit 1
      `,
      {
        replacements: { storeId, userId },
      },
    );

    if (!membership) {
      return NextResponse.json({ message: "ไม่พบสมาชิกในร้าน" }, { status: 404 });
    }

    const [branches, branchAccess] = await Promise.all([
      listStoreBranches(storeId),
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
  let auditContext: {
    storeId: string;
    actorUserId: string;
    actorName: string | null;
    actorRole: string | null;
    targetUserId: string | null;
  } | null = null;
  let auditAction = "store.member.update";

  try {
    const { storeId, session } = await enforcePermission("members.update");
    const { userId } = await context.params;
    auditContext = {
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      targetUserId: userId,
    };

    const logFail = async (params: {
      reasonCode: "VALIDATION_ERROR" | "NOT_FOUND" | "BUSINESS_RULE" | "INTERNAL_ERROR";
      metadata?: Record<string, unknown>;
      entityId?: string | null;
    }) =>
      safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "store_member",
        entityId: params.entityId ?? userId,
        result: "FAIL",
        reasonCode: params.reasonCode,
        metadata: params.metadata,
        request,
      });

    const payload = updateUserSchema.safeParse(await request.json());
    if (!payload.success) {
      await logFail({
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
      });
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    auditAction = `store.member.${payload.data.action}`;

    const targetMembership = await queryOne<{
      userId: string;
      roleId: string;
      roleName: string;
      status: "ACTIVE" | "INVITED" | "SUSPENDED";
    }>(
      `
        select
          sm.user_id as "userId",
          r.id as "roleId",
          r.name as "roleName",
          sm.status
        from store_members sm
        inner join roles r on sm.role_id = r.id
        where sm.store_id = :storeId and sm.user_id = :userId
        limit 1
      `,
      {
        replacements: { storeId, userId },
      },
    );

    if (!targetMembership) {
      await logFail({ reasonCode: "NOT_FOUND" });
      return NextResponse.json({ message: "ไม่พบสมาชิกในร้าน" }, { status: 404 });
    }

    if (payload.data.action === "assign_role") {
      const targetRole = await queryOne<{
        id: string;
        name: string;
      }>(
        `
          select id, name
          from roles
          where id = :roleId and store_id = :storeId
          limit 1
        `,
        {
          replacements: {
            roleId: payload.data.roleId,
            storeId,
          },
        },
      );

      if (!targetRole) {
        await logFail({
          reasonCode: "NOT_FOUND",
          metadata: { roleId: payload.data.roleId },
        });
        return NextResponse.json({ message: "ไม่พบบทบาทที่เลือก" }, { status: 404 });
      }

      if (
        targetMembership.roleName === "Owner" &&
        targetRole.name !== "Owner" &&
        targetMembership.status === "ACTIVE"
      ) {
        const ownerCount = await activeOwnerCount(storeId);
        if (ownerCount <= 1) {
          await logFail({
            reasonCode: "BUSINESS_RULE",
            metadata: { message: "last_owner_guard" },
          });
          return NextResponse.json(
            { message: "ไม่สามารถถอด Owner คนสุดท้ายออกได้" },
            { status: 400 },
          );
        }
      }

      await execute(
        `
          update store_members
          set role_id = :roleId
          where store_id = :storeId and user_id = :userId
        `,
        {
          replacements: {
            roleId: targetRole.id,
            storeId,
            userId,
          },
        },
      );

      await invalidateUserSessions(userId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "store_member",
        entityId: userId,
        before: {
          roleId: targetMembership.roleId,
          roleName: targetMembership.roleName,
        },
        after: {
          roleId: targetRole.id,
          roleName: targetRole.name,
        },
        request,
      });
    }

    if (payload.data.action === "set_status") {
      if (
        targetMembership.roleName === "Owner" &&
        targetMembership.status === "ACTIVE" &&
        payload.data.status !== "ACTIVE"
      ) {
        const ownerCount = await activeOwnerCount(storeId);
        if (ownerCount <= 1) {
          await logFail({
            reasonCode: "BUSINESS_RULE",
            metadata: { message: "last_owner_disable_guard" },
          });
          return NextResponse.json(
            { message: "ไม่สามารถปิดใช้งาน Owner คนสุดท้ายได้" },
            { status: 400 },
          );
        }
      }

      if (session.userId === userId && payload.data.status !== "ACTIVE") {
        await logFail({
          reasonCode: "BUSINESS_RULE",
          metadata: { message: "cannot_disable_self" },
        });
        return NextResponse.json(
          { message: "ไม่สามารถปิดใช้งานบัญชีตัวเองได้" },
          { status: 400 },
        );
      }

      await execute(
        `
          update store_members
          set status = :status
          where store_id = :storeId and user_id = :userId
        `,
        {
          replacements: {
            status: payload.data.status,
            storeId,
            userId,
          },
        },
      );

      await invalidateUserSessions(userId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "store_member",
        entityId: userId,
        before: {
          status: targetMembership.status,
        },
        after: {
          status: payload.data.status,
        },
        request,
      });
    }

    if (payload.data.action === "set_session_limit") {
      const targetUser = await queryOne<{ sessionLimit: number | null }>(
        `
          select session_limit as "sessionLimit"
          from users
          where id = :userId
          limit 1
        `,
        {
          replacements: { userId },
        },
      );

      await execute(
        `
          update users
          set session_limit = :sessionLimit
          where id = :userId
        `,
        {
          replacements: {
            sessionLimit: payload.data.sessionLimit,
            userId,
          },
        },
      );

      await enforceUserSessionLimitNow(userId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user",
        entityId: userId,
        before: {
          sessionLimit: targetUser?.sessionLimit ?? null,
        },
        after: {
          sessionLimit: payload.data.sessionLimit,
        },
        request,
      });
    }

    if (payload.data.action === "set_branch_access") {
      const beforeBranchAccess = await getMemberBranchAccess(userId, storeId);

      try {
        await replaceMemberBranchAccess({
          userId,
          storeId,
          mode: payload.data.mode,
          branchIds: payload.data.branchIds ?? [],
        });
      } catch (error) {
        if (error instanceof Error && error.message === "REQUIRE_BRANCH_SELECTION") {
          await logFail({
            reasonCode: "BUSINESS_RULE",
            metadata: { message: "require_branch_selection" },
          });
          return NextResponse.json(
            { message: "กรุณาเลือกอย่างน้อย 1 สาขา" },
            { status: 400 },
          );
        }
        if (error instanceof Error && error.message === "INVALID_BRANCH_SELECTION") {
          await logFail({
            reasonCode: "BUSINESS_RULE",
            metadata: { message: "invalid_branch_selection" },
          });
          return NextResponse.json(
            { message: "พบสาขาที่เลือกไม่ถูกต้อง" },
            { status: 400 },
          );
        }
        throw error;
      }

      await invalidateUserSessions(userId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "store_member_branch_access",
        entityId: userId,
        before: beforeBranchAccess,
        after: {
          mode: payload.data.mode,
          branchIds: payload.data.branchIds ?? [],
        },
        request,
      });
    }

    if (payload.data.action === "reset_password") {
      const temporaryPassword = generateTemporaryPassword(10);
      const passwordHash = await hashPassword(temporaryPassword);

      await execute(
        `
          update users
          set
            password_hash = :passwordHash,
            must_change_password = true,
            password_updated_at = null
          where id = :userId
        `,
        {
          replacements: {
            passwordHash,
            userId,
          },
        },
      );

      await invalidateUserSessions(userId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user",
        entityId: userId,
        metadata: {
          resetPassword: true,
          forceChangeOnNextLogin: true,
        },
        request,
      });
      return NextResponse.json({ ok: true, temporaryPassword });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.actorUserId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: auditAction,
        entityType: "store_member",
        entityId: auditContext.targetUserId,
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toRBACErrorResponse(error);
  }
}
