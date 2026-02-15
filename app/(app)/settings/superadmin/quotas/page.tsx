import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ChevronRight, Gauge, ShieldCheck, Store } from "lucide-react";
import { redirect } from "next/navigation";

import {
  evaluateBranchCreationAccess,
  formatBranchQuotaSummary,
  getGlobalBranchPolicy,
} from "@/lib/branches/policy";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import {
  evaluateStoreCreationAccess,
  getStoreCreationPolicy,
} from "@/lib/auth/store-creation";
import { db } from "@/lib/db/client";
import { storeBranches, storeMembers, stores, users } from "@/lib/db/schema";

const toNumber = (value: unknown) => Number(value ?? 0);
const toNonNegativeIntOrNull = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
};
const toUsagePercent = (current: number, max: number | null) => {
  if (max === null || max <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((current / max) * 100)));
};
const resolveEffectiveBranchLimit = (params: {
  storeMaxBranchesOverride: number | null;
  superadminMaxBranchesPerStoreOverride: number | null;
  globalDefaultMaxBranchesPerStore: number | null;
}) => {
  if (params.storeMaxBranchesOverride !== null) {
    return {
      effectiveMaxBranchesPerStore: params.storeMaxBranchesOverride,
      effectiveLimitSource: "STORE_OVERRIDE" as const,
    };
  }

  if (params.superadminMaxBranchesPerStoreOverride !== null) {
    return {
      effectiveMaxBranchesPerStore: params.superadminMaxBranchesPerStoreOverride,
      effectiveLimitSource: "SUPERADMIN_OVERRIDE" as const,
    };
  }

  if (params.globalDefaultMaxBranchesPerStore !== null) {
    return {
      effectiveMaxBranchesPerStore: params.globalDefaultMaxBranchesPerStore,
      effectiveLimitSource: "GLOBAL_DEFAULT" as const,
    };
  }

  return {
    effectiveMaxBranchesPerStore: null,
    effectiveLimitSource: "UNLIMITED" as const,
  };
};

export default async function SettingsSuperadminQuotasPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const storeIds = memberships.map((membership) => membership.storeId);

  const [storePolicy, globalBranchPolicy, activeMemberRows, branchCountRows, storeRows, userRows] = await Promise.all([
    getStoreCreationPolicy(session.userId),
    getGlobalBranchPolicy(),
    db
      .select({
        storeId: storeMembers.storeId,
        count: sql<number>`count(*)`,
      })
      .from(storeMembers)
      .where(and(inArray(storeMembers.storeId, storeIds), eq(storeMembers.status, "ACTIVE")))
      .groupBy(storeMembers.storeId),
    db
      .select({
        storeId: storeBranches.storeId,
        count: sql<number>`count(*)`,
      })
      .from(storeBranches)
      .where(inArray(storeBranches.storeId, storeIds))
      .groupBy(storeBranches.storeId),
    db
      .select({
        id: stores.id,
        maxBranchesOverride: stores.maxBranchesOverride,
      })
      .from(stores)
      .where(inArray(stores.id, storeIds)),
    db
      .select({
        systemRole: users.systemRole,
        canCreateBranches: users.canCreateBranches,
        maxBranchesPerStore: users.maxBranchesPerStore,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1),
  ]);

  const storeAccess = evaluateStoreCreationAccess(storePolicy);
  const activeMembersByStore = new Map(activeMemberRows.map((row) => [row.storeId, toNumber(row.count)]));
  const branchCountByStore = new Map(branchCountRows.map((row) => [row.storeId, toNumber(row.count)]));
  const storeMaxBranchesOverrideByStore = new Map(
    storeRows.map((row) => [row.id, toNonNegativeIntOrNull(row.maxBranchesOverride)]),
  );
  const existingStoreIds = new Set(storeRows.map((row) => row.id));
  const userRow = userRows[0];
  const isSuperadmin = (userRow?.systemRole ?? storePolicy.systemRole) === "SUPERADMIN";
  const superadminCanCreateBranchesOverride =
    typeof userRow?.canCreateBranches === "boolean" ? userRow.canCreateBranches : null;
  const superadminMaxBranchesPerStoreOverride = toNonNegativeIntOrNull(
    userRow?.maxBranchesPerStore,
  );
  const branchPolicies = memberships.map((membership) => {
    const storeExists = existingStoreIds.has(membership.storeId);
    const storeMaxBranchesOverride = storeMaxBranchesOverrideByStore.get(membership.storeId) ?? null;
    const currentBranchCount = branchCountByStore.get(membership.storeId) ?? 0;
    const effectiveCanCreateBranches =
      superadminCanCreateBranchesOverride ?? globalBranchPolicy.defaultCanCreateBranches;
    const { effectiveMaxBranchesPerStore, effectiveLimitSource } = resolveEffectiveBranchLimit({
      storeMaxBranchesOverride,
      superadminMaxBranchesPerStoreOverride,
      globalDefaultMaxBranchesPerStore: globalBranchPolicy.defaultMaxBranchesPerStore,
    });
    const policy = {
      storeExists,
      isSuperadmin,
      isStoreOwner: membership.roleName === "Owner",
      currentBranchCount,
      globalDefaultCanCreateBranches: globalBranchPolicy.defaultCanCreateBranches,
      globalDefaultMaxBranchesPerStore: globalBranchPolicy.defaultMaxBranchesPerStore,
      superadminCanCreateBranchesOverride,
      superadminMaxBranchesPerStoreOverride,
      storeMaxBranchesOverride,
      effectiveCanCreateBranches,
      effectiveMaxBranchesPerStore,
      effectiveLimitSource,
    };
    const access = evaluateBranchCreationAccess(policy);

    return {
      membership,
      policy,
      access,
      summary: formatBranchQuotaSummary(policy),
    };
  });

  const storesCanCreateBranchCount = branchPolicies.filter((item) => item.access.allowed).length;
  const storesNearBranchLimitCount = branchPolicies.filter((item) => {
    const usagePercent = toUsagePercent(
      item.policy.currentBranchCount,
      item.policy.effectiveMaxBranchesPerStore,
    );
    return usagePercent !== null && usagePercent >= 80;
  }).length;
  const storesBlockedCount = branchPolicies.filter((item) => !item.access.allowed).length;

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Quota & Policy</h1>
        <p className="text-sm text-slate-500">ตรวจสิทธิ์การสร้างร้าน/สาขาและขีดจำกัดปัจจุบันของแต่ละร้าน</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">โควตาสร้างร้านของบัญชี</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {typeof storePolicy.maxStores === "number"
              ? `${storePolicy.activeOwnerStoreCount.toLocaleString("th-TH")} / ${storePolicy.maxStores.toLocaleString("th-TH")} ร้าน`
              : `ไม่จำกัด (ปัจจุบัน ${storePolicy.activeOwnerStoreCount.toLocaleString("th-TH")} ร้าน)`}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">สิทธิ์สร้างร้าน</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {storeAccess.allowed ? "ใช้งานได้" : "ถูกจำกัด"}
          </p>
          {!storeAccess.allowed && storeAccess.reason ? (
            <p className="mt-1 text-xs text-red-600">{storeAccess.reason}</p>
          ) : null}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านที่ยังสร้างสาขาได้</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {storesCanCreateBranchCount.toLocaleString("th-TH")} / {memberships.length.toLocaleString("th-TH")} ร้าน
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านใกล้เต็มโควตาสาขา (≥80%)</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {storesNearBranchLimitCount.toLocaleString("th-TH")} ร้าน
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ร้านที่ติดเพดานแล้ว/ถูกบล็อก: {storesBlockedCount.toLocaleString("th-TH")} ร้าน
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">นโยบายสาขาแยกร้าน</p>
          <p className="mt-0.5 text-xs text-slate-500">ใช้ตรวจว่าร้านไหนติดโควตาหรือไม่มีสิทธิ์สร้างสาขา</p>
        </div>

        <ul className="divide-y divide-slate-100">
          {branchPolicies.map((item) => {
            const activeMembers = activeMembersByStore.get(item.membership.storeId) ?? 0;
            const usagePercent = toUsagePercent(
              item.policy.currentBranchCount,
              item.policy.effectiveMaxBranchesPerStore,
            );

            return (
              <li key={item.membership.storeId} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{item.membership.storeName}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      บทบาท {item.membership.roleName} • สมาชิก ACTIVE {activeMembers.toLocaleString("th-TH")} คน
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      item.access.allowed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {item.access.allowed ? "สร้างสาขาได้" : "สร้างสาขาไม่ได้"}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-medium text-slate-700">{item.summary}</p>
                  {usagePercent !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${
                            usagePercent >= 100
                              ? "bg-red-500"
                              : usagePercent >= 80
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        ใช้ไป {usagePercent.toLocaleString("th-TH")}% ของโควตาสาขา
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">ไม่จำกัดโควตาสาขา</p>
                  )}
                  {!item.access.allowed && item.access.reason ? (
                    <p className="mt-1 text-xs text-red-600">{item.access.reason}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      ใช้เพดานตาม {item.policy.effectiveLimitSource} • สาขาปัจจุบัน {item.policy.currentBranchCount.toLocaleString("th-TH")} แห่ง
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">เลือกเมนูจัดการอื่น ๆ</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                กลับหน้าเลือกร้าน / เปลี่ยนสาขา
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ออกจากโหมดผู้ดูแลกลับหน้าใช้งานรายวัน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/stores/store-config"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไปหน้าตั้งค่าร้าน</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">สร้างร้านใหม่หรือปรับโควตาร้าน</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/global-config"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                ไปดู Global Configuration
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจค่า default policy ที่ส่งผลกับโควตา
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
