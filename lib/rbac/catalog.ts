import { permissions } from "@/lib/db/schema";
import {
  defaultPermissionCatalog,
  permissionIdFromKey,
  permissionKey,
} from "@/lib/rbac/defaults";

export async function ensurePermissionCatalog() {
  const { db } = await import("@/lib/db/client");
  await db
    .insert(permissions)
    .values(
      defaultPermissionCatalog.map((item) => {
        const key = permissionKey(item.resource, item.action);
        return {
          id: permissionIdFromKey(key),
          key,
          resource: item.resource,
          action: item.action,
        };
      }),
    )
    .onConflictDoNothing({ target: permissions.key });
}
