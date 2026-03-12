import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidateUserSessions } from "@/lib/auth/session";
import { execute, queryMany, queryOne } from "@/lib/db/query";
import { timeDbQuery } from "@/lib/perf/server";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getPermissionCatalog } from "@/lib/rbac/queries";
import { safeLogAuditEvent } from "@/server/services/audit.service";

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

    const role = await timeDbQuery("api.roles.getRole", async () =>
      queryOne<{
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
          where id = :roleId and store_id = :storeId
          limit 1
        `,
        {
          replacements: { roleId, storeId },
        },
      ),
    );

    if (!role) {
      return NextResponse.json({ message: "ไม่พบบทบาท" }, { status: 404 });
    }

    const [allPermissionRows, assigned] = await Promise.all([
      getPermissionCatalog(),
      timeDbQuery("api.roles.assignedPermissions", async () =>
        queryMany<{ permissionKey: string }>(
          `
            select p.key as "permissionKey"
            from role_permissions rp
            inner join permissions p on rp.permission_id = p.id
            where rp.role_id = :roleId
          `,
          {
            replacements: { roleId: role.id },
          },
        ),
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
  const auditAction = "store.role.permissions.update";
  let auditContext: {
    storeId: string;
    actorUserId: string;
    actorName: string | null;
    actorRole: string | null;
    roleId: string | null;
  } | null = null;

  try {
    const { storeId, session } = await enforcePermission("rbac.roles.update");

    const { roleId } = await context.params;
    auditContext = {
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      roleId,
    };
    const payload = updateRolePermissionSchema.safeParse(await request.json());

    if (!payload.success) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "role",
        entityId: roleId,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: "ข้อมูลสิทธิ์ไม่ถูกต้อง" }, { status: 400 });
    }

    const role = await timeDbQuery("api.roles.patch.getRole", async () =>
      queryOne<{
        id: string;
        name: string;
        isSystem: boolean;
      }>(
        `
          select
            id,
            name,
            is_system as "isSystem"
          from roles
          where id = :roleId and store_id = :storeId
          limit 1
        `,
        {
          replacements: { roleId, storeId },
        },
      ),
    );

    if (!role) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "role",
        entityId: roleId,
        result: "FAIL",
        reasonCode: "NOT_FOUND",
        request,
      });
      return NextResponse.json({ message: "ไม่พบบทบาท" }, { status: 404 });
    }

    if (Boolean(role.isSystem) && role.name === "Owner") {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "role",
        entityId: role.id,
        result: "FAIL",
        reasonCode: "BUSINESS_RULE",
        metadata: {
          message: "owner_role_locked",
        },
        request,
      });
      return NextResponse.json(
        { message: "ไม่สามารถแก้ไขสิทธิ์ของ Owner ได้" },
        { status: 400 },
      );
    }

    const uniqueKeys = [...new Set(payload.data.permissionKeys)];
    const permissionCatalog = await getPermissionCatalog();
    const permissionIdByKey = new Map(permissionCatalog.map((permission) => [permission.key, permission.id]));
    const permissionKeyById = new Map(permissionCatalog.map((permission) => [permission.id, permission.key]));

    const selectedIdSet = new Set(
      uniqueKeys
        .map((key) => permissionIdByKey.get(key))
        .filter((permissionId): permissionId is string => Boolean(permissionId)),
    );

    const currentRows = await timeDbQuery("api.roles.patch.currentPermissions", async () =>
      queryMany<{ permissionId: string }>(
        `
          select permission_id as "permissionId"
          from role_permissions
          where role_id = :roleId
        `,
        {
          replacements: { roleId },
        },
      ),
    );

    const currentIdSet = new Set(currentRows.map((item) => item.permissionId));
    const currentPermissionKeys = [...currentIdSet]
      .map((permissionId) => permissionKeyById.get(permissionId))
      .filter((permissionKey): permissionKey is string => Boolean(permissionKey))
      .sort();
    const selectedPermissionKeys = [...selectedIdSet]
      .map((permissionId) => permissionKeyById.get(permissionId))
      .filter((permissionKey): permissionKey is string => Boolean(permissionKey))
      .sort();

    const toInsert = [...selectedIdSet].filter((permissionId) => !currentIdSet.has(permissionId));
    const toDelete = [...currentIdSet].filter((permissionId) => !selectedIdSet.has(permissionId));

    if (toDelete.length > 0) {
      await timeDbQuery("api.roles.patch.deletePermissions", async () =>
        execute(
          `
            delete from role_permissions
            where role_id = :roleId
              and permission_id in (:permissionIds)
          `,
          {
            replacements: {
              roleId,
              permissionIds: toDelete,
            },
          },
        ),
      );
    }

    if (toInsert.length > 0) {
      await timeDbQuery("api.roles.patch.insertPermissions", async () =>
        execute(
          `
            insert into role_permissions (role_id, permission_id)
            values ${toInsert.map((_, index) => `(:roleId, :permissionId${index})`).join(", ")}
            on conflict do nothing
          `,
          {
            replacements: Object.fromEntries([
              ["roleId", roleId],
              ...toInsert.map((permissionId, index) => [`permissionId${index}`, permissionId]),
            ]),
          },
        ),
      );
    }

    if (toInsert.length > 0 || toDelete.length > 0) {
      const roleMemberRows = await queryMany<{ userId: string }>(
        `
          select user_id as "userId"
          from store_members
          where store_id = :storeId and role_id = :roleId
        `,
        {
          replacements: { storeId, roleId },
        },
      );

      const userIds = [...new Set(roleMemberRows.map((row) => row.userId))];
      await Promise.all(userIds.map((userId) => invalidateUserSessions(userId)));
    }

    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action: auditAction,
      entityType: "role",
      entityId: role.id,
      metadata: {
        roleName: role.name,
        addedCount: toInsert.length,
        removedCount: toDelete.length,
        unknownPermissionKeys: uniqueKeys.filter((key) => !permissionIdByKey.has(key)),
      },
      before: {
        permissionKeys: currentPermissionKeys,
      },
      after: {
        permissionKeys: selectedPermissionKeys,
      },
      request,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.actorUserId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: auditAction,
        entityType: "role",
        entityId: auditContext.roleId,
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
