import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { rolePermissions, roles, storeMembers } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

export async function GET() {
  try {
    const { storeId } = await enforcePermission("rbac.roles.view");

    const [roleRows, memberCounts, permissionCounts] = await Promise.all([
      db
        .select({
          id: roles.id,
          name: roles.name,
          isSystem: roles.isSystem,
          createdAt: roles.createdAt,
        })
        .from(roles)
        .where(eq(roles.storeId, storeId))
        .orderBy(asc(roles.name)),
      db
        .select({
          roleId: storeMembers.roleId,
          count: sql<number>`count(*)`,
        })
        .from(storeMembers)
        .where(eq(storeMembers.storeId, storeId))
        .groupBy(storeMembers.roleId),
      db
        .select({
          roleId: rolePermissions.roleId,
          count: sql<number>`count(*)`,
        })
        .from(rolePermissions)
        .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
        .where(eq(roles.storeId, storeId))
        .groupBy(rolePermissions.roleId),
    ]);

    const memberCountMap = new Map(memberCounts.map((item) => [item.roleId, item.count]));
    const permissionCountMap = new Map(
      permissionCounts.map((item) => [item.roleId, item.count]),
    );

    const rows = roleRows.map((role) => ({
      ...role,
      memberCount: Number(memberCountMap.get(role.id) ?? 0),
      permissionCount: Number(permissionCountMap.get(role.id) ?? 0),
      locked: Boolean(role.isSystem) && role.name === "Owner",
    }));

    return NextResponse.json({ ok: true, roles: rows });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
