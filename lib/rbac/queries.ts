import { cache } from "react";

import { redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { db } from "@/lib/db/client";
import { permissions } from "@/lib/db/schema";
import { timeDbQuery } from "@/lib/perf/server";

export type PermissionCatalogRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
};

const PERMISSION_CATALOG_KEY = "rbac:permission_catalog:v1";
const PERMISSION_CATALOG_TTL_SECONDS = 60 * 10;

const getPermissionCatalogInternal = async (): Promise<PermissionCatalogRow[]> => {
  const cached = await redisGetJson<PermissionCatalogRow[]>(PERMISSION_CATALOG_KEY);
  if (cached) {
    return cached;
  }

  const rows = await timeDbQuery("rbac.permissions.catalog", async () =>
    db
      .select({
        id: permissions.id,
        key: permissions.key,
        resource: permissions.resource,
        action: permissions.action,
      })
      .from(permissions),
  );

  await redisSetJson(PERMISSION_CATALOG_KEY, rows, PERMISSION_CATALOG_TTL_SECONDS);
  return rows;
};

const getPermissionCatalogForRequest = cache(getPermissionCatalogInternal);

export async function getPermissionCatalog() {
  return getPermissionCatalogForRequest();
}
