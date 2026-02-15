import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ChevronRight, ClipboardList, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { db } from "@/lib/db/client";
import { orders, storeBranches, storeMembers, stores, users } from "@/lib/db/schema";

type ActivityItem = {
  id: string;
  at: string;
  storeName: string;
  title: string;
  detail: string;
};

const toTimestamp = (value: string) => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const formatDateTime = (value: string) => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default async function SettingsSuperadminAuditLogPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const storeIds = memberships.map((membership) => membership.storeId);

  const memberUsers = alias(users, "member_users");
  const actorUsers = alias(users, "actor_users");
  const orderCreators = alias(users, "order_creators");

  const [recentStores, recentBranches, recentMembers, recentOrders] = await Promise.all([
    db
      .select({
        id: stores.id,
        storeName: stores.name,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .where(inArray(stores.id, storeIds))
      .orderBy(desc(stores.createdAt))
      .limit(20),
    db
      .select({
        id: storeBranches.id,
        branchName: storeBranches.name,
        storeName: stores.name,
        createdAt: storeBranches.createdAt,
      })
      .from(storeBranches)
      .innerJoin(stores, eq(storeBranches.storeId, stores.id))
      .where(inArray(storeBranches.storeId, storeIds))
      .orderBy(desc(storeBranches.createdAt))
      .limit(30),
    db
      .select({
        id: storeMembers.userId,
        storeName: stores.name,
        memberName: memberUsers.name,
        status: storeMembers.status,
        actorName: actorUsers.name,
        createdAt: storeMembers.createdAt,
      })
      .from(storeMembers)
      .innerJoin(stores, eq(storeMembers.storeId, stores.id))
      .innerJoin(memberUsers, eq(storeMembers.userId, memberUsers.id))
      .leftJoin(actorUsers, eq(storeMembers.addedBy, actorUsers.id))
      .where(inArray(storeMembers.storeId, storeIds))
      .orderBy(desc(storeMembers.createdAt))
      .limit(30),
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        storeName: stores.name,
        createdByName: orderCreators.name,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .leftJoin(orderCreators, eq(orders.createdBy, orderCreators.id))
      .where(inArray(orders.storeId, storeIds))
      .orderBy(desc(orders.createdAt))
      .limit(30),
  ]);

  const activities: ActivityItem[] = [
    ...recentStores.map((row) => ({
      id: `store-${row.id}`,
      at: row.createdAt,
      storeName: row.storeName,
      title: "สร้างร้านใหม่",
      detail: `เพิ่มร้าน ${row.storeName}`,
    })),
    ...recentBranches.map((row) => ({
      id: `branch-${row.id}`,
      at: row.createdAt,
      storeName: row.storeName,
      title: "สร้างสาขาใหม่",
      detail: `เพิ่มสาขา ${row.branchName}`,
    })),
    ...recentMembers.map((row) => ({
      id: `member-${row.id}-${row.createdAt}`,
      at: row.createdAt,
      storeName: row.storeName,
      title: "เพิ่ม/อัปเดตสมาชิก",
      detail: `${row.memberName} (${row.status}) โดย ${row.actorName ?? "ระบบ"}`,
    })),
    ...recentOrders.map((row) => ({
      id: `order-${row.id}`,
      at: row.createdAt,
      storeName: row.storeName,
      title: "สร้างออเดอร์",
      detail: `ออเดอร์ ${row.orderNo} • สถานะ ${row.status} • ผู้สร้าง ${row.createdByName ?? "-"}`,
    })),
  ]
    .sort((a, b) => toTimestamp(b.at) - toTimestamp(a.at))
    .slice(0, 60);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">
          ไทม์ไลน์กิจกรรมล่าสุดจากข้อมูลสำคัญของร้านทั้งหมดที่คุณดูแล
        </p>
      </header>

      <article className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        มุมมองนี้สรุปจากเหตุการณ์ในตารางหลัก (ร้าน, สาขา, สมาชิก, ออเดอร์) เพื่อใช้ตรวจสอบภาพรวมได้เร็ว
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">กิจกรรมล่าสุด</p>
          <p className="mt-0.5 text-xs text-slate-500">เรียงจากใหม่ไปเก่า</p>
        </div>

        {activities.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">ยังไม่พบกิจกรรมในร้านที่ดูแล</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <li key={activity.id} className="px-4 py-3">
                <p className="text-xs text-slate-500">{formatDateTime(activity.at)}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{activity.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">{activity.storeName}</p>
                <p className="mt-1 text-xs text-slate-500">{activity.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">เลือกเมนูจัดการอื่น ๆ</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/quotas"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ดูโควตาและนโยบาย</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ตรวจสิทธิ์และขีดจำกัดรายร้าน</span>
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
