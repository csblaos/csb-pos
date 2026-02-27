"use client";

import { Bell, Clock3, RefreshCw, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type NotificationFilter = "ACTIVE" | "UNREAD" | "RESOLVED" | "ALL";

type NotificationRule = {
  mutedForever: boolean;
  mutedUntil: string | null;
  snoozedUntil: string | null;
  isSuppressedNow: boolean;
};

type NotificationItem = {
  id: string;
  topic: "PURCHASE_AP_DUE";
  entityType: "PURCHASE_ORDER";
  entityId: string;
  dedupeKey: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "UNREAD" | "READ" | "RESOLVED";
  dueStatus: "OVERDUE" | "DUE_SOON" | null;
  dueDate: string | null;
  payload: Record<string, unknown>;
  firstDetectedAt: string;
  lastDetectedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  rule: NotificationRule | null;
};

type NotificationSummary = {
  unreadCount: number;
  activeCount: number;
  resolvedCount: number;
};

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: "ACTIVE", label: "กำลังแจ้งเตือน" },
  { id: "UNREAD", label: "ยังไม่อ่าน" },
  { id: "RESOLVED", label: "ปิดแล้ว" },
  { id: "ALL", label: "ทั้งหมด" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function plusDaysIso(days: number): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export function NotificationsInboxPanel({
  canManageRules,
}: {
  canManageRules: boolean;
}) {
  const [filter, setFilter] = useState<NotificationFilter>("ACTIVE");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({
    unreadCount: 0,
    activeCount: 0,
    resolvedCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/settings/notifications/inbox?filter=${encodeURIComponent(filter)}&limit=80`,
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            items?: NotificationItem[];
            summary?: NotificationSummary;
          }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? "โหลดรายการแจ้งเตือนไม่สำเร็จ");
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(
        data.summary ?? {
          unreadCount: 0,
          activeCount: 0,
          resolvedCount: 0,
        },
      );
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const runInboxAction = useCallback(
    async (
      body:
        | { action: "mark_read"; notificationId: string }
        | { action: "mark_unread"; notificationId: string }
        | { action: "resolve"; notificationId: string }
        | { action: "mark_all_read" },
      successText: string,
    ) => {
      setActingId("notificationId" in body ? body.notificationId : "__all__");
      try {
        const res = await authFetch("/api/settings/notifications/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; message?: string; summary?: NotificationSummary }
          | null;
        if (!res.ok || !data?.ok) {
          toast.error(data?.message ?? "อัปเดตสถานะแจ้งเตือนไม่สำเร็จ");
          return;
        }
        toast.success(successText);
        if (data.summary) {
          setSummary(data.summary);
        }
        await loadInbox();
      } catch {
        toast.error("เชื่อมต่อไม่สำเร็จ");
      } finally {
        setActingId(null);
      }
    },
    [loadInbox],
  );

  const runRuleAction = useCallback(
    async (
      notificationId: string,
      payload: {
        topic: "PURCHASE_AP_DUE";
        entityType: "PURCHASE_ORDER";
        entityId: string;
        mode: "SNOOZE" | "MUTE" | "CLEAR";
        until?: string;
        forever?: boolean;
      },
      successText: string,
    ) => {
      setActingId(notificationId);
      try {
        const res = await authFetch("/api/settings/notifications/rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; message?: string }
          | null;
        if (!res.ok || !data?.ok) {
          toast.error(data?.message ?? "อัปเดตกฎ mute/snooze ไม่สำเร็จ");
          return;
        }
        toast.success(successText);
        await loadInbox();
      } catch {
        toast.error("เชื่อมต่อไม่สำเร็จ");
      } finally {
        setActingId(null);
      }
    },
    [loadInbox],
  );

  const hasUnread = summary.unreadCount > 0;
  const currentFilterLabel = useMemo(
    () => FILTERS.find((option) => option.id === filter)?.label ?? "-",
    [filter],
  );

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">ยังไม่อ่าน</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {summary.unreadCount.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">กำลังแจ้งเตือน</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {summary.activeCount.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">ปิดแล้ว</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {summary.resolvedCount.toLocaleString("th-TH")}
          </p>
        </article>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-600">
            มุมมองปัจจุบัน: {currentFilterLabel}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  filter === option.id
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setFilter(option.id)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={() => {
              void loadInbox();
            }}
            disabled={loading}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            รีเฟรช
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={() => {
              void runInboxAction({ action: "mark_all_read" }, "ทำเครื่องหมายอ่านทั้งหมดแล้ว");
            }}
            disabled={loading || !hasUnread || actingId === "__all__"}
          >
            อ่านทั้งหมดแล้ว
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
          กำลังโหลด inbox...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-600">ยังไม่มีรายการแจ้งเตือนในมุมมองนี้</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const poNumber =
              typeof item.payload.poNumber === "string" ? item.payload.poNumber : null;
            const supplierName =
              typeof item.payload.supplierName === "string"
                ? item.payload.supplierName
                : null;
            const rowBusy = actingId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{item.message}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {poNumber ? `PO ${poNumber}` : "-"}
                      {supplierName ? ` · ${supplierName}` : ""}
                      {item.dueDate ? ` · due ${formatDateTime(item.dueDate)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        item.status === "UNREAD"
                          ? "bg-blue-100 text-blue-700"
                          : item.status === "RESOLVED"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {item.status === "UNREAD"
                        ? "ยังไม่อ่าน"
                        : item.status === "RESOLVED"
                          ? "ปิดแล้ว"
                          : "อ่านแล้ว"}
                    </span>
                    {item.dueStatus ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          item.dueStatus === "OVERDUE"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.dueStatus === "OVERDUE" ? "เกินกำหนด" : "ใกล้ครบกำหนด"}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    ตรวจล่าสุด {formatDateTime(item.lastDetectedAt)}
                  </span>
                  {item.rule?.isSuppressedNow ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      <VolumeX className="h-3 w-3" />
                      mute/snooze อยู่
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {item.status === "UNREAD" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        void runInboxAction(
                          { action: "mark_read", notificationId: item.id },
                          "ทำเครื่องหมายอ่านแล้ว",
                        );
                      }}
                      disabled={rowBusy}
                    >
                      อ่านแล้ว
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        void runInboxAction(
                          { action: "mark_unread", notificationId: item.id },
                          "ทำเครื่องหมายยังไม่อ่านแล้ว",
                        );
                      }}
                      disabled={rowBusy}
                    >
                      ทำเป็นยังไม่อ่าน
                    </Button>
                  )}
                  {item.status !== "RESOLVED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        void runInboxAction(
                          { action: "resolve", notificationId: item.id },
                          "ปิดแจ้งเตือนแล้ว",
                        );
                      }}
                      disabled={rowBusy}
                    >
                      ปิดรายการนี้
                    </Button>
                  ) : null}
                </div>

                {canManageRules && item.topic === "PURCHASE_AP_DUE" ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="mb-1 text-[11px] font-medium text-slate-700">
                      Mute / Snooze สำหรับ PO นี้
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          void runRuleAction(
                            item.id,
                            {
                              topic: item.topic,
                              entityType: item.entityType,
                              entityId: item.entityId,
                              mode: "SNOOZE",
                              until: plusDaysIso(1),
                            },
                            "เลื่อนเตือน 1 วันแล้ว",
                          );
                        }}
                        disabled={rowBusy}
                      >
                        Snooze 1 วัน
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          void runRuleAction(
                            item.id,
                            {
                              topic: item.topic,
                              entityType: item.entityType,
                              entityId: item.entityId,
                              mode: "SNOOZE",
                              until: plusDaysIso(3),
                            },
                            "เลื่อนเตือน 3 วันแล้ว",
                          );
                        }}
                        disabled={rowBusy}
                      >
                        Snooze 3 วัน
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          void runRuleAction(
                            item.id,
                            {
                              topic: item.topic,
                              entityType: item.entityType,
                              entityId: item.entityId,
                              mode: "MUTE",
                              until: plusDaysIso(7),
                            },
                            "Mute 7 วันแล้ว",
                          );
                        }}
                        disabled={rowBusy}
                      >
                        Mute 7 วัน
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          void runRuleAction(
                            item.id,
                            {
                              topic: item.topic,
                              entityType: item.entityType,
                              entityId: item.entityId,
                              mode: "MUTE",
                              forever: true,
                            },
                            "Mute ถาวรแล้ว",
                          );
                        }}
                        disabled={rowBusy}
                      >
                        Mute ถาวร
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          void runRuleAction(
                            item.id,
                            {
                              topic: item.topic,
                              entityType: item.entityType,
                              entityId: item.entityId,
                              mode: "CLEAR",
                            },
                            "ยกเลิก mute/snooze แล้ว",
                          );
                        }}
                        disabled={rowBusy}
                      >
                        ยกเลิกกฎ
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
