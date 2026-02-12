import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { roles, storeMembers, stores } from "@/lib/db/schema";
import {
  type AppSession,
  clearSessionCookie,
  deleteSessionById,
} from "@/lib/auth/session";

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type ActiveMembership = {
  storeId: string;
  storeName: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
  roleId: string;
  roleName: string;
};

export type UserMembershipFlags = {
  hasActiveMembership: boolean;
  hasSuspendedMembership: boolean;
};

async function findPrimaryMembership(userId: string) {
  const rows = await db
    .select({
      storeId: storeMembers.storeId,
      storeName: stores.name,
      storeType: stores.storeType,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .innerJoin(stores, eq(storeMembers.storeId, stores.id))
    .where(and(eq(storeMembers.userId, userId), eq(storeMembers.status, "ACTIVE")))
    .orderBy(storeMembers.createdAt)
    .limit(1);

  return rows[0] ?? null;
}

export async function findActiveMembershipByStore(
  userId: string,
  storeId: string,
): Promise<ActiveMembership | null> {
  const rows = await db
    .select({
      storeId: storeMembers.storeId,
      storeName: stores.name,
      storeType: stores.storeType,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .innerJoin(stores, eq(storeMembers.storeId, stores.id))
    .where(
      and(
        eq(storeMembers.userId, userId),
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listActiveMemberships(userId: string): Promise<ActiveMembership[]> {
  return db
    .select({
      storeId: storeMembers.storeId,
      storeName: stores.name,
      storeType: stores.storeType,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .innerJoin(stores, eq(storeMembers.storeId, stores.id))
    .where(and(eq(storeMembers.userId, userId), eq(storeMembers.status, "ACTIVE")))
    .orderBy(stores.name);
}

export async function getUserMembershipFlags(userId: string): Promise<UserMembershipFlags> {
  const rows = await db
    .select({
      status: storeMembers.status,
    })
    .from(storeMembers)
    .where(eq(storeMembers.userId, userId));

  return {
    hasActiveMembership: rows.some((row) => row.status === "ACTIVE"),
    hasSuspendedMembership: rows.some((row) => row.status === "SUSPENDED"),
  };
}

export async function buildSessionForUser(
  user: SessionUser,
  options?: { preferredStoreId?: string | null },
): Promise<AppSession> {
  const preferredStoreId = options?.preferredStoreId?.trim();
  const membership = preferredStoreId
    ? (await findActiveMembershipByStore(user.id, preferredStoreId)) ??
      (await findPrimaryMembership(user.id))
    : await findPrimaryMembership(user.id);

  return {
    userId: user.id,
    email: user.email,
    displayName: user.name,
    hasStoreMembership: Boolean(membership),
    activeStoreId: membership?.storeId ?? null,
    activeStoreName: membership?.storeName ?? null,
    activeStoreType: membership?.storeType ?? null,
    activeRoleId: membership?.roleId ?? null,
    activeRoleName: membership?.roleName ?? null,
  };
}

export async function clearSessionResponse(
  payload: Record<string, unknown> = { ok: true },
  options?: { sessionId?: string | null },
) {
  await deleteSessionById(options?.sessionId);

  const response = NextResponse.json(payload);
  const cookie = clearSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
