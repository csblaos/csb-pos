import { cache } from "react";

import { redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { getPermissionCatalogFromPostgres } from "@/lib/platform/postgres-auth-rbac";

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

  const rows = (await getPermissionCatalogFromPostgres()) ?? [];

  await redisSetJson(PERMISSION_CATALOG_KEY, rows, PERMISSION_CATALOG_TTL_SECONDS);
  return rows;
};

const getPermissionCatalogForRequest = cache(getPermissionCatalogInternal);

export async function getPermissionCatalog() {
  return getPermissionCatalogForRequest();
}
