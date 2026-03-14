import { NextResponse } from "next/server";

import { ensureMainBranchExists, listAccessibleBranchesForMember } from "@/lib/branches/access";
import {
  type AppSession,
  clearSessionCookie,
  deleteSessionById,
} from "@/lib/auth/session";
import { resolveAppLanguage } from "@/lib/i18n/config";
import {
  findActiveMembershipByStoreFromPostgres,
  findPrimaryMembershipFromPostgres,
  getUserMembershipFlagsFromPostgres,
  listActiveMembershipsFromPostgres,
} from "@/lib/platform/postgres-auth-rbac";
import { queryOne } from "@/lib/db/query";

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
  hasInvitedMembership: boolean;
  hasSuspendedMembership: boolean;
};

async function findPreferredLanguage(userId: string) {
  const user = await queryOne<{ preferredLanguage: string | null }>(
    `
      select preferred_language as "preferredLanguage"
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId },
    },
  );

  return resolveAppLanguage(user?.preferredLanguage);
}

async function findPrimaryMembership(userId: string) {
  const postgresMembership = await findPrimaryMembershipFromPostgres(userId);
  if (postgresMembership !== undefined) {
    return postgresMembership ?? null;
  }
  return null;
}

export async function findActiveMembershipByStore(
  userId: string,
  storeId: string,
): Promise<ActiveMembership | null> {
  const postgresMembership = await findActiveMembershipByStoreFromPostgres(userId, storeId);
  if (postgresMembership !== undefined) {
    return postgresMembership ?? null;
  }
  return null;
}

export async function listActiveMemberships(userId: string): Promise<ActiveMembership[]> {
  const postgresMemberships = await listActiveMembershipsFromPostgres(userId);
  if (postgresMemberships !== undefined) {
    return postgresMemberships;
  }
  return [];
}

export async function getUserMembershipFlags(userId: string): Promise<UserMembershipFlags> {
  const postgresFlags = await getUserMembershipFlagsFromPostgres(userId);
  if (postgresFlags !== undefined) {
    return postgresFlags;
  }
  return {
    hasActiveMembership: false,
    hasInvitedMembership: false,
    hasSuspendedMembership: false,
  };
}

export async function buildSessionForUser(
  user: SessionUser,
  options?: { preferredStoreId?: string | null; preferredBranchId?: string | null },
): Promise<AppSession> {
  const preferredStoreId = options?.preferredStoreId?.trim();
  const preferredBranchId = options?.preferredBranchId?.trim();
  const membership = preferredStoreId
    ? (await findActiveMembershipByStore(user.id, preferredStoreId)) ??
      (await findPrimaryMembership(user.id))
    : await findPrimaryMembership(user.id);

  let activeBranchId: string | null = null;
  let activeBranchName: string | null = null;
  let activeBranchCode: string | null = null;

  if (membership) {
    await ensureMainBranchExists(membership.storeId);
    const accessibleBranches = await listAccessibleBranchesForMember(user.id, membership.storeId);
    const targetBranch =
      (preferredBranchId
        ? accessibleBranches.find((branch) => branch.id === preferredBranchId)
        : null) ??
      accessibleBranches.find((branch) => branch.code === "MAIN") ??
      accessibleBranches[0] ??
      null;

    activeBranchId = targetBranch?.id ?? null;
    activeBranchName = targetBranch?.name ?? null;
    activeBranchCode = targetBranch?.code ?? null;
  }

  const language = await findPreferredLanguage(user.id);

  return {
    userId: user.id,
    email: user.email,
    displayName: user.name,
    language,
    hasStoreMembership: Boolean(membership),
    activeStoreId: membership?.storeId ?? null,
    activeStoreName: membership?.storeName ?? null,
    activeStoreType: membership?.storeType ?? null,
    activeBranchId,
    activeBranchName,
    activeBranchCode,
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
