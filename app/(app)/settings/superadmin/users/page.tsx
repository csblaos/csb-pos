import Link from "next/link";
import { ChevronRight, KeyRound, ShieldCheck, Store, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { StoresManagement } from "@/components/app/stores-management";
import { UsersManagement } from "@/components/app/users-management";
import { ensureMainBranchExists } from "@/lib/branches/access";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { queryMany } from "@/lib/db/query";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import { listStoreBranchesFromPostgres } from "@/lib/platform/postgres-auth-rbac";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getGlobalSessionPolicy } from "@/lib/system-config/policy";

function UsersManagementFallback() {
  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />
      </article>
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        </div>
        <ul className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="flex items-center gap-3 px-4 py-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

async function UsersManagementContent({
  storeId,
  language,
  canCreate,
  canUpdate,
  defaultSessionLimit,
}: {
  storeId: string;
  language: AppLanguage;
  canCreate: boolean;
  canUpdate: boolean;
  defaultSessionLimit: number;
}) {
  await ensureMainBranchExists(storeId);

  const [members, roleOptions, branches] = await Promise.all([
    queryMany<{
      userId: string;
      email: string;
      name: string;
      systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
      mustChangePassword: boolean;
      sessionLimit: number | string | null;
      createdByUserId: string | null;
      createdByName: string | null;
      roleId: string;
      roleName: string;
      status: "ACTIVE" | "INVITED" | "SUSPENDED";
      joinedAt: string;
      addedByUserId: string | null;
      addedByName: string | null;
    }>(
      `
        select
          u.id as "userId",
          u.email,
          u.name,
          u.system_role as "systemRole",
          u.must_change_password as "mustChangePassword",
          u.session_limit as "sessionLimit",
          u.created_by as "createdByUserId",
          creator.name as "createdByName",
          r.id as "roleId",
          r.name as "roleName",
          sm.status as "status",
          sm.created_at as "joinedAt",
          sm.added_by as "addedByUserId",
          adder.name as "addedByName"
        from store_members sm
        inner join users u on sm.user_id = u.id
        inner join roles r on sm.role_id = r.id and sm.store_id = r.store_id
        left join users creator on u.created_by = creator.id
        left join users adder on sm.added_by = adder.id
        where sm.store_id = :storeId
        order by u.name asc
      `,
      { replacements: { storeId } },
    ).then((rows) =>
      rows.map((row) => ({
        ...row,
        mustChangePassword: row.mustChangePassword === true,
        sessionLimit:
          typeof row.sessionLimit === "number"
            ? row.sessionLimit
            : typeof row.sessionLimit === "string" && row.sessionLimit.trim().length > 0
              ? Number(row.sessionLimit)
              : null,
      })),
    ),
    queryMany<{ id: string; name: string }>(
      `
        select id, name
        from roles
        where store_id = :storeId
        order by name asc
      `,
      { replacements: { storeId } },
    ),
    listStoreBranchesFromPostgres(storeId).then((rows) => rows ?? []),
  ]);

  return (
    <UsersManagement
      language={language}
      members={members}
      roles={roleOptions}
      branches={branches}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canLinkExisting
      defaultSessionLimit={defaultSessionLimit}
    />
  );
}

export default async function SettingsSuperadminUsersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const locale = getAppLanguageLocale(session.language);

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  if (!session.activeStoreId) {
    redirect("/settings/stores");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "members.view");
  const canCreate = isPermissionGranted(permissionKeys, "members.create");
  const canUpdate = isPermissionGranted(permissionKeys, "members.update");

  if (!canView) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t("superadmin.users.title")}</h1>
        <p className="text-sm text-red-600">{t("superadmin.users.noPermission")}</p>
        <Link href="/settings/stores" className="text-sm font-medium text-blue-700 hover:underline">
          {t("superadmin.users.noPermissionLink")}
        </Link>
      </section>
    );
  }

  const [storeMemberStatusRows, globalSessionPolicy] = await Promise.all([
    queryMany<{
      status: "ACTIVE" | "INVITED" | "SUSPENDED";
      count: number | string;
    }>(
      `
        select
          status,
          count(*)::int as "count"
        from store_members
        where store_id = :storeId
        group by status
      `,
      { replacements: { storeId: session.activeStoreId } },
    ),
    getGlobalSessionPolicy(),
  ]);

  const activeCount =
    Number(storeMemberStatusRows.find((row) => row.status === "ACTIVE")?.count ?? 0);
  const invitedCount =
    Number(storeMemberStatusRows.find((row) => row.status === "INVITED")?.count ?? 0);
  const suspendedCount =
    Number(storeMemberStatusRows.find((row) => row.status === "SUSPENDED")?.count ?? 0);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <p className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("superadmin.users.workspaceBadge")}
        </p>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">{t("superadmin.users.title")}</h1>
        <p className="text-sm text-slate-500">{t("superadmin.users.description")}</p>
      </header>

      <StoresManagement
        language={session.language}
        memberships={memberships}
        activeStoreId={session.activeStoreId}
        activeBranchId={session.activeBranchId}
        isSuperadmin
        canCreateStore={false}
        createStoreBlockedReason={null}
        storeQuotaSummary={null}
        mode="quick"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.users.metric.active")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {activeCount.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.users.metric.invited")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {invitedCount.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.users.metric.suspended")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {suspendedCount.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.users.metric.sessionDefault")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {globalSessionPolicy.defaultSessionLimit.toLocaleString(locale)}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("superadmin.users.roleTemplate.title")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("superadmin.users.roleTemplate.description")}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{t("superadmin.users.roleTemplate.owner.title")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("superadmin.users.roleTemplate.owner.description")}</p>
          </li>
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{t("superadmin.users.roleTemplate.admin.title")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("superadmin.users.roleTemplate.admin.description")}</p>
          </li>
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{t("superadmin.users.roleTemplate.manager.title")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("superadmin.users.roleTemplate.manager.description")}</p>
          </li>
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{t("superadmin.users.roleTemplate.cashier.title")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("superadmin.users.roleTemplate.cashier.description")}</p>
          </li>
        </ul>
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.users.manageCurrentStore")}
        </p>
      </div>

      <Suspense fallback={<UsersManagementFallback />}>
        <UsersManagementContent
          storeId={session.activeStoreId}
          language={session.language}
          canCreate={canCreate}
          canUpdate={canUpdate}
          defaultSessionLimit={globalSessionPolicy.defaultSessionLimit}
        />
      </Suspense>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.users.linksTitle")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.users.links.center.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.users.links.center.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/roles"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <KeyRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.users.links.roles.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.users.links.roles.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.users.links.storeSwitcher.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.users.links.storeSwitcher.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
