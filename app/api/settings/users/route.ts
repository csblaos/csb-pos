import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

const createStoreUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  roleId: z.string().min(1),
});

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

const listUsers = async (storeId: string) => {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
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
    const { storeId } = await enforcePermission("members.create");

    const payload = createStoreUserSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, payload.data.roleId), eq(roles.storeId, storeId)))
      .limit(1);

    if (!role) {
      return NextResponse.json({ message: "ไม่พบบทบาทที่เลือก" }, { status: 404 });
    }

    const normalizedEmail = payload.data.email.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let userId = existingUser?.id;

    if (!userId) {
      userId = randomUUID();
      const passwordHash = await hashPassword(payload.data.password);

      await db.insert(users).values({
        id: userId,
        email: normalizedEmail,
        name: payload.data.name,
        passwordHash,
      });
    } else {
      await db
        .update(users)
        .set({
          name: payload.data.name,
        })
        .where(eq(users.id, userId));
    }

    const [existingMembership] = await db
      .select({ storeId: storeMembers.storeId })
      .from(storeMembers)
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)))
      .limit(1);

    if (existingMembership) {
      const [membershipRole] = await db
        .select({
          roleName: roles.name,
          status: storeMembers.status,
        })
        .from(storeMembers)
        .innerJoin(roles, eq(storeMembers.roleId, roles.id))
        .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)))
        .limit(1);

      const [nextRole] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(and(eq(roles.id, payload.data.roleId), eq(roles.storeId, storeId)))
        .limit(1);

      if (
        membershipRole &&
        nextRole &&
        membershipRole.roleName === "Owner" &&
        nextRole.name !== "Owner" &&
        membershipRole.status === "ACTIVE"
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
        .set({
          roleId: payload.data.roleId,
          status: "ACTIVE",
        })
        .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)));
    } else {
      await db.insert(storeMembers).values({
        storeId,
        userId,
        roleId: payload.data.roleId,
        status: "ACTIVE",
      });
    }

    const members = await listUsers(storeId);
    return NextResponse.json({ ok: true, members });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
