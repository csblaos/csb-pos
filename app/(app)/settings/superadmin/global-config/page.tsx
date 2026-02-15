import Link from "next/link";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { ChevronRight, Gauge, Settings2, ShieldCheck, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import { db } from "@/lib/db/client";
import { storeMembers, stores, users } from "@/lib/db/schema";
import { getGlobalSessionPolicy, getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";

export default async function SettingsSuperadminGlobalConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const storeIds = memberships.map((membership) => membership.storeId);

  const [
    globalBranchPolicy,
    globalSessionPolicy,
    globalStoreLogoPolicy,
    storeOverrideCountRows,
    superadminOverrideCountRows,
    storeOverrideRows,
    superadminOverrideRows,
  ] = await Promise.all([
    getGlobalBranchPolicy(),
    getGlobalSessionPolicy(),
    getGlobalStoreLogoPolicy(),
    db
      .select({ value: sql<number>`count(*)` })
      .from(stores)
      .where(and(inArray(stores.id, storeIds), isNotNull(stores.maxBranchesOverride))),
    db
      .select({ value: sql<number>`count(distinct ${users.id})` })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(
        and(
          inArray(storeMembers.storeId, storeIds),
          eq(users.systemRole, "SUPERADMIN"),
          or(
            isNotNull(users.canCreateBranches),
            isNotNull(users.maxBranchesPerStore),
            isNotNull(users.sessionLimit),
          ),
        ),
      ),
    db
      .select({
        id: stores.id,
        name: stores.name,
        maxBranchesOverride: stores.maxBranchesOverride,
      })
      .from(stores)
      .where(and(inArray(stores.id, storeIds), isNotNull(stores.maxBranchesOverride)))
      .orderBy(stores.name)
      .limit(30),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        canCreateBranches: users.canCreateBranches,
        maxBranchesPerStore: users.maxBranchesPerStore,
        sessionLimit: users.sessionLimit,
      })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(
        and(
          inArray(storeMembers.storeId, storeIds),
          eq(users.systemRole, "SUPERADMIN"),
          or(
            isNotNull(users.canCreateBranches),
            isNotNull(users.maxBranchesPerStore),
            isNotNull(users.sessionLimit),
          ),
        ),
      )
      .groupBy(
        users.id,
        users.name,
        users.email,
        users.canCreateBranches,
        users.maxBranchesPerStore,
        users.sessionLimit,
      )
      .orderBy(users.name)
      .limit(50),
  ]);
  const storeOverrideCount = Number(storeOverrideCountRows[0]?.value ?? 0);
  const superadminOverrideCount = Number(superadminOverrideCountRows[0]?.value ?? 0);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Global Configuration</h1>
        <p className="text-sm text-slate-500">
          ค่ากลางระดับระบบที่ส่งผลกับร้านและผู้ใช้ทั้งหมดในขอบเขตที่คุณดูแล
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Session Default</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {globalSessionPolicy.defaultSessionLimit.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Branch Default</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {globalBranchPolicy.defaultCanCreateBranches ? "อนุญาต" : "ไม่อนุญาต"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {globalBranchPolicy.defaultMaxBranchesPerStore === null
              ? "ไม่จำกัดสาขา"
              : `สูงสุด ${globalBranchPolicy.defaultMaxBranchesPerStore.toLocaleString("th-TH")} สาขา/ร้าน`}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Store Branch Override</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {storeOverrideCount.toLocaleString("th-TH")}
          </p>
          <p className="mt-1 text-xs text-slate-500">ร้านที่ตั้งค่าเพดานสาขาเฉพาะร้าน</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Superadmin Override</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {superadminOverrideCount.toLocaleString("th-TH")}
          </p>
          <p className="mt-1 text-xs text-slate-500">บัญชีที่มีค่า override ระดับผู้ใช้</p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">System Defaults</p>
          <p className="mt-0.5 text-xs text-slate-500">ค่าเริ่มต้นที่ใช้เมื่อไม่มีการ override</p>
        </div>
        <ul className="divide-y divide-slate-100">
          <li className="px-4 py-3 text-sm text-slate-700">
            Session Limit Default:{" "}
            <span className="font-medium">
              {globalSessionPolicy.defaultSessionLimit.toLocaleString("th-TH")} เครื่องต่อผู้ใช้
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            Branch Creation Default:{" "}
            <span className="font-medium">
              {globalBranchPolicy.defaultCanCreateBranches ? "อนุญาตสร้างสาขา" : "ไม่อนุญาตสร้างสาขา"}
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            Branch Quota Default:{" "}
            <span className="font-medium">
              {globalBranchPolicy.defaultMaxBranchesPerStore === null
                ? "ไม่จำกัด"
                : `${globalBranchPolicy.defaultMaxBranchesPerStore.toLocaleString("th-TH")} สาขา/ร้าน`}
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            Store Logo Upload:{" "}
            <span className="font-medium">
              สูงสุด {globalStoreLogoPolicy.maxSizeMb.toLocaleString("th-TH")} MB • Auto resize{" "}
              {globalStoreLogoPolicy.autoResize ? "เปิด" : "ปิด"} • กว้างสุด{" "}
              {globalStoreLogoPolicy.resizeMaxWidth.toLocaleString("th-TH")} px
            </span>
          </li>
        </ul>
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Overrides ที่กำลังใช้งาน</p>
          <p className="mt-0.5 text-xs text-slate-500">
            ค่า override จะมีผลเหนือค่า default และอาจทำให้พฤติกรรมต่างร้านกัน
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Store Overrides
            </p>
            {storeOverrideRows.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">ไม่มีร้านที่ตั้ง branch override</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {storeOverrideRows.map((store) => (
                  <li key={store.id} className="text-xs text-slate-700">
                    {store.name} • max branches {store.maxBranchesOverride?.toLocaleString("th-TH")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Superadmin Overrides
            </p>
            {superadminOverrideRows.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">ไม่มีบัญชี superadmin ที่ตั้ง override</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {superadminOverrideRows.map((user) => (
                  <li key={user.userId} className="text-xs text-slate-700">
                    {user.name} • branch{" "}
                    {user.maxBranchesPerStore === null
                      ? "default"
                      : user.maxBranchesPerStore.toLocaleString("th-TH")}{" "}
                    • session {user.sessionLimit === null ? "default" : user.sessionLimit.toLocaleString("th-TH")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/quotas"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไป Quota & Billing Control</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ดูการใช้งานโควตาต่อร้าน</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/security"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                ไป Security & Compliance
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ตรวจความเสี่ยงระดับสิทธิ์และผู้ใช้</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">กลับหน้า Home ของผู้ดูแล</span>
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
                กลับหน้าเลือกร้าน / เปลี่ยนสาขา
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ออกจากโหมดผู้ดูแลกลับหน้าใช้งานรายวัน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
