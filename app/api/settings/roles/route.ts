import { NextResponse } from "next/server";

import { queryMany } from "@/lib/db/query";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

export async function GET() {
  try {
    const { storeId } = await enforcePermission("rbac.roles.view");

    const [roleRows, memberCounts, permissionCounts] = await Promise.all([
      queryMany<{
        id: string;
        name: string;
        isSystem: boolean;
        createdAt: string;
      }>(
        `
          select
            id,
            name,
            is_system as "isSystem",
            created_at as "createdAt"
          from roles
          where store_id = :storeId
          order by name asc
        `,
        {
          replacements: { storeId },
        },
      ),
      queryMany<{
        roleId: string;
        count: number | string;
      }>(
        `
          select
            role_id as "roleId",
            count(*) as "count"
          from store_members
          where store_id = :storeId
          group by role_id
        `,
        {
          replacements: { storeId },
        },
      ),
      queryMany<{
        roleId: string;
        count: number | string;
      }>(
        `
          select
            rp.role_id as "roleId",
            count(*) as "count"
          from role_permissions rp
          inner join roles r on rp.role_id = r.id
          where r.store_id = :storeId
          group by rp.role_id
        `,
        {
          replacements: { storeId },
        },
      ),
    ]);

    const memberCountMap = new Map(
      memberCounts.map((item) => [item.roleId, Number(item.count ?? 0)]),
    );
    const permissionCountMap = new Map(
      permissionCounts.map((item) => [item.roleId, Number(item.count ?? 0)]),
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
