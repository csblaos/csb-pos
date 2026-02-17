import Link from "next/link";
import {
  and,
  desc,
  eq,
  gte,
  like,
  lt,
  lte,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ChevronRight, ClipboardList, Settings2 } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { auditEvents, stores, users } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac/access";

type SearchParams = Record<string, string | string[] | undefined>;
type ResultFilter = "ALL" | "SUCCESS" | "FAIL";

const PAGE_SIZE = 30;

const getParam = (params: SearchParams, key: string) => {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
};

const parseResult = (value: string): ResultFilter => {
  if (value === "SUCCESS") return "SUCCESS";
  if (value === "FAIL") return "FAIL";
  return "ALL";
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

const toDayStartIso = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toDayEndIso = (value: string) => {
  const parsed = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const parseJsonText = (value: string | null) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const actionFilterOptions = [
  { value: "", label: "ทั้งหมด" },
  { value: "order.create", label: "สร้างออเดอร์" },
  { value: "order.update_shipping", label: "อัปเดตข้อมูลจัดส่ง" },
  { value: "order.submit_for_payment", label: "ส่งออเดอร์รอชำระ" },
  { value: "order.submit_payment_slip", label: "แนบสลิปชำระเงิน" },
  { value: "order.confirm_paid", label: "ยืนยันชำระเงิน" },
  { value: "order.mark_packed", label: "ยืนยันจัดของ" },
  { value: "order.mark_shipped", label: "ยืนยันจัดส่ง" },
  { value: "order.cancel", label: "ยกเลิกออเดอร์" },
  { value: "stock.movement.create", label: "บันทึกการเคลื่อนไหวสต็อก" },
  { value: "po.create", label: "สร้างใบสั่งซื้อ" },
  { value: "po.update", label: "แก้ไขใบสั่งซื้อ" },
  { value: "po.status.change", label: "เปลี่ยนสถานะใบสั่งซื้อ" },
  { value: "store.settings.update", label: "แก้ตั้งค่าร้าน" },
  { value: "store.settings.pdf.update", label: "แก้ตั้งค่าเอกสาร PDF" },
  { value: "store.payment_account.create", label: "เพิ่มบัญชีรับเงิน" },
  { value: "store.payment_account.update", label: "แก้บัญชีรับเงิน" },
  { value: "store.payment_account.delete", label: "ลบบัญชีรับเงิน" },
  { value: "store.member.create_new", label: "สร้างผู้ใช้ใหม่เข้าร้าน" },
  { value: "store.member.add_existing", label: "เพิ่มผู้ใช้เดิมเข้าร้าน" },
  { value: "store.member.assign_role", label: "เปลี่ยนบทบาทสมาชิก" },
  { value: "store.member.set_status", label: "เปลี่ยนสถานะสมาชิก" },
  { value: "store.member.set_session_limit", label: "ตั้งค่า session limit สมาชิก" },
  { value: "store.member.set_branch_access", label: "ตั้งค่าสิทธิ์สาขาสมาชิก" },
  { value: "store.member.reset_password", label: "รีเซ็ตรหัสผ่านสมาชิก" },
  { value: "store.role.permissions.update", label: "แก้สิทธิ์บทบาท" },
  { value: "account.profile.update", label: "แก้ข้อมูลโปรไฟล์ตัวเอง" },
  { value: "account.password.change", label: "เปลี่ยนรหัสผ่านตัวเอง" },
] as const;

const actionLabelMap: Record<string, string> = Object.fromEntries(
  actionFilterOptions
    .filter((option) => option.value.length > 0)
    .map((option) => [option.value, option.label]),
);

const buildHref = (basePath: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};

export default async function SettingsAuditLogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/settings/stores");
  }

  const canViewSettings = await hasPermission(
    { userId: session.userId },
    session.activeStoreId,
    "settings.view",
  );

  if (!canViewSettings) {
    redirect("/settings");
  }

  const storeId = session.activeStoreId;
  const params = (await searchParams) ?? {};

  const q = getParam(params, "q").trim();
  const action = getParam(params, "action").trim();
  const actionLike = getParam(params, "actionLike").trim();
  const result = parseResult(getParam(params, "result"));
  const fromDate = getParam(params, "from").trim();
  const toDate = getParam(params, "to").trim();
  const cursorAtRaw = getParam(params, "cursorAt").trim();
  const cursorIdRaw = getParam(params, "cursorId").trim();
  const cursorAt =
    cursorAtRaw.length > 0 && !Number.isNaN(Date.parse(cursorAtRaw)) ? cursorAtRaw : "";
  const cursorId = cursorAt && cursorIdRaw ? cursorIdRaw : "";

  const actorUsers = alias(users, "actor_users");

  const whereClauses = [eq(auditEvents.scope, "STORE"), eq(auditEvents.storeId, storeId)];

  if (result === "SUCCESS" || result === "FAIL") {
    whereClauses.push(eq(auditEvents.result, result));
  }

  if (action) {
    whereClauses.push(eq(auditEvents.action, action));
  }

  if (actionLike) {
    whereClauses.push(like(auditEvents.action, `%${actionLike}%`));
  }

  if (q) {
    const searchCondition = or(
      like(auditEvents.action, `%${q}%`),
      like(auditEvents.entityType, `%${q}%`),
      like(auditEvents.entityId, `%${q}%`),
      like(auditEvents.actorName, `%${q}%`),
      like(actorUsers.name, `%${q}%`),
    );
    if (searchCondition) {
      whereClauses.push(searchCondition);
    }
  }

  const fromIso = fromDate ? toDayStartIso(fromDate) : null;
  const toIso = toDate ? toDayEndIso(toDate) : null;

  if (fromIso) {
    whereClauses.push(gte(auditEvents.occurredAt, fromIso));
  }

  if (toIso) {
    whereClauses.push(lte(auditEvents.occurredAt, toIso));
  }

  if (cursorAt && cursorId) {
    const cursorCondition = or(
      lt(auditEvents.occurredAt, cursorAt),
      and(eq(auditEvents.occurredAt, cursorAt), lt(auditEvents.id, cursorId)),
    );
    if (cursorCondition) {
      whereClauses.push(cursorCondition);
    }
  }

  const whereCondition = and(...whereClauses);

  const [[storeRow], rowsWithExtra] = await Promise.all([
    db
      .select({ name: stores.name })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1),
    db
      .select({
        id: auditEvents.id,
        occurredAt: auditEvents.occurredAt,
        actorNameSnapshot: auditEvents.actorName,
        actorRoleSnapshot: auditEvents.actorRole,
        actorName: actorUsers.name,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        result: auditEvents.result,
        reasonCode: auditEvents.reasonCode,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .leftJoin(actorUsers, eq(auditEvents.actorUserId, actorUsers.id))
      .where(whereCondition)
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(PAGE_SIZE + 1)
      .offset(0),
  ]);

  const hasMore = rowsWithExtra.length > PAGE_SIZE;
  const rows = rowsWithExtra.slice(0, PAGE_SIZE);
  const nextCursor = hasMore ? rows[rows.length - 1] : null;

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (action) baseParams.set("action", action);
  if (actionLike) baseParams.set("actionLike", actionLike);
  if (result !== "ALL") baseParams.set("result", result);
  if (fromDate) baseParams.set("from", fromDate);
  if (toDate) baseParams.set("to", toDate);

  const nextParams = new URLSearchParams(baseParams);
  if (nextCursor) {
    nextParams.set("cursorAt", nextCursor.occurredAt);
    nextParams.set("cursorId", nextCursor.id);
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">
          ตรวจสอบกิจกรรมในร้าน {storeRow?.name ?? "-"} (แสดงเฉพาะร้านที่กำลังใช้งาน)
        </p>
      </header>

      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" method="GET">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-slate-600">
            ค้นหา
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="action / entity / ผู้ทำ"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none ring-primary focus:ring-2"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            Action
            <select
              name="action"
              defaultValue={action}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-primary focus:ring-2"
            >
              {actionFilterOptions.map((option) => (
                <option key={option.value || "__all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            Action (ค้นหาเพิ่ม)
            <input
              type="text"
              name="actionLike"
              defaultValue={actionLike}
              placeholder="เช่น store.member"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none ring-primary focus:ring-2"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            ผลลัพธ์
            <select
              name="result"
              defaultValue={result}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-primary focus:ring-2"
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="SUCCESS">Success</option>
              <option value="FAIL">Fail</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            จากวันที่
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none ring-primary focus:ring-2"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            ถึงวันที่
            <input
              type="date"
              name="to"
              defaultValue={toDate}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none ring-primary focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-white"
          >
            ค้นหา
          </button>
          <Link
            href="/settings/audit-log"
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600"
          >
            ล้างตัวกรอง
          </Link>
          <p className="ml-auto text-xs text-slate-500">
            แสดง {rows.length.toLocaleString("th-TH")} รายการต่อหน้า
          </p>
        </div>
      </form>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">กิจกรรมล่าสุด</p>
          <p className="mt-0.5 text-xs text-slate-500">เรียงจากล่าสุดลงเก่าสุด</p>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">ยังไม่พบกิจกรรมตามตัวกรองที่เลือก</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const metadata = parseJsonText(row.metadata);
              const actorName = row.actorNameSnapshot ?? row.actorName ?? "ระบบ";
              const title = actionLabelMap[row.action] ?? row.action;
              const detailBits = [
                `${row.entityType}${row.entityId ? `#${row.entityId}` : ""}`,
                row.reasonCode ? `เหตุผล ${row.reasonCode}` : "",
              ].filter(Boolean);

              const metadataText = metadata
                ? Object.entries(metadata)
                    .slice(0, 4)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(" • ")
                : null;

              return (
                <li key={row.id} className="px-4 py-3">
                  <p className="text-xs text-slate-500">{formatDateTime(row.occurredAt)}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    โดย {actorName}
                    {row.actorRoleSnapshot ? ` (${row.actorRoleSnapshot})` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {detailBits.join(" • ")} • ผลลัพธ์ {row.result}
                  </p>
                  {metadataText ? <p className="mt-1 text-xs text-slate-500">{metadataText}</p> : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          {cursorAt ? (
            <Link
              href={buildHref("/settings/audit-log", baseParams)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600"
            >
              กลับล่าสุด
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-slate-300">
              อยู่หน้าล่าสุด
            </span>
          )}

          {hasMore && nextCursor ? (
            <Link
              href={buildHref("/settings/audit-log", nextParams)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600"
            >
              โหลดถัดไป
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-slate-300">
              ไม่มีรายการเพิ่ม
            </span>
          )}
        </div>
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับหน้าตั้งค่า</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ดูเมนูตั้งค่าทั้งหมด</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                เปลี่ยนร้าน / เปลี่ยนสาขา
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                สลับ context ร้านก่อนดู Audit Log
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
