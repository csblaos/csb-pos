import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { NextResponse } from "next/server";
import { z } from "zod";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";
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
  const userCreators = alias(users, "user_creators");
  const memberAdders = alias(users, "member_adders");

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      mustChangePassword: users.mustChangePassword,
      sessionLimit: users.sessionLimit,
      createdByUserId: users.createdBy,
      createdByName: userCreators.name,
      roleId: roles.id,
      roleName: roles.name,
      status: storeMembers.status,
      joinedAt: storeMembers.createdAt,
      addedByUserId: storeMembers.addedBy,
      addedByName: memberAdders.name,
    })
    .from(storeMembers)
    .innerJoin(users, eq(storeMembers.userId, users.id))
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .leftJoin(userCreators, eq(users.createdBy, userCreators.id))
    .leftJoin(memberAdders, eq(storeMembers.addedBy, memberAdders.id))
    .where(eq(storeMembers.storeId, storeId))
    .orderBy(asc(users.name));

  return rows;
};

const getRoleForStore = async (storeId: string, roleId: string) => {
  const [role] = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.storeId, storeId)))
    .limit(1);

  return role ?? null;
};

const getUserSystemRole = async (userId: string) => {
  const [row] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.systemRole ?? "USER";
};

const canSuperadminLinkUserAcrossOwnedStores = async (
  superadminUserId: string,
  targetUserId: string,
) => {
  const ownedStoreRows = await db
    .select({
      storeId: storeMembers.storeId,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .where(
      and(
        eq(storeMembers.userId, superadminUserId),
        eq(storeMembers.status, "ACTIVE"),
        eq(roles.name, "Owner"),
      ),
    );

  const ownedStoreIds = ownedStoreRows.map((row) => row.storeId);
  if (ownedStoreIds.length === 0) {
    return false;
  }

  const [targetMembership] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(storeMembers)
    .where(
      and(
        eq(storeMembers.userId, targetUserId),
        inArray(storeMembers.storeId, ownedStoreIds),
      ),
    );

  return Number(targetMembership?.count ?? 0) > 0;
};

const upsertMembershipWithRoleGuard = async (params: {
  storeId: string;
  userId: string;
  actorUserId: string;
  nextRoleId: string;
  nextRoleName: string;
}) => {
  const [existingMembership] = await db
    .select({
      status: storeMembers.status,
      roleName: roles.name,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .where(
      and(
        eq(storeMembers.storeId, params.storeId),
        eq(storeMembers.userId, params.userId),
      ),
    )
    .limit(1);

  if (
    existingMembership &&
    existingMembership.roleName === "Owner" &&
    params.nextRoleName !== "Owner" &&
    existingMembership.status === "ACTIVE"
  ) {
    const ownerCount = await activeOwnerCount(params.storeId);
    if (ownerCount <= 1) {
      throw new Error("LAST_OWNER_ROLE_GUARD");
    }
  }

  if (existingMembership) {
    await db
      .update(storeMembers)
      .set({
        roleId: params.nextRoleId,
        status: "ACTIVE",
      })
      .where(
        and(
          eq(storeMembers.storeId, params.storeId),
          eq(storeMembers.userId, params.userId),
        ),
      );
    return;
  }

  await db.insert(storeMembers).values({
    storeId: params.storeId,
    userId: params.userId,
    roleId: params.nextRoleId,
    status: "ACTIVE",
    addedBy: params.actorUserId,
  });
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

      const existingUserLookup = payload.data.userId
        ? await db
            .select({
              id: users.id,
              systemRole: users.systemRole,
            })
            .from(users)
            .where(eq(users.id, payload.data.userId))
            .limit(1)
        : await db
            .select({
              id: users.id,
              systemRole: users.systemRole,
            })
            .from(users)
            .where(eq(users.email, payload.data.email!.trim().toLowerCase()))
            .limit(1);

      const [existingUser] = existingUserLookup;

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
        await upsertMembershipWithRoleGuard({
          storeId,
          userId: existingUser.id,
          actorUserId: session.userId,
          nextRoleId: role.id,
          nextRoleName: role.name,
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

    const normalizedEmail = payload.data.email.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

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
    const temporaryPassword = payload.data.password ?? generateTemporaryPassword(10);
    const passwordHash = await hashPassword(temporaryPassword);

    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: payload.data.name,
      passwordHash,
      createdBy: session.userId,
      mustChangePassword: true,
      passwordUpdatedAt: null,
    });

    await upsertMembershipWithRoleGuard({
      storeId,
      userId,
      actorUserId: session.userId,
      nextRoleId: role.id,
      nextRoleName: role.name,
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
        name: payload.data.name,
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
