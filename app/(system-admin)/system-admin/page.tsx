import Link from "next/link";
import { Suspense } from "react";

import {
  getSystemAdminDashboardStats,
  type SystemAdminDashboardStats,
} from "@/lib/system-admin/dashboard";
import { listSuperadmins, type SuperadminItem } from "@/lib/system-admin/superadmins";

function DashboardStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        "Total Client",
        "Total Store",
        "Total User",
        "สมาชิก ACTIVE",
      ].map((label) => (
        <div key={label} className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

async function DashboardStatsCards({
  statsPromise,
}: {
  statsPromise: Promise<SystemAdminDashboardStats>;
}) {
  const stats = await statsPromise;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">Total Client</p>
        <p className="mt-1 text-2xl font-semibold">{stats.totalClients.toLocaleString("th-TH")}</p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">Total Store</p>
        <p className="mt-1 text-2xl font-semibold">{stats.totalStores.toLocaleString("th-TH")}</p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">Total User</p>
        <p className="mt-1 text-2xl font-semibold">{stats.totalUsers.toLocaleString("th-TH")}</p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">สมาชิก ACTIVE</p>
        <p className="mt-1 text-2xl font-semibold">
          {stats.totalActiveMembers.toLocaleString("th-TH")}
        </p>
      </div>
    </div>
  );
}

function TopClientsSkeleton() {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-lg border p-3">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-52 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

async function TopClientsList({
  superadminsPromise,
}: {
  superadminsPromise: Promise<SuperadminItem[]>;
}) {
  const superadmins = await superadminsPromise;
  const topClients = [...superadmins]
    .sort((a, b) => b.activeOwnerStoreCount - a.activeOwnerStoreCount)
    .slice(0, 5);

  if (topClients.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีข้อมูลลูกค้า</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {topClients.map((item) => (
        <li key={item.userId} className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ร้านที่เป็น Owner: {item.activeOwnerStoreCount.toLocaleString("th-TH")} ร้าน
          </p>
        </li>
      ))}
    </ul>
  );
}

function StorePermissionSummarySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-5 w-full animate-pulse rounded bg-slate-200" />
      ))}
    </div>
  );
}

async function StorePermissionSummary({
  statsPromise,
}: {
  statsPromise: Promise<SystemAdminDashboardStats>;
}) {
  const stats = await statsPromise;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Client ที่เปิดสิทธิ์สร้างร้าน: {stats.totalClientsCanCreateStores.toLocaleString("th-TH")}
      </p>
      <p className="text-sm text-muted-foreground">
        Client แบบไม่จำกัดจำนวนร้าน: {stats.totalUnlimitedClients.toLocaleString("th-TH")}
      </p>
      <p className="text-sm text-muted-foreground">
        สมาชิกที่ถูกระงับ: {stats.totalSuspendedMembers.toLocaleString("th-TH")}
      </p>
    </div>
  );
}

export default function SystemAdminDashboardPage() {
  const statsPromise = getSystemAdminDashboardStats();
  const superadminsPromise = listSuperadmins();

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">System Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          ภาพรวมลูกค้าที่สมัครใช้ POS และสถานะการใช้งานระบบ
        </p>
      </header>

      <Suspense fallback={<DashboardStatsCardsSkeleton />}>
        <DashboardStatsCards statsPromise={statsPromise} />
      </Suspense>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <article className="rounded-xl border bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Top Client ตามจำนวนร้าน</h2>
            <Link
              href="/system-admin/config/clients"
              prefetch
              className="text-sm text-blue-700 hover:underline"
            >
              จัดการลูกค้า
            </Link>
          </div>

          <Suspense fallback={<TopClientsSkeleton />}>
            <TopClientsList superadminsPromise={superadminsPromise} />
          </Suspense>
        </article>

        <article className="space-y-2 rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">ภาพรวมสิทธิ์สร้างร้าน</h2>
          <Suspense fallback={<StorePermissionSummarySkeleton />}>
            <StorePermissionSummary statsPromise={statsPromise} />
          </Suspense>
          <Link
            href="/system-admin/config"
            prefetch
            className="inline-block text-sm text-blue-700 hover:underline"
          >
            ไปหน้าตั้งค่าระบบ
          </Link>
        </article>
      </div>
    </section>
  );
}
