import "server-only";

import {
  getNotificationInboxFromPostgres,
  isPostgresNotificationsEnabled,
  markNotificationActionInPostgres,
  runPurchaseApReminderCronInPostgres,
  updateNotificationRuleInPostgres,
} from "@/lib/platform/postgres-notifications";

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

const MAX_INBOX_LIMIT = 200;
const MAX_CRON_LIMIT_PER_STORE = 500;

function clampInboxLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_INBOX_LIMIT, Math.max(1, Math.floor(value ?? fallback)));
}

function clampCronLimitPerStore(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_CRON_LIMIT_PER_STORE, Math.max(10, Math.floor(value ?? fallback)));
}

function mapNotificationError(error: unknown): never {
  if (error instanceof NotificationServiceError) {
    throw error;
  }

  if (error instanceof Error) {
    switch (error.message) {
      case "INVALID_DATE":
        throw new NotificationServiceError(400, "รูปแบบวันที่ไม่ถูกต้อง");
      case "MISSING_NOTIFICATION_ID":
        throw new NotificationServiceError(400, "ไม่พบรหัสแจ้งเตือน");
      case "SNOOZE_UNTIL_REQUIRED":
        throw new NotificationServiceError(400, "กรุณาระบุวันที่สิ้นสุดการ snooze");
      case "SNOOZE_UNTIL_PAST":
        throw new NotificationServiceError(400, "วันที่สิ้นสุดการ snooze ต้องอยู่ในอนาคต");
      case "MUTE_UNTIL_REQUIRED":
        throw new NotificationServiceError(400, "กรุณาระบุวันที่สิ้นสุดการ mute");
      case "MUTE_UNTIL_PAST":
        throw new NotificationServiceError(400, "วันที่สิ้นสุดการ mute ต้องอยู่ในอนาคต");
      default:
        break;
    }
  }

  throw error;
}

function assertNotificationsPostgresEnabled() {
  if (!isPostgresNotificationsEnabled()) {
    throw new NotificationServiceError(
      503,
      "notifications PostgreSQL path ยังไม่พร้อมใช้งาน",
    );
  }
}

export async function getNotificationInbox(params: {
  storeId: string;
  filter?: NotificationFilter;
  limit?: number;
}): Promise<NotificationInboxResult> {
  assertNotificationsPostgresEnabled();

  try {
    const result = await getNotificationInboxFromPostgres({
      storeId: params.storeId,
      filter: params.filter,
      limit: clampInboxLimit(params.limit, 50),
    });
    if (!result) {
      throw new NotificationServiceError(
        503,
        "notifications PostgreSQL path ยังไม่พร้อมใช้งาน",
      );
    }
    return result;
  } catch (error) {
    mapNotificationError(error);
  }
}

export async function markNotificationAction(params: {
  storeId: string;
  action: "mark_read" | "mark_unread" | "resolve" | "mark_all_read";
  notificationId?: string;
}) {
  assertNotificationsPostgresEnabled();

  try {
    const summary = await markNotificationActionInPostgres(params);
    if (!summary) {
      throw new NotificationServiceError(
        503,
        "notifications PostgreSQL path ยังไม่พร้อมใช้งาน",
      );
    }
    return summary;
  } catch (error) {
    mapNotificationError(error);
  }
}

export async function updateNotificationRule(params: {
  storeId: string;
  userId: string;
  topic: "PURCHASE_AP_DUE";
  entityType: "PURCHASE_ORDER";
  entityId: string;
  mode: "SNOOZE" | "MUTE" | "CLEAR";
  until?: string | null;
  forever?: boolean;
  note?: string | null;
}) {
  assertNotificationsPostgresEnabled();

  try {
    const result = await updateNotificationRuleInPostgres(params);
    if (!result) {
      throw new NotificationServiceError(
        503,
        "notifications PostgreSQL path ยังไม่พร้อมใช้งาน",
      );
    }
    return result;
  } catch (error) {
    mapNotificationError(error);
  }
}

export async function runPurchaseApReminderCron(params?: {
  storeId?: string;
  limitPerStore?: number;
}) {
  assertNotificationsPostgresEnabled();

  try {
    const summary = await runPurchaseApReminderCronInPostgres({
      storeId: params?.storeId,
      limitPerStore: clampCronLimitPerStore(params?.limitPerStore, 200),
    });
    if (!summary) {
      throw new NotificationServiceError(
        503,
        "notifications PostgreSQL path ยังไม่พร้อมใช้งาน",
      );
    }
    return summary;
  } catch (error) {
    mapNotificationError(error);
  }
}
