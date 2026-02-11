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

async function findPrimaryMembership(userId: string) {
  const rows = await db
    .select({
      storeId: storeMembers.storeId,
      storeName: stores.name,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .innerJoin(stores, eq(storeMembers.storeId, stores.id))
    .where(and(eq(storeMembers.userId, userId), eq(storeMembers.status, "ACTIVE")))
    .limit(1);

  return rows[0] ?? null;
}

export async function buildSessionForUser(user: SessionUser): Promise<AppSession> {
  const membership = await findPrimaryMembership(user.id);

  return {
    userId: user.id,
    email: user.email,
    displayName: user.name,
    hasStoreMembership: Boolean(membership),
    activeStoreId: membership?.storeId ?? null,
    activeStoreName: membership?.storeName ?? null,
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
