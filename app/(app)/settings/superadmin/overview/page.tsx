import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { BarChart3, ChevronRight, PlugZap, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { db } from "@/lib/db/client";
import { fbConnections, orders, storeBranches, storeMembers, waConnections } from "@/lib/db/schema";

const paidStatuses: Array<"PAID" | "PACKED" | "SHIPPED"> = ["PAID", "PACKED", "SHIPPED"];

const toNumber = (value: unknown) => Number(value ?? 0);

export default async function SettingsSuperadminOverviewPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const storeIds = memberships.map((membership) => membership.storeId);

  const [branchRows, memberRows, todaySalesRows, todayOrdersRows, fbRows, waRows] = await Promise.all([
    db
      .select({ storeId: storeBranches.storeId, count: sql<number>`count(*)` })
      .from(storeBranches)
      .where(inArray(storeBranches.storeId, storeIds))
      .groupBy(storeBranches.storeId),
    db
      .select({
        storeId: storeMembers.storeId,
        status: storeMembers.status,
        count: sql<number>`count(*)`,
      })
      .from(storeMembers)
      .where(inArray(storeMembers.storeId, storeIds))
      .groupBy(storeMembers.storeId, storeMembers.status),
    db
      .select({ value: sql<number>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          inArray(orders.storeId, storeIds),
          inArray(orders.status, paidStatuses),
          sql`${orders.paidAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
          sql`${orders.paidAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
        ),
      ),
    db
      .select({ value: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          inArray(orders.storeId, storeIds),
          sql`${orders.createdAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
          sql`${orders.createdAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
        ),
      ),
    db
      .select({ storeId: fbConnections.storeId })
      .from(fbConnections)
      .where(
        and(inArray(fbConnections.storeId, storeIds), eq(fbConnections.status, "CONNECTED")),
      ),
    db
      .select({ storeId: waConnections.storeId })
      .from(waConnections)
      .where(
        and(inArray(waConnections.storeId, storeIds), eq(waConnections.status, "CONNECTED")),
      ),
  ]);

  const branchCountByStore = new Map(branchRows.map((row) => [row.storeId, toNumber(row.count)]));
  const activeMembersByStore = new Map<string, number>();

  for (const row of memberRows) {
    if (row.status !== "ACTIVE") {
      continue;
    }
    activeMembersByStore.set(row.storeId, toNumber(row.count));
  }

  const totalStores = memberships.length;
  const totalBranches = memberships.reduce(
    (sum, membership) => sum + (branchCountByStore.get(membership.storeId) ?? 0),
    0,
  );
  const totalActiveMembers = memberships.reduce(
    (sum, membership) => sum + (activeMembersByStore.get(membership.storeId) ?? 0),
    0,
  );
  const todaySales = toNumber(todaySalesRows[0]?.value);
  const todayOrders = toNumber(todayOrdersRows[0]?.value);
  const connectedFbStoreCount = new Set(fbRows.map((row) => row.storeId)).size;
  const connectedWaStoreCount = new Set(waRows.map((row) => row.storeId)).size;

  const topStoresByMembers = [...memberships]
    .map((membership) => ({
      ...membership,
      activeMembers: activeMembersByStore.get(membership.storeId) ?? 0,
      branchCount: branchCountByStore.get(membership.storeId) ?? 0,
    }))
    .sort((a, b) => b.activeMembers - a.activeMembers)
    .slice(0, 5);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">ภาพรวมข้ามร้าน</h1>
        <p className="text-sm text-slate-500">สรุปสถานะหลักของร้านทั้งหมดที่คุณดูแลในหน้าเดียว</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalStores.toLocaleString("th-TH")}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">สาขาทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalBranches.toLocaleString("th-TH")}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">สมาชิก ACTIVE</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalActiveMembers.toLocaleString("th-TH")}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ออเดอร์วันนี้</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{todayOrders.toLocaleString("th-TH")}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ยอดขายวันนี้ (รวม)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{todaySales.toLocaleString("th-TH")}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านที่เชื่อมต่อ FB / WA</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {connectedFbStoreCount.toLocaleString("th-TH")} / {connectedWaStoreCount.toLocaleString("th-TH")}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Top ร้านตามจำนวนสมาชิก ACTIVE</p>
          <p className="mt-0.5 text-xs text-slate-500">ใช้ดูร้านที่มีการใช้งานทีมสูงสุดก่อน</p>
        </div>
        {topStoresByMembers.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">ยังไม่มีข้อมูลร้าน</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {topStoresByMembers.map((store) => (
              <li key={store.storeId} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Store className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{store.storeName}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    สมาชิก ACTIVE {store.activeMembers.toLocaleString("th-TH")} คน • สาขา {store.branchCount.toLocaleString("th-TH")} แห่ง
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">ไปหน้าที่เกี่ยวข้อง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/integrations"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <PlugZap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ดูการเชื่อมต่อช่องทาง</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">เช็กสถานะ FB/WA ของทุกร้าน</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">เลือกเมนูจัดการอื่น ๆ</span>
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
