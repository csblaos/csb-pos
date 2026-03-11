import { execute } from "@/lib/db/query";
import { defaultPermissionCatalog, permissionIdFromKey, permissionKey } from "@/lib/rbac/defaults";

export async function ensurePermissionCatalog() {
  for (const item of defaultPermissionCatalog) {
    const key = permissionKey(item.resource, item.action);
    await execute(
      `
        insert into permissions (
          id,
          key,
          resource,
          action,
          created_at,
          updated_at
        )
        values (
          :id,
          :key,
          :resource,
          :action,
          current_timestamp,
          current_timestamp
        )
        on conflict (key) do nothing
      `,
      {
        replacements: {
          id: permissionIdFromKey(key),
          key,
          resource: item.resource,
          action: item.action,
        },
      },
    );
  }
}
