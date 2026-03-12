import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import { isPostgresConfigured, type PostgresTransaction } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import {
  getPurchaseApDueReminders,
  type PurchaseApReminderItem,
} from "@/server/services/purchase-ap.service";

type NotificationTopic = "PURCHASE_AP_DUE";
type NotificationEntityType = "PURCHASE_ORDER";
type NotificationStatus = "UNREAD" | "READ" | "RESOLVED";
type NotificationFilter = "ACTIVE" | "UNREAD" | "RESOLVED" | "ALL";

type StoredRule = {
  id: string;
  entityId: string;
  mutedForever: boolean;
  mutedUntil: string | null;
  snoozedUntil: string | null;
};

type NotificationInboxSummary = {
  unreadCount: number;
  activeCount: number;
  resolvedCount: number;
};

type NotificationRuleView = {
  mutedForever: boolean;
  mutedUntil: string | null;
  snoozedUntil: string | null;
  isSuppressedNow: boolean;
};

type NotificationInboxItemView = {
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

type NotificationInboxResult = {
  items: NotificationInboxItemView[];
  summary: NotificationInboxSummary;
};

type NotificationInboxRow = {
  id: string;
  topic: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: NotificationStatus;
  dueStatus: "OVERDUE" | "DUE_SOON" | null;
  dueDate: string | null;
  payload: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
};

type NotificationRuleRow = {
  id: string;
  entityId: string;
  mutedForever: boolean | null;
  mutedUntil: string | null;
  snoozedUntil: string | null;
};

type NotificationSummaryRow = {
  unreadCount: number | string | null;
  activeCount: number | string | null;
  resolvedCount: number | string | null;
};

type NotificationCronExistingRow = {
  id: string;
  dedupeKey: string;
  status: NotificationStatus;
  dueStatus: "OVERDUE" | "DUE_SOON" | null;
  dueDate: string | null;
  payload: string;
  readAt: string | null;
};

type NotificationStoreIdRow = {
  id: string;
};

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

const AP_REMINDER_TOPIC: NotificationTopic = "PURCHASE_AP_DUE";
const AP_REMINDER_ENTITY_TYPE: NotificationEntityType = "PURCHASE_ORDER";
const MAX_CRON_LIMIT_PER_STORE = 500;

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const clampCronLimitPerStore = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_CRON_LIMIT_PER_STORE, Math.max(10, Math.floor(value ?? fallback)));
};

const safeParsePayload = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
};

const normalizeIsoDate = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("INVALID_DATE");
  }
  return parsed.toISOString();
};

const buildApReminderDedupeKey = (item: PurchaseApReminderItem): string => {
  const dueDateKey = item.dueDate ? item.dueDate.slice(0, 10) : "NO_DUE_DATE";
  return `ap_due:${item.poId}:${item.dueStatus}:${dueDateKey}`;
};

const buildApReminderTitle = (item: PurchaseApReminderItem): string =>
  item.dueStatus === "OVERDUE"
    ? `PO เกินกำหนดชำระ ${item.poNumber}`
    : `PO ใกล้ครบกำหนด ${item.poNumber}`;

const buildApReminderMessage = (item: PurchaseApReminderItem): string =>
  item.dueStatus === "OVERDUE"
    ? `${item.supplierName} · เกินกำหนด ${Math.abs(item.daysUntilDue)} วัน · ค้าง ${item.outstandingBase.toLocaleString("th-TH")}`
    : `${item.supplierName} · ครบกำหนดใน ${item.daysUntilDue} วัน · ค้าง ${item.outstandingBase.toLocaleString("th-TH")}`;

const buildApReminderPayload = (item: PurchaseApReminderItem): string =>
  JSON.stringify({
    poId: item.poId,
    poNumber: item.poNumber,
    supplierName: item.supplierName,
    paymentStatus: item.paymentStatus,
    dueDate: item.dueDate,
    dueStatus: item.dueStatus,
    daysUntilDue: item.daysUntilDue,
    outstandingBase: item.outstandingBase,
  });

const isRuleSuppressedNow = (rule: StoredRule | undefined, now: Date): boolean => {
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
};

const buildStatusFilterClause = (filter: NotificationFilter) => {
  if (filter === "ACTIVE") {
    return `and status <> 'RESOLVED'`;
  }
  if (filter === "UNREAD") {
    return `and status = 'UNREAD'`;
  }
  if (filter === "RESOLVED") {
    return `and status = 'RESOLVED'`;
  }
  return "";
};

const getInboxSummaryInPostgres = async (
  storeId: string,
  tx?: PostgresTransaction,
): Promise<NotificationInboxSummary> => {
  const row = await queryOne<NotificationSummaryRow>(
    `
      select
        count(*) filter (where status = 'UNREAD') as "unreadCount",
        count(*) filter (where status <> 'RESOLVED') as "activeCount",
        count(*) filter (where status = 'RESOLVED') as "resolvedCount"
      from notification_inbox
      where store_id = :storeId
    `,
    {
      replacements: { storeId },
      transaction: tx,
    },
  );

  return {
    unreadCount: Number(toNumber(row?.unreadCount) ?? 0),
    activeCount: Number(toNumber(row?.activeCount) ?? 0),
    resolvedCount: Number(toNumber(row?.resolvedCount) ?? 0),
  };
};

const toStoredRule = (row: NotificationRuleRow): StoredRule => ({
  id: row.id,
  entityId: row.entityId,
  mutedForever: row.mutedForever === true,
  mutedUntil: row.mutedUntil,
  snoozedUntil: row.snoozedUntil,
});

export const isPostgresNotificationsEnabled = () =>
  isPostgresConfigured();

export const logNotificationsFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[notifications.pg] fallback to turso for ${operation}: ${message}`);
};

export async function getNotificationInboxFromPostgres(params: {
  storeId: string;
  filter?: NotificationFilter;
  limit: number;
}): Promise<NotificationInboxResult | undefined> {
  if (!isPostgresNotificationsEnabled()) {
    return undefined;
  }

  const filter = params.filter ?? "ACTIVE";
  const rows = await queryMany<NotificationInboxRow>(
    `
      select
        id,
        topic,
        entity_type as "entityType",
        entity_id as "entityId",
        dedupe_key as "dedupeKey",
        title,
        message,
        severity,
        status,
        due_status as "dueStatus",
        due_date as "dueDate",
        payload,
        first_detected_at as "firstDetectedAt",
        last_detected_at as "lastDetectedAt",
        read_at as "readAt",
        resolved_at as "resolvedAt"
      from notification_inbox
      where store_id = :storeId
      ${buildStatusFilterClause(filter)}
      order by last_detected_at desc
      limit :limit
    `,
    {
      replacements: {
        storeId: params.storeId,
        limit: params.limit,
      },
    },
  );

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
    const ruleRows = await queryMany<NotificationRuleRow>(
      `
        select
          id,
          entity_id as "entityId",
          muted_forever as "mutedForever",
          muted_until as "mutedUntil",
          snoozed_until as "snoozedUntil"
        from notification_rules
        where
          store_id = :storeId
          and topic = :topic
          and entity_type = :entityType
          and entity_id in (:entityIds)
      `,
      {
        replacements: {
          storeId: params.storeId,
          topic: AP_REMINDER_TOPIC,
          entityType: AP_REMINDER_ENTITY_TYPE,
          entityIds: apEntityIds,
        },
      },
    );

    for (const row of ruleRows) {
      ruleMap.set(row.entityId, toStoredRule(row));
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
      severity: row.severity,
      status: row.status,
      dueStatus: row.dueStatus,
      dueDate: row.dueDate,
      payload: safeParsePayload(row.payload),
      firstDetectedAt: row.firstDetectedAt,
      lastDetectedAt: row.lastDetectedAt,
      readAt: row.readAt,
      resolvedAt: row.resolvedAt,
      rule: rule
        ? {
            mutedForever: rule.mutedForever,
            mutedUntil: rule.mutedUntil,
            snoozedUntil: rule.snoozedUntil,
            isSuppressedNow: isRuleSuppressedNow(rule, now),
          }
        : null,
    };
  });

  const summary = await getInboxSummaryInPostgres(params.storeId);
  return { items, summary };
}

export async function markNotificationActionInPostgres(params: {
  storeId: string;
  action: "mark_read" | "mark_unread" | "resolve" | "mark_all_read";
  notificationId?: string;
}): Promise<NotificationInboxSummary | undefined> {
  if (!isPostgresNotificationsEnabled()) {
    return undefined;
  }

  return runInTransaction(async (tx) => {
    const now = new Date().toISOString();

    if (params.action === "mark_all_read") {
      await execute(
        `
          update notification_inbox
          set
            status = 'READ',
            read_at = :now,
            updated_at = :now
          where store_id = :storeId and status = 'UNREAD'
        `,
        {
          replacements: { storeId: params.storeId, now },
          transaction: tx,
        },
      );

      return getInboxSummaryInPostgres(params.storeId, tx);
    }

    if (!params.notificationId) {
      throw new Error("MISSING_NOTIFICATION_ID");
    }

    if (params.action === "mark_read") {
      await execute(
        `
          update notification_inbox
          set
            status = 'READ',
            read_at = :now,
            resolved_at = null,
            updated_at = :now
          where id = :notificationId and store_id = :storeId
        `,
        {
          replacements: {
            notificationId: params.notificationId,
            storeId: params.storeId,
            now,
          },
          transaction: tx,
        },
      );
    } else if (params.action === "mark_unread") {
      await execute(
        `
          update notification_inbox
          set
            status = 'UNREAD',
            read_at = null,
            resolved_at = null,
            updated_at = :now
          where id = :notificationId and store_id = :storeId
        `,
        {
          replacements: {
            notificationId: params.notificationId,
            storeId: params.storeId,
            now,
          },
          transaction: tx,
        },
      );
    } else {
      await execute(
        `
          update notification_inbox
          set
            status = 'RESOLVED',
            resolved_at = :now,
            updated_at = :now
          where id = :notificationId and store_id = :storeId
        `,
        {
          replacements: {
            notificationId: params.notificationId,
            storeId: params.storeId,
            now,
          },
          transaction: tx,
        },
      );
    }

    return getInboxSummaryInPostgres(params.storeId, tx);
  });
}

export async function updateNotificationRuleInPostgres(params: {
  storeId: string;
  userId: string;
  topic: NotificationTopic;
  entityType: NotificationEntityType;
  entityId: string;
  mode: "SNOOZE" | "MUTE" | "CLEAR";
  until?: string | null;
  forever?: boolean;
  note?: string | null;
}): Promise<{ rule: NotificationRuleView | null } | undefined> {
  if (!isPostgresNotificationsEnabled()) {
    return undefined;
  }

  return runInTransaction(async (tx) => {
    const nowIso = new Date().toISOString();
    const now = new Date();

    if (params.mode === "CLEAR") {
      await execute(
        `
          delete from notification_rules
          where
            store_id = :storeId
            and topic = :topic
            and entity_type = :entityType
            and entity_id = :entityId
        `,
        {
          replacements: {
            storeId: params.storeId,
            topic: params.topic,
            entityType: params.entityType,
            entityId: params.entityId,
          },
          transaction: tx,
        },
      );

      return { rule: null };
    }

    let mutedForever = false;
    let mutedUntil: string | null = null;
    let snoozedUntil: string | null = null;

    if (params.mode === "SNOOZE") {
      if (!params.until?.trim()) {
        throw new Error("SNOOZE_UNTIL_REQUIRED");
      }
      snoozedUntil = normalizeIsoDate(params.until);
      if (new Date(snoozedUntil).getTime() <= now.getTime()) {
        throw new Error("SNOOZE_UNTIL_PAST");
      }
    } else if (params.forever) {
      mutedForever = true;
    } else {
      if (!params.until?.trim()) {
        throw new Error("MUTE_UNTIL_REQUIRED");
      }
      mutedUntil = normalizeIsoDate(params.until);
      if (new Date(mutedUntil).getTime() <= now.getTime()) {
        throw new Error("MUTE_UNTIL_PAST");
      }
    }

    await execute(
      `
        insert into notification_rules (
          id,
          store_id,
          topic,
          entity_type,
          entity_id,
          muted_forever,
          muted_until,
          snoozed_until,
          note,
          updated_by,
          created_at,
          updated_at
        )
        values (
          :id,
          :storeId,
          :topic,
          :entityType,
          :entityId,
          :mutedForever,
          :mutedUntil,
          :snoozedUntil,
          :note,
          :updatedBy,
          :nowIso,
          :nowIso
        )
        on conflict (store_id, topic, entity_type, entity_id)
        do update set
          muted_forever = excluded.muted_forever,
          muted_until = excluded.muted_until,
          snoozed_until = excluded.snoozed_until,
          note = excluded.note,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `,
      {
        replacements: {
          id: randomUUID(),
          storeId: params.storeId,
          topic: params.topic,
          entityType: params.entityType,
          entityId: params.entityId,
          mutedForever,
          mutedUntil,
          snoozedUntil,
          note: params.note?.trim() || null,
          updatedBy: params.userId,
          nowIso,
        },
        transaction: tx,
      },
    );

    await execute(
      `
        update notification_inbox
        set
          status = 'RESOLVED',
          resolved_at = :nowIso,
          updated_at = :nowIso
        where
          store_id = :storeId
          and topic = :topic
          and entity_type = :entityType
          and entity_id = :entityId
          and status <> 'RESOLVED'
      `,
      {
        replacements: {
          storeId: params.storeId,
          topic: params.topic,
          entityType: params.entityType,
          entityId: params.entityId,
          nowIso,
        },
        transaction: tx,
      },
    );

    const row = await queryOne<NotificationRuleRow>(
      `
        select
          id,
          entity_id as "entityId",
          muted_forever as "mutedForever",
          muted_until as "mutedUntil",
          snoozed_until as "snoozedUntil"
        from notification_rules
        where
          store_id = :storeId
          and topic = :topic
          and entity_type = :entityType
          and entity_id = :entityId
        limit 1
      `,
      {
        replacements: {
          storeId: params.storeId,
          topic: params.topic,
          entityType: params.entityType,
          entityId: params.entityId,
        },
        transaction: tx,
      },
    );

    if (!row) {
      return { rule: null };
    }

    const rule = toStoredRule(row);
    return {
      rule: {
        mutedForever: rule.mutedForever,
        mutedUntil: rule.mutedUntil,
        snoozedUntil: rule.snoozedUntil,
        isSuppressedNow: isRuleSuppressedNow(rule, new Date()),
      },
    };
  });
}

const syncPurchaseApNotificationsForStoreInPostgres = async (
  storeId: string,
  limitPerStore: number,
): Promise<StoreCronSyncResult> => {
  const now = new Date();
  const nowIso = now.toISOString();
  const reminder = await getPurchaseApDueReminders({
    storeId,
    limit: limitPerStore,
  });
  const reminderItems = reminder.summary.items;

  const [existingRows, ruleRows] = await Promise.all([
    queryMany<NotificationCronExistingRow>(
      `
        select
          id,
          dedupe_key as "dedupeKey",
          status,
          due_status as "dueStatus",
          due_date as "dueDate",
          payload,
          read_at as "readAt"
        from notification_inbox
        where
          store_id = :storeId
          and topic = :topic
          and entity_type = :entityType
      `,
      {
        replacements: {
          storeId,
          topic: AP_REMINDER_TOPIC,
          entityType: AP_REMINDER_ENTITY_TYPE,
        },
      },
    ),
    queryMany<NotificationRuleRow>(
      `
        select
          id,
          entity_id as "entityId",
          muted_forever as "mutedForever",
          muted_until as "mutedUntil",
          snoozed_until as "snoozedUntil"
        from notification_rules
        where
          store_id = :storeId
          and topic = :topic
          and entity_type = :entityType
      `,
      {
        replacements: {
          storeId,
          topic: AP_REMINDER_TOPIC,
          entityType: AP_REMINDER_ENTITY_TYPE,
        },
      },
    ),
  ]);

  const existingMap = new Map(existingRows.map((row) => [row.dedupeKey, row]));
  const ruleMap = new Map(ruleRows.map((row) => [row.entityId, toStoredRule(row)]));
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
        await execute(
          `
            update notification_inbox
            set
              status = 'RESOLVED',
              resolved_at = :nowIso,
              updated_at = :nowIso
            where id = :id
          `,
          {
            replacements: { id: existing.id, nowIso },
          },
        );
        resolvedCount += 1;
      }
      continue;
    }

    const payloadJson = buildApReminderPayload(item);
    const title = buildApReminderTitle(item);
    const message = buildApReminderMessage(item);
    const nextSeverity = item.dueStatus === "OVERDUE" ? "CRITICAL" : "WARNING";

    if (!existing) {
      await execute(
        `
          insert into notification_inbox (
            id,
            store_id,
            topic,
            entity_type,
            entity_id,
            dedupe_key,
            title,
            message,
            severity,
            status,
            due_status,
            due_date,
            payload,
            first_detected_at,
            last_detected_at,
            created_at,
            updated_at
          )
          values (
            :id,
            :storeId,
            :topic,
            :entityType,
            :entityId,
            :dedupeKey,
            :title,
            :message,
            :severity,
            'UNREAD',
            :dueStatus,
            :dueDate,
            :payload,
            :nowIso,
            :nowIso,
            :nowIso,
            :nowIso
          )
        `,
        {
          replacements: {
            id: randomUUID(),
            storeId,
            topic: AP_REMINDER_TOPIC,
            entityType: AP_REMINDER_ENTITY_TYPE,
            entityId: item.poId,
            dedupeKey,
            title,
            message,
            severity: nextSeverity,
            dueStatus: item.dueStatus,
            dueDate: item.dueDate,
            payload: payloadJson,
            nowIso,
          },
        },
      );
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

    await execute(
      `
        update notification_inbox
        set
          title = :title,
          message = :message,
          severity = :severity,
          status = :status,
          due_status = :dueStatus,
          due_date = :dueDate,
          payload = :payload,
          read_at = :readAt,
          resolved_at = null,
          last_detected_at = :nowIso,
          updated_at = :nowIso
        where id = :id
      `,
      {
        replacements: {
          id: existing.id,
          title,
          message,
          severity: nextSeverity,
          status: nextStatus,
          dueStatus: item.dueStatus,
          dueDate: item.dueDate,
          payload: payloadJson,
          readAt,
          nowIso,
        },
      },
    );

    if (existing.status === "RESOLVED" || (hasSignalChanged && nextStatus === "UNREAD")) {
      reopenedCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  for (const existing of existingRows) {
    if (existing.status === "RESOLVED") continue;
    if (seenDedupeKeys.has(existing.dedupeKey)) continue;
    await execute(
      `
        update notification_inbox
        set
          status = 'RESOLVED',
          resolved_at = :nowIso,
          updated_at = :nowIso
        where id = :id
      `,
      {
        replacements: { id: existing.id, nowIso },
      },
    );
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
};

export async function runPurchaseApReminderCronInPostgres(params?: {
  storeId?: string;
  limitPerStore?: number;
}) {
  if (!isPostgresNotificationsEnabled()) {
    return undefined;
  }

  const limitPerStore = clampCronLimitPerStore(params?.limitPerStore, 200);
  let storeIds: string[] = [];

  if (params?.storeId?.trim()) {
    storeIds = [params.storeId.trim()];
  } else {
    const rows = await queryMany<NotificationStoreIdRow>(
      `
        select id
        from stores
        order by id asc
      `,
    );
    storeIds = rows.map((row) => row.id);
  }

  const storesSummary: StoreCronSyncResult[] = [];
  for (const storeId of storeIds) {
    const summary = await syncPurchaseApNotificationsForStoreInPostgres(storeId, limitPerStore);
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
