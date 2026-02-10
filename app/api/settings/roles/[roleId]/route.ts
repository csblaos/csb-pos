import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { permissions, rolePermissions, roles } from "@/lib/db/schema";
import { timeDbQuery } from "@/lib/perf/server";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getPermissionCatalog } from "@/lib/rbac/queries";

const updateRolePermissionSchema = z.object({
  permissionKeys: z.array(z.string().min(1)).max(1000),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ roleId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("rbac.roles.view");

    const { roleId } = await context.params;

    const [role] = await timeDbQuery("api.roles.getRole", async () =>
      db
        .select({
          id: roles.id,
          name: roles.name,
          isSystem: roles.isSystem,
          createdAt: roles.createdAt,
        })
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.storeId, storeId)))
        .limit(1),
    );

    if (!role) {
      return NextResponse.json({ message: "ไม่พบบทบาท" }, { status: 404 });
    }

    const [allPermissionRows, assigned] = await Promise.all([
      getPermissionCatalog(),
      timeDbQuery("api.roles.assignedPermissions", async () =>
        db
          .select({
            permissionKey: permissions.key,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(eq(rolePermissions.roleId, role.id)),
      ),
    ]);

    return NextResponse.json({
      ok: true,
      role: {
        ...role,
        locked: Boolean(role.isSystem) && role.name === "Owner",
      },
      permissions: allPermissionRows,
      assignedPermissionKeys: assigned.map((item) => item.permissionKey),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ roleId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("rbac.roles.update");

    const { roleId } = await context.params;
    const payload = updateRolePermissionSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลสิทธิ์ไม่ถูกต้อง" }, { status: 400 });
    }

    const [role] = await timeDbQuery("api.roles.patch.getRole", async () =>
      db
        .select({
          id: roles.id,
          name: roles.name,
          isSystem: roles.isSystem,
        })
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.storeId, storeId)))
        .limit(1),
    );

    if (!role) {
      return NextResponse.json({ message: "ไม่พบบทบาท" }, { status: 404 });
    }

    if (Boolean(role.isSystem) && role.name === "Owner") {
      return NextResponse.json(
        { message: "ไม่สามารถแก้ไขสิทธิ์ของ Owner ได้" },
        { status: 400 },
      );
    }

    const uniqueKeys = [...new Set(payload.data.permissionKeys)];
    const permissionCatalog = await getPermissionCatalog();
    const permissionIdByKey = new Map(permissionCatalog.map((permission) => [permission.key, permission.id]));

    const selectedIdSet = new Set(
      uniqueKeys
        .map((key) => permissionIdByKey.get(key))
        .filter((permissionId): permissionId is string => Boolean(permissionId)),
    );

    const currentRows = await timeDbQuery("api.roles.patch.currentPermissions", async () =>
      db
        .select({ permissionId: rolePermissions.permissionId })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId)),
    );

    const currentIdSet = new Set(currentRows.map((item) => item.permissionId));

    const toInsert = [...selectedIdSet].filter((permissionId) => !currentIdSet.has(permissionId));
    const toDelete = [...currentIdSet].filter((permissionId) => !selectedIdSet.has(permissionId));

    if (toDelete.length > 0) {
      await timeDbQuery("api.roles.patch.deletePermissions", async () =>
        db
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, roleId),
              inArray(rolePermissions.permissionId, toDelete),
            ),
          ),
      );
    }

    if (toInsert.length > 0) {
      await timeDbQuery("api.roles.patch.insertPermissions", async () =>
        db
          .insert(rolePermissions)
          .values(toInsert.map((permissionId) => ({ roleId, permissionId })))
          .onConflictDoNothing(),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
