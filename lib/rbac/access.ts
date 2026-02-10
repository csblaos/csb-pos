import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { permissions, rolePermissions, roles, storeMembers } from "@/lib/db/schema";

export const OWNER_PERMISSION_WILDCARD = "*";

type UserIdentity = string | { id?: string; userId?: string };

export class RBACError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const userIdFromIdentity = (user: UserIdentity) => {
  if (typeof user === "string") {
    return user;
  }

  const userId = user.userId ?? user.id;
  if (!userId) {
    throw new RBACError(400, "ไม่พบรหัสผู้ใช้");
  }

  return userId;
};

async function getMembership(userId: string, storeId: string) {
  const [membership] = await db
    .select({
      roleId: roles.id,
      roleName: roles.name,
      status: storeMembers.status,
    })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .where(
      and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, userId),
        eq(storeMembers.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return membership ?? null;
}

const getMembershipForRequest = cache(getMembership);

async function getAllPermissionKeys() {
  const allPermissionRows = await db.select({ key: permissions.key }).from(permissions);
  return allPermissionRows.map((permission) => permission.key);
}

const getAllPermissionKeysCached = unstable_cache(
  async () => getAllPermissionKeys(),
  ["rbac.permissions.keys.v1"],
  { revalidate: 60 * 10 },
);

async function getRolePermissionKeys(roleId: string) {
  const permissionRows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  return permissionRows.map((permission) => permission.key);
}

const getRolePermissionKeysForRequest = cache(getRolePermissionKeys);

async function getUserPermissionsInternal(
  userId: string,
  storeId: string,
  options?: { requestCached?: boolean },
) {
  const membership = options?.requestCached
    ? await getMembershipForRequest(userId, storeId)
    : await getMembership(userId, storeId);

  if (!membership) {
    return [];
  }

  if (membership.roleName === "Owner") {
    const permissionKeys = options?.requestCached
      ? await getAllPermissionKeysCached()
      : await getAllPermissionKeys();
    return [OWNER_PERMISSION_WILDCARD, ...new Set(permissionKeys)];
  }

  if (options?.requestCached) {
    return getRolePermissionKeysForRequest(membership.roleId);
  }

  return getRolePermissionKeys(membership.roleId);
}

const getUserPermissionsForRequest = cache(
  async (userId: string, storeId: string) =>
    getUserPermissionsInternal(userId, storeId, { requestCached: true }),
);

export async function getUserPermissions(user: UserIdentity, storeId: string) {
  const userId = userIdFromIdentity(user);
  return getUserPermissionsInternal(userId, storeId);
}

export const isPermissionGranted = (
  permissionKeys: string[],
  permissionKey: string,
) =>
  permissionKeys.includes(OWNER_PERMISSION_WILDCARD) ||
  permissionKeys.includes(permissionKey);

export async function hasPermission(
  user: UserIdentity,
  storeId: string,
  permissionKey: string,
) {
  const permissionKeys = await getUserPermissions(user, storeId);
  return isPermissionGranted(permissionKeys, permissionKey);
}

export async function getUserPermissionsForCurrentSession() {
  const session = await getSession();

  if (!session || !session.activeStoreId) {
    return [];
  }

  return getUserPermissionsForRequest(session.userId, session.activeStoreId);
}

export async function enforcePermission(
  permissionKey: string,
  options?: { storeId?: string },
) {
  const session = await getSession();

  if (!session) {
    throw new RBACError(401, "กรุณาเข้าสู่ระบบ");
  }

  const storeId = options?.storeId ?? session.activeStoreId;
  if (!storeId) {
    throw new RBACError(400, "ยังไม่ได้เลือกร้านค้า");
  }

  const allowed = await hasPermission({ userId: session.userId }, storeId, permissionKey);
  if (!allowed) {
    throw new RBACError(403, "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }

  return {
    session,
    storeId,
  };
}

export const toRBACErrorResponse = (error: unknown) => {
  if (error instanceof RBACError) {
    return Response.json({ message: error.message }, { status: error.status });
  }

  return Response.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
};
