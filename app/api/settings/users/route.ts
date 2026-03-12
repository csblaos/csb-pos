import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { execute, queryMany, queryOne } from "@/lib/db/query";
import { type PostgresTransaction } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const createNewStoreUserSchema = z.object({
  action: z.literal("create_new"),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
  roleId: z.string().min(1),
});

const addExistingStoreUserSchema = z.object({
  action: z.literal("add_existing"),
  roleId: z.string().min(1),
  userId: z.string().min(1).optional(),
  email: z.string().email().optional(),
}).refine((data) => Boolean(data.userId || data.email), {
  message: "ต้องระบุ userId หรือ email สำหรับเพิ่มผู้ใช้เดิม",
});

const legacyCreateStoreUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  roleId: z.string().min(1),
});

type CreateStoreUserPayload =
  | z.infer<typeof createNewStoreUserSchema>
  | z.infer<typeof addExistingStoreUserSchema>;

const activeOwnerCount = async (storeId: string, transaction?: PostgresTransaction) => {
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
      transaction,
    },
  );

  return Number(row?.count ?? 0);
};

const parseCreateStoreUserPayload = (
  raw: unknown,
):
  | {
      success: true;
      data: CreateStoreUserPayload;
    }
  | {
      success: false;
    } => {
  const parsed = z
    .discriminatedUnion("action", [createNewStoreUserSchema, addExistingStoreUserSchema])
    .safeParse(raw);
  if (parsed.success) {
    return parsed;
  }

  const legacy = legacyCreateStoreUserSchema.safeParse(raw);
  if (!legacy.success) {
    return { success: false };
  }

  return {
    success: true,
    data: {
      action: "create_new",
      name: legacy.data.name,
      email: legacy.data.email,
      password: legacy.data.password,
      roleId: legacy.data.roleId,
    },
  };
};

const listUsers = async (storeId: string) => {
  return queryMany<{
    userId: string;
    email: string;
    name: string;
    systemRole: string | null;
    mustChangePassword: boolean;
    sessionLimit: number | null;
    createdByUserId: string | null;
    createdByName: string | null;
    roleId: string;
    roleName: string;
    status: string;
    joinedAt: string;
    addedByUserId: string | null;
    addedByName: string | null;
  }>(
    `
      select
        u.id as "userId",
        u.email,
        u.name,
        u.system_role as "systemRole",
        u.must_change_password as "mustChangePassword",
        u.session_limit as "sessionLimit",
        u.created_by as "createdByUserId",
        uc.name as "createdByName",
        r.id as "roleId",
        r.name as "roleName",
        sm.status,
        sm.created_at as "joinedAt",
        sm.added_by as "addedByUserId",
        ua.name as "addedByName"
      from store_members sm
      inner join users u on sm.user_id = u.id
      inner join roles r on sm.role_id = r.id
      left join users uc on u.created_by = uc.id
      left join users ua on sm.added_by = ua.id
      where sm.store_id = :storeId
      order by u.name asc
    `,
    {
      replacements: { storeId },
    },
  );
};

const getRoleForStore = async (storeId: string, roleId: string) => {
  return queryOne<{ id: string; name: string }>(
    `
      select id, name
      from roles
      where id = :roleId and store_id = :storeId
      limit 1
    `,
    {
      replacements: { roleId, storeId },
    },
  );
};

const getUserSystemRole = async (userId: string) => {
  const row = await queryOne<{ systemRole: string | null }>(
    `
      select system_role as "systemRole"
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId },
    },
  );

  return row?.systemRole ?? "USER";
};

const canSuperadminLinkUserAcrossOwnedStores = async (
  superadminUserId: string,
  targetUserId: string,
) => {
  const ownedStoreRows = await queryMany<{ storeId: string }>(
    `
      select sm.store_id as "storeId"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      where
        sm.user_id = :superadminUserId
        and sm.status = 'ACTIVE'
        and r.name = 'Owner'
    `,
    {
      replacements: { superadminUserId },
    },
  );

  const ownedStoreIds = ownedStoreRows.map((row) => row.storeId);
  if (ownedStoreIds.length === 0) {
    return false;
  }

  const targetMembership = await queryOne<{ count: number | string }>(
    `
      select count(*) as "count"
      from store_members
      where user_id = :targetUserId
        and store_id in (:ownedStoreIds)
    `,
    {
      replacements: { targetUserId, ownedStoreIds },
    },
  );

  return Number(targetMembership?.count ?? 0) > 0;
};

const upsertMembershipWithRoleGuard = async (params: {
  storeId: string;
  userId: string;
  actorUserId: string;
  nextRoleId: string;
  nextRoleName: string;
  transaction: PostgresTransaction;
}) => {
  const existingMembership = await queryOne<{
    status: string;
    roleName: string;
  }>(
    `
      select
        sm.status,
        r.name as "roleName"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      where sm.store_id = :storeId and sm.user_id = :userId
      limit 1
    `,
    {
      replacements: {
        storeId: params.storeId,
        userId: params.userId,
      },
      transaction: params.transaction,
    },
  );

  if (
    existingMembership &&
    existingMembership.roleName === "Owner" &&
    params.nextRoleName !== "Owner" &&
    existingMembership.status === "ACTIVE"
  ) {
    const ownerCount = await activeOwnerCount(params.storeId, params.transaction);
    if (ownerCount <= 1) {
      throw new Error("LAST_OWNER_ROLE_GUARD");
    }
  }

  if (existingMembership) {
    await execute(
      `
        update store_members
        set
          role_id = :nextRoleId,
          status = 'ACTIVE'
        where store_id = :storeId and user_id = :userId
      `,
      {
        replacements: {
          storeId: params.storeId,
          userId: params.userId,
          nextRoleId: params.nextRoleId,
        },
        transaction: params.transaction,
      },
    );
    return;
  }

  await execute(
    `
      insert into store_members (
        store_id,
        user_id,
        role_id,
        status,
        added_by
      )
      values (
        :storeId,
        :userId,
        :nextRoleId,
        'ACTIVE',
        :actorUserId
      )
    `,
    {
      replacements: {
        storeId: params.storeId,
        userId: params.userId,
        nextRoleId: params.nextRoleId,
        actorUserId: params.actorUserId,
      },
      transaction: params.transaction,
    },
  );
};

export async function GET() {
  try {
    const { storeId } = await enforcePermission("members.view");
    const members = await listUsers(storeId);
    return NextResponse.json({ ok: true, members });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
  } | null = null;
  let auditAction = "store.member.create";

  try {
    const { storeId, session } = await enforcePermission("members.create");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };

    const logFail = async (params: {
      reasonCode: "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN" | "BUSINESS_RULE" | "CONFLICT";
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
        entityId: params.entityId ?? null,
        result: "FAIL",
        reasonCode: params.reasonCode,
        metadata: params.metadata,
        request,
      });

    const payload = parseCreateStoreUserPayload(await request.json());
    if (!payload.success) {
      await logFail({ reasonCode: "VALIDATION_ERROR" });
      return NextResponse.json({ message: "ข้อมูลผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    auditAction =
      payload.data.action === "add_existing"
        ? "store.member.add_existing"
        : "store.member.create_new";

    const role = await getRoleForStore(storeId, payload.data.roleId);

    if (!role) {
      await logFail({
        reasonCode: "NOT_FOUND",
        metadata: { roleId: payload.data.roleId },
      });
      return NextResponse.json({ message: "ไม่พบบทบาทที่เลือก" }, { status: 404 });
    }

    if (payload.data.action === "add_existing") {
      const actorSystemRole = await getUserSystemRole(session.userId);
      if (actorSystemRole !== "SUPERADMIN") {
        await logFail({
          reasonCode: "FORBIDDEN",
          metadata: { actorSystemRole },
        });
        return NextResponse.json(
          { message: "เฉพาะบัญชี SUPERADMIN เท่านั้นที่เพิ่มผู้ใช้เดิมข้ามร้านได้" },
          { status: 403 },
        );
      }

      const existingUser = payload.data.userId
        ? await queryOne<{ id: string; systemRole: string | null }>(
            `
              select
                id,
                system_role as "systemRole"
              from users
              where id = :userId
              limit 1
            `,
            {
              replacements: { userId: payload.data.userId },
            },
          )
        : await queryOne<{ id: string; systemRole: string | null }>(
            `
              select
                id,
                system_role as "systemRole"
              from users
              where lower(email) = lower(:email)
              limit 1
            `,
            {
              replacements: { email: payload.data.email!.trim().toLowerCase() },
            },
          );

      if (!existingUser) {
        await logFail({
          reasonCode: "NOT_FOUND",
          metadata: {
            userId: payload.data.userId ?? null,
            email: payload.data.email ?? null,
          },
        });
        return NextResponse.json(
          { message: "ไม่พบบัญชีผู้ใช้นี้ กรุณาใช้เมนูสร้างผู้ใช้ใหม่" },
          { status: 404 },
        );
      }

      if (existingUser.systemRole === "SYSTEM_ADMIN") {
        await logFail({
          reasonCode: "BUSINESS_RULE",
          entityId: existingUser.id,
          metadata: { message: "cannot_link_system_admin" },
        });
        return NextResponse.json(
          { message: "ไม่สามารถเพิ่มบัญชี SYSTEM_ADMIN เป็นสมาชิกของร้านได้" },
          { status: 400 },
        );
      }

      const canLink = await canSuperadminLinkUserAcrossOwnedStores(
        session.userId,
        existingUser.id,
      );
      if (!canLink) {
        await logFail({
          reasonCode: "FORBIDDEN",
          entityId: existingUser.id,
          metadata: { message: "cross_owner_guard_failed" },
        });
        return NextResponse.json(
          {
            message:
              "เพิ่มผู้ใช้เดิมได้เฉพาะบัญชีที่อยู่ในร้านภายใต้ SUPERADMIN เดียวกันเท่านั้น",
          },
          { status: 403 },
        );
      }

      try {
        await runInTransaction(async (tx) => {
          await upsertMembershipWithRoleGuard({
            storeId,
            userId: existingUser.id,
            actorUserId: session.userId,
            nextRoleId: role.id,
            nextRoleName: role.name,
            transaction: tx,
          });
        });
      } catch (error) {
        if (error instanceof Error && error.message === "LAST_OWNER_ROLE_GUARD") {
          await logFail({
            reasonCode: "BUSINESS_RULE",
            entityId: existingUser.id,
            metadata: { message: "last_owner_guard" },
          });
          return NextResponse.json(
            { message: "ไม่สามารถถอด Owner คนสุดท้ายออกได้" },
            { status: 400 },
          );
        }
        throw error;
      }

      const members = await listUsers(storeId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "store_member",
        entityId: existingUser.id,
        metadata: {
          mode: "add_existing",
          roleId: role.id,
          roleName: role.name,
        },
        after: {
          userId: existingUser.id,
          roleId: role.id,
          roleName: role.name,
          status: "ACTIVE",
        },
        request,
      });
      return NextResponse.json({ ok: true, members });
    }

    if (payload.data.action !== "create_new") {
      return NextResponse.json({ message: "ข้อมูลผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    const createPayload = payload.data;
    const normalizedEmail = createPayload.email.trim().toLowerCase();

    const existingUser = await queryOne<{ id: string }>(
      `
        select id
        from users
        where lower(email) = lower(:email)
        limit 1
      `,
      {
        replacements: { email: normalizedEmail },
      },
    );

    if (existingUser) {
      await logFail({
        reasonCode: "CONFLICT",
        entityId: existingUser.id,
        metadata: { email: normalizedEmail },
      });
      return NextResponse.json(
        {
          message:
            "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้เมนู \"เพิ่มผู้ใช้เดิมเข้าร้าน\" แทน",
        },
        { status: 409 },
      );
    }

    const userId = randomUUID();
    const temporaryPassword = createPayload.password ?? generateTemporaryPassword(10);
    const passwordHash = await hashPassword(temporaryPassword);

    await runInTransaction(async (tx) => {
      await execute(
        `
          insert into users (
            id,
            email,
            name,
            password_hash,
            created_by,
            must_change_password,
            password_updated_at
          )
          values (
            :userId,
            :email,
            :name,
            :passwordHash,
            :createdBy,
            true,
            null
          )
        `,
        {
          replacements: {
            userId,
            email: normalizedEmail,
            name: createPayload.name,
            passwordHash,
            createdBy: session.userId,
          },
          transaction: tx,
        },
      );

      await upsertMembershipWithRoleGuard({
        storeId,
        userId,
        actorUserId: session.userId,
        nextRoleId: role.id,
        nextRoleName: role.name,
        transaction: tx,
      });
    });

    const members = await listUsers(storeId);
    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action: auditAction,
      entityType: "store_member",
      entityId: userId,
      metadata: {
        mode: "create_new",
        roleId: role.id,
        roleName: role.name,
        email: normalizedEmail,
      },
      after: {
        userId,
        email: normalizedEmail,
        name: createPayload.name,
        roleId: role.id,
        roleName: role.name,
        status: "ACTIVE",
      },
      request,
    });
    return NextResponse.json({ ok: true, members, temporaryPassword });
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: auditAction,
        entityType: "store_member",
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
