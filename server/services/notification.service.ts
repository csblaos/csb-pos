import "server-only";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  notificationInbox,
  notificationEntityTypeEnum,
  notificationRules,
  notificationStatusEnum,
  notificationTopicEnum,
  stores,
} from "@/lib/db/schema";
import {
  getPurchaseApDueReminders,
  type PurchaseApReminderItem,
} from "@/server/services/purchase-ap.service";

type NotificationTopic = (typeof notificationTopicEnum)[number];
type NotificationEntityType = (typeof notificationEntityTypeEnum)[number];
type NotificationStatus = (typeof notificationStatusEnum)[number];

const AP_REMINDER_TOPIC: NotificationTopic = "PURCHASE_AP_DUE";
const AP_REMINDER_ENTITY_TYPE: NotificationEntityType = "PURCHASE_ORDER";

const MAX_INBOX_LIMIT = 200;
const MAX_CRON_LIMIT_PER_STORE = 500;

export type NotificationFilter = "ACTIVE" | "UNREAD" | "RESOLVED" | "ALL";

export type NotificationInboxSummary = {
  unreadCount: number;
  activeCount: number;
  resolvedCount: number;
};

export type NotificationRuleView = {
  mutedForever: boolean;
  mutedUntil: string | null;
  snoozedUntil: string | null;
  isSuppressedNow: boolean;
};

export type NotificationInboxItemView = {
  id: string;
  topic: NotificationTopic;
  entityType: NotificationEntityType;
  entityId: string;
  dedupeKey: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: NotificationStatus;
  dueStatus: "OVERDUE" | "DUE_SOON" | null;
  dueDate: string | null;
  payload: Record<string, unknown>;
  firstDetectedAt: string;
  lastDetectedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  rule: NotificationRuleView | null;
};

export type NotificationInboxResult = {
  items: NotificationInboxItemView[];
  summary: NotificationInboxSummary;
};

export class NotificationServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type StoredRule = {
  id: string;
  entityId: string;
  mutedForever: boolean;
  mutedUntil: string | null;
  snoozedUntil: string | null;
};

function clampInboxLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_INBOX_LIMIT, Math.max(1, Math.floor(value ?? fallback)));
}

function clampCronLimitPerStore(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_CRON_LIMIT_PER_STORE, Math.max(10, Math.floor(value ?? fallback)));
}

function safeParsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function normalizeIsoDate(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new NotificationServiceError(400, "รูปแบบวันที่ไม่ถูกต้อง");
  }
  return parsed.toISOString();
}

function buildApReminderDedupeKey(item: PurchaseApReminderItem): string {
  const dueDateKey = item.dueDate ? item.dueDate.slice(0, 10) : "NO_DUE_DATE";
  return `ap_due:${item.poId}:${item.dueStatus}:${dueDateKey}`;
}

function buildApReminderTitle(item: PurchaseApReminderItem): string {
  if (item.dueStatus === "OVERDUE") {
    return `PO เกินกำหนดชำระ ${item.poNumber}`;
  }
  return `PO ใกล้ครบกำหนด ${item.poNumber}`;
}

function buildApReminderMessage(item: PurchaseApReminderItem): string {
  if (item.dueStatus === "OVERDUE") {
    return `${item.supplierName} · เกินกำหนด ${Math.abs(item.daysUntilDue)} วัน · ค้าง ${item.outstandingBase.toLocaleString("th-TH")}`;
  }
  return `${item.supplierName} · ครบกำหนดใน ${item.daysUntilDue} วัน · ค้าง ${item.outstandingBase.toLocaleString("th-TH")}`;
}

function buildApReminderPayload(item: PurchaseApReminderItem): string {
  return JSON.stringify({
    poId: item.poId,
    poNumber: item.poNumber,
    supplierName: item.supplierName,
    paymentStatus: item.paymentStatus,
    dueDate: item.dueDate,
    dueStatus: item.dueStatus,
    daysUntilDue: item.daysUntilDue,
    outstandingBase: item.outstandingBase,
  });
}

function isRuleSuppressedNow(rule: StoredRule | undefined, now: Date): boolean {
  if (!rule) return false;
  if (rule.mutedForever) return true;
  if (rule.mutedUntil) {
    const mutedUntil = new Date(rule.mutedUntil);
    if (Number.isFinite(mutedUntil.getTime()) && mutedUntil.getTime() > now.getTime()) {
      return true;
    }
  }
  if (rule.snoozedUntil) {
    const snoozedUntil = new Date(rule.snoozedUntil);
    if (Number.isFinite(snoozedUntil.getTime()) && snoozedUntil.getTime() > now.getTime()) {
      return true;
    }
  }
  return false;
}

async function getInboxSummary(storeId: string): Promise<NotificationInboxSummary> {
  const [unreadRows, activeRows, resolvedRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(notificationInbox)
      .where(and(eq(notificationInbox.storeId, storeId), eq(notificationInbox.status, "UNREAD")))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notificationInbox)
      .where(and(eq(notificationInbox.storeId, storeId), ne(notificationInbox.status, "RESOLVED")))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notificationInbox)
      .where(and(eq(notificationInbox.storeId, storeId), eq(notificationInbox.status, "RESOLVED")))
      .limit(1),
  ]);

  return {
    unreadCount: Number(unreadRows[0]?.count ?? 0),
    activeCount: Number(activeRows[0]?.count ?? 0),
    resolvedCount: Number(resolvedRows[0]?.count ?? 0),
  };
}

export async function getNotificationInbox(params: {
  storeId: string;
  filter?: NotificationFilter;
  limit?: number;
}): Promise<NotificationInboxResult> {
  const filter = params.filter ?? "ACTIVE";
  const limit = clampInboxLimit(params.limit, 50);
  const filters = [eq(notificationInbox.storeId, params.storeId)];

  if (filter === "ACTIVE") {
    filters.push(ne(notificationInbox.status, "RESOLVED"));
  } else if (filter === "UNREAD") {
    filters.push(eq(notificationInbox.status, "UNREAD"));
  } else if (filter === "RESOLVED") {
    filters.push(eq(notificationInbox.status, "RESOLVED"));
  }

  const rows = await db
    .select({
      id: notificationInbox.id,
      topic: notificationInbox.topic,
      entityType: notificationInbox.entityType,
      entityId: notificationInbox.entityId,
      dedupeKey: notificationInbox.dedupeKey,
      title: notificationInbox.title,
      message: notificationInbox.message,
      severity: notificationInbox.severity,
      status: notificationInbox.status,
      dueStatus: notificationInbox.dueStatus,
      dueDate: notificationInbox.dueDate,
      payload: notificationInbox.payload,
      firstDetectedAt: notificationInbox.firstDetectedAt,
      lastDetectedAt: notificationInbox.lastDetectedAt,
      readAt: notificationInbox.readAt,
      resolvedAt: notificationInbox.resolvedAt,
    })
    .from(notificationInbox)
    .where(and(...filters))
    .orderBy(desc(notificationInbox.lastDetectedAt))
    .limit(limit);

  const apEntityIds = Array.from(
    new Set(
      rows
        .filter(
          (row) =>
            row.topic === AP_REMINDER_TOPIC &&
            row.entityType === AP_REMINDER_ENTITY_TYPE,
        )
        .map((row) => row.entityId),
    ),
  );

  const ruleMap = new Map<string, StoredRule>();
  if (apEntityIds.length > 0) {
    const ruleRows = await db
      .select({
        id: notificationRules.id,
        entityId: notificationRules.entityId,
        mutedForever: notificationRules.mutedForever,
        mutedUntil: notificationRules.mutedUntil,
        snoozedUntil: notificationRules.snoozedUntil,
      })
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.storeId, params.storeId),
          eq(notificationRules.topic, AP_REMINDER_TOPIC),
          eq(notificationRules.entityType, AP_REMINDER_ENTITY_TYPE),
          inArray(notificationRules.entityId, apEntityIds),
        ),
      );
    for (const rule of ruleRows) {
      ruleMap.set(rule.entityId, rule);
    }
  }

  const now = new Date();
  const items: NotificationInboxItemView[] = rows.map((row) => {
    const rule =
      row.topic === AP_REMINDER_TOPIC && row.entityType === AP_REMINDER_ENTITY_TYPE
        ? ruleMap.get(row.entityId)
        : undefined;
    return {
      id: row.id,
      topic: row.topic as NotificationTopic,
      entityType: row.entityType as NotificationEntityType,
      entityId: row.entityId,
      dedupeKey: row.dedupeKey,
      title: row.title,
      message: row.message,
      severity: row.severity as "INFO" | "WARNING" | "CRITICAL",
      status: row.status as NotificationStatus,
      dueStatus: row.dueStatus as "OVERDUE" | "DUE_SOON" | null,
      dueDate: row.dueDate,
      payload: safeParsePayload(row.payload),
      firstDetectedAt: row.firstDetectedAt,
      lastDetectedAt: row.lastDetectedAt,
      readAt: row.readAt,
      resolvedAt: row.resolvedAt,
      rule: rule
        ? {
            mutedForever: Boolean(rule.mutedForever),
            mutedUntil: rule.mutedUntil,
            snoozedUntil: rule.snoozedUntil,
            isSuppressedNow: isRuleSuppressedNow(rule, now),
          }
        : null,
    };
  });

  const summary = await getInboxSummary(params.storeId);
  return { items, summary };
}

export async function markNotificationAction(params: {
  storeId: string;
  action: "mark_read" | "mark_unread" | "resolve" | "mark_all_read";
  notificationId?: string;
}) {
  const now = new Date().toISOString();

  if (params.action === "mark_all_read") {
    await db
      .update(notificationInbox)
      .set({
        status: "READ",
        readAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationInbox.storeId, params.storeId),
          eq(notificationInbox.status, "UNREAD"),
        ),
      );
    return getInboxSummary(params.storeId);
  }

  if (!params.notificationId) {
    throw new NotificationServiceError(400, "ไม่พบรหัสแจ้งเตือน");
  }

  if (params.action === "mark_read") {
    await db
      .update(notificationInbox)
      .set({
        status: "READ",
        readAt: now,
        resolvedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationInbox.id, params.notificationId),
          eq(notificationInbox.storeId, params.storeId),
        ),
      );
  } else if (params.action === "mark_unread") {
    await db
      .update(notificationInbox)
      .set({
        status: "UNREAD",
        readAt: null,
        resolvedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationInbox.id, params.notificationId),
          eq(notificationInbox.storeId, params.storeId),
        ),
      );
  } else {
    await db
      .update(notificationInbox)
      .set({
        status: "RESOLVED",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationInbox.id, params.notificationId),
          eq(notificationInbox.storeId, params.storeId),
        ),
      );
  }

  return getInboxSummary(params.storeId);
}

export async function updateNotificationRule(params: {
  storeId: string;
  userId: string;
  topic: NotificationTopic;
  entityType: NotificationEntityType;
  entityId: string;
  mode: "SNOOZE" | "MUTE" | "CLEAR";
  until?: string | null;
  forever?: boolean;
  note?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const now = new Date();

  if (params.mode === "CLEAR") {
    await db
      .delete(notificationRules)
      .where(
        and(
          eq(notificationRules.storeId, params.storeId),
          eq(notificationRules.topic, params.topic),
          eq(notificationRules.entityType, params.entityType),
          eq(notificationRules.entityId, params.entityId),
        ),
      );
    return { rule: null };
  }

  let mutedForever = false;
  let mutedUntil: string | null = null;
  let snoozedUntil: string | null = null;

  if (params.mode === "SNOOZE") {
    if (!params.until?.trim()) {
      throw new NotificationServiceError(400, "กรุณาระบุวันที่สิ้นสุดการ snooze");
    }
    snoozedUntil = normalizeIsoDate(params.until);
    if (new Date(snoozedUntil).getTime() <= now.getTime()) {
      throw new NotificationServiceError(400, "วันที่สิ้นสุดการ snooze ต้องอยู่ในอนาคต");
    }
  } else if (params.forever) {
    mutedForever = true;
  } else {
    if (!params.until?.trim()) {
      throw new NotificationServiceError(400, "กรุณาระบุวันที่สิ้นสุดการ mute");
    }
    mutedUntil = normalizeIsoDate(params.until);
    if (new Date(mutedUntil).getTime() <= now.getTime()) {
      throw new NotificationServiceError(400, "วันที่สิ้นสุดการ mute ต้องอยู่ในอนาคต");
    }
  }

  await db
    .insert(notificationRules)
    .values({
      storeId: params.storeId,
      topic: params.topic,
      entityType: params.entityType,
      entityId: params.entityId,
      mutedForever,
      mutedUntil,
      snoozedUntil,
      note: params.note?.trim() || null,
      updatedBy: params.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: [
        notificationRules.storeId,
        notificationRules.topic,
        notificationRules.entityType,
        notificationRules.entityId,
      ],
      set: {
        mutedForever,
        mutedUntil,
        snoozedUntil,
        note: params.note?.trim() || null,
        updatedBy: params.userId,
        updatedAt: nowIso,
      },
    });

  await db
    .update(notificationInbox)
    .set({
      status: "RESOLVED",
      resolvedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(notificationInbox.storeId, params.storeId),
        eq(notificationInbox.topic, params.topic),
        eq(notificationInbox.entityType, params.entityType),
        eq(notificationInbox.entityId, params.entityId),
        ne(notificationInbox.status, "RESOLVED"),
      ),
    );

  const [rule] = await db
    .select({
      mutedForever: notificationRules.mutedForever,
      mutedUntil: notificationRules.mutedUntil,
      snoozedUntil: notificationRules.snoozedUntil,
    })
    .from(notificationRules)
    .where(
      and(
        eq(notificationRules.storeId, params.storeId),
        eq(notificationRules.topic, params.topic),
        eq(notificationRules.entityType, params.entityType),
        eq(notificationRules.entityId, params.entityId),
      ),
    )
    .limit(1);

  return {
    rule: rule
      ? {
          mutedForever: Boolean(rule.mutedForever),
          mutedUntil: rule.mutedUntil,
          snoozedUntil: rule.snoozedUntil,
          isSuppressedNow: isRuleSuppressedNow(
            {
              id: "rule",
              entityId: params.entityId,
              mutedForever: Boolean(rule.mutedForever),
              mutedUntil: rule.mutedUntil,
              snoozedUntil: rule.snoozedUntil,
            },
            new Date(),
          ),
        }
      : null,
  };
}

type StoreCronSyncResult = {
  storeId: string;
  storeCurrency: "LAK" | "THB" | "USD";
  sourceReminderCount: number;
  createdCount: number;
  updatedCount: number;
  reopenedCount: number;
  resolvedCount: number;
  suppressedCount: number;
};

async function syncPurchaseApNotificationsForStore(
  storeId: string,
  limitPerStore: number,
): Promise<StoreCronSyncResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const reminder = await getPurchaseApDueReminders({
    storeId,
    limit: limitPerStore,
  });
  const reminderItems = reminder.summary.items;

  const existingRows = await db
    .select({
      id: notificationInbox.id,
      dedupeKey: notificationInbox.dedupeKey,
      status: notificationInbox.status,
      dueStatus: notificationInbox.dueStatus,
      dueDate: notificationInbox.dueDate,
      payload: notificationInbox.payload,
      readAt: notificationInbox.readAt,
    })
    .from(notificationInbox)
    .where(
      and(
        eq(notificationInbox.storeId, storeId),
        eq(notificationInbox.topic, AP_REMINDER_TOPIC),
        eq(notificationInbox.entityType, AP_REMINDER_ENTITY_TYPE),
      ),
    );

  const ruleRows = await db
    .select({
      id: notificationRules.id,
      entityId: notificationRules.entityId,
      mutedForever: notificationRules.mutedForever,
      mutedUntil: notificationRules.mutedUntil,
      snoozedUntil: notificationRules.snoozedUntil,
    })
    .from(notificationRules)
    .where(
      and(
        eq(notificationRules.storeId, storeId),
        eq(notificationRules.topic, AP_REMINDER_TOPIC),
        eq(notificationRules.entityType, AP_REMINDER_ENTITY_TYPE),
      ),
    );

  const existingMap = new Map(existingRows.map((row) => [row.dedupeKey, row]));
  const ruleMap = new Map(ruleRows.map((row) => [row.entityId, row]));
  const seenDedupeKeys = new Set<string>();

  let createdCount = 0;
  let updatedCount = 0;
  let reopenedCount = 0;
  let resolvedCount = 0;
  let suppressedCount = 0;

  for (const item of reminderItems) {
    const dedupeKey = buildApReminderDedupeKey(item);
    seenDedupeKeys.add(dedupeKey);
    const existing = existingMap.get(dedupeKey);
    const rule = ruleMap.get(item.poId);
    const isSuppressed = isRuleSuppressedNow(rule, now);

    if (isSuppressed) {
      suppressedCount += 1;
      if (existing && existing.status !== "RESOLVED") {
        await db
          .update(notificationInbox)
          .set({
            status: "RESOLVED",
            resolvedAt: nowIso,
            updatedAt: nowIso,
          })
          .where(eq(notificationInbox.id, existing.id));
        resolvedCount += 1;
      }
      continue;
    }

    const payloadJson = buildApReminderPayload(item);
    const title = buildApReminderTitle(item);
    const message = buildApReminderMessage(item);
    const nextSeverity = item.dueStatus === "OVERDUE" ? "CRITICAL" : "WARNING";

    if (!existing) {
      await db.insert(notificationInbox).values({
        storeId,
        topic: AP_REMINDER_TOPIC,
        entityType: AP_REMINDER_ENTITY_TYPE,
        entityId: item.poId,
        dedupeKey,
        title,
        message,
        severity: nextSeverity,
        status: "UNREAD",
        dueStatus: item.dueStatus,
        dueDate: item.dueDate,
        payload: payloadJson,
        firstDetectedAt: nowIso,
        lastDetectedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      createdCount += 1;
      continue;
    }

    const previousPayload = safeParsePayload(existing.payload);
    const previousOutstanding = Number(previousPayload.outstandingBase ?? 0);
    const hasSignalChanged =
      existing.dueStatus !== item.dueStatus ||
      existing.dueDate !== item.dueDate ||
      previousOutstanding !== item.outstandingBase;
    const nextStatus: NotificationStatus =
      existing.status === "RESOLVED" || hasSignalChanged ? "UNREAD" : existing.status;
    const readAt = nextStatus === "UNREAD" ? null : existing.readAt ?? nowIso;

    await db
      .update(notificationInbox)
      .set({
        title,
        message,
        severity: nextSeverity,
        status: nextStatus,
        dueStatus: item.dueStatus,
        dueDate: item.dueDate,
        payload: payloadJson,
        readAt,
        resolvedAt: null,
        lastDetectedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(notificationInbox.id, existing.id));

    if (existing.status === "RESOLVED" || (hasSignalChanged && nextStatus === "UNREAD")) {
      reopenedCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  for (const existing of existingRows) {
    if (existing.status === "RESOLVED") continue;
    if (seenDedupeKeys.has(existing.dedupeKey)) continue;
    await db
      .update(notificationInbox)
      .set({
        status: "RESOLVED",
        resolvedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(notificationInbox.id, existing.id));
    resolvedCount += 1;
  }

  return {
    storeId,
    storeCurrency: reminder.storeCurrency,
    sourceReminderCount: reminder.summary.items.length,
    createdCount,
    updatedCount,
    reopenedCount,
    resolvedCount,
    suppressedCount,
  };
}

export async function runPurchaseApReminderCron(params?: {
  storeId?: string;
  limitPerStore?: number;
}) {
  const limitPerStore = clampCronLimitPerStore(params?.limitPerStore, 200);

  let storeIds: string[] = [];
  if (params?.storeId?.trim()) {
    storeIds = [params.storeId.trim()];
  } else {
    const rows = await db.select({ id: stores.id }).from(stores);
    storeIds = rows.map((row) => row.id);
  }

  const storesSummary: StoreCronSyncResult[] = [];
  for (const storeId of storeIds) {
    const summary = await syncPurchaseApNotificationsForStore(storeId, limitPerStore);
    storesSummary.push(summary);
  }

  return {
    totalStores: storesSummary.length,
    totalCreated: storesSummary.reduce((sum, item) => sum + item.createdCount, 0),
    totalUpdated: storesSummary.reduce((sum, item) => sum + item.updatedCount, 0),
    totalReopened: storesSummary.reduce((sum, item) => sum + item.reopenedCount, 0),
    totalResolved: storesSummary.reduce((sum, item) => sum + item.resolvedCount, 0),
    totalSuppressed: storesSummary.reduce((sum, item) => sum + item.suppressedCount, 0),
    stores: storesSummary,
  };
}
