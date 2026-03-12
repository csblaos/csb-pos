import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getStoreShellProfileFromPostgres } from "@/lib/platform/postgres-auth-rbac";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";
import { normalizeStoreType } from "@/lib/storefront/types";

const getActiveStoreProfile = async (storeId: string) => {
  const postgresProfile = await getStoreShellProfileFromPostgres(storeId);
  if (postgresProfile !== undefined) {
    return postgresProfile ?? null;
  }
  throw new Error("PostgreSQL app shell store profile is not available");
};

const readAppShellContext = cache(async () => {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      systemRole: null,
      permissionKeys: [] as string[],
      activeStoreProfile: null,
      activeStoreType: null,
      activeStoreName: "-",
      canViewNotifications: false,
    };
  }

  const systemRole = await getUserSystemRole(session.userId);

  const [permissionKeys, activeStoreProfile] = session.activeStoreId
    ? await Promise.all([
        getUserPermissionsForCurrentSession(),
        getActiveStoreProfile(session.activeStoreId),
      ])
    : [[], null];

  const activeStoreType = normalizeStoreType(session.activeStoreType);

  return {
    session,
    systemRole,
    permissionKeys,
    activeStoreProfile,
    activeStoreType,
    activeStoreName: activeStoreProfile?.name ?? session.activeStoreName ?? "-",
    canViewNotifications:
      permissionKeys.includes("*") || permissionKeys.includes("settings.view"),
  };
});

export const getAppShellContext = async () => readAppShellContext();
