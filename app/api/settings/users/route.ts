import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

const createNewStoreUserSchema = z.object({
  action: z.literal("create_new"),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  roleId: z.string().min(1),
});

const addExistingStoreUserSchema = z.object({
  action: z.literal("add_existing"),
  email: z.string().email(),
  roleId: z.string().min(1),
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
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      sessionLimit: users.sessionLimit,
      roleId: roles.id,
      roleName: roles.name,
      status: storeMembers.status,
      joinedAt: storeMembers.createdAt,
    })
    .from(storeMembers)
    .innerJoin(users, eq(storeMembers.userId, users.id))
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
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
  try {
    const { storeId, session } = await enforcePermission("members.create");

    const payload = parseCreateStoreUserPayload(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    const role = await getRoleForStore(storeId, payload.data.roleId);

    if (!role) {
      return NextResponse.json({ message: "ไม่พบบทบาทที่เลือก" }, { status: 404 });
    }

    const normalizedEmail = payload.data.email.trim().toLowerCase();

    if (payload.data.action === "add_existing") {
      const actorSystemRole = await getUserSystemRole(session.userId);
      if (actorSystemRole !== "SUPERADMIN") {
        return NextResponse.json(
          { message: "เฉพาะบัญชี SUPERADMIN เท่านั้นที่เพิ่มผู้ใช้เดิมข้ามร้านได้" },
          { status: 403 },
        );
      }

      const [existingUser] = await db
        .select({
          id: users.id,
          systemRole: users.systemRole,
        })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!existingUser) {
        return NextResponse.json(
          { message: "ไม่พบบัญชีผู้ใช้นี้ กรุณาใช้เมนูสร้างผู้ใช้ใหม่" },
          { status: 404 },
        );
      }

      if (existingUser.systemRole === "SYSTEM_ADMIN") {
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
          nextRoleId: role.id,
          nextRoleName: role.name,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "LAST_OWNER_ROLE_GUARD") {
          return NextResponse.json(
            { message: "ไม่สามารถถอด Owner คนสุดท้ายออกได้" },
            { status: 400 },
          );
        }
        throw error;
      }

      const members = await listUsers(storeId);
      return NextResponse.json({ ok: true, members });
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        {
          message:
            "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้เมนู \"เพิ่มผู้ใช้เดิมเข้าร้าน\" แทน",
        },
        { status: 409 },
      );
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(payload.data.password);

    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: payload.data.name,
      passwordHash,
    });

    await upsertMembershipWithRoleGuard({
      storeId,
      userId,
      nextRoleId: role.id,
      nextRoleName: role.name,
    });

    const members = await listUsers(storeId);
    return NextResponse.json({ ok: true, members });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
