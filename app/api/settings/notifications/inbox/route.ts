import { NextResponse } from "next/server";
import { z } from "zod";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  getNotificationInbox,
  markNotificationAction,
  NotificationServiceError,
  type NotificationFilter,
} from "@/server/services/notification.service";

const allowedFilters = new Set<NotificationFilter>([
  "ACTIVE",
  "UNREAD",
  "RESOLVED",
  "ALL",
]);

const notificationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_read"),
    notificationId: z.string().min(1),
  }),
  z.object({
    action: z.literal("mark_unread"),
    notificationId: z.string().min(1),
  }),
  z.object({
    action: z.literal("resolve"),
    notificationId: z.string().min(1),
  }),
  z.object({
    action: z.literal("mark_all_read"),
  }),
]);

const EMPTY_SUMMARY = {
  unreadCount: 0,
  activeCount: 0,
  resolvedCount: 0,
} as const;

function isNotificationSchemaMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const refersNotificationTables =
    message.includes("notification_inbox") || message.includes("notification_rules");
  const isMissingSchema =
    message.includes("no such table") ||
    message.includes("no such column") ||
    message.includes("sqlitenotfound") ||
    message.includes("sqlite_error");

  return refersNotificationTables && isMissingSchema;
}

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("settings.view");
    const url = new URL(request.url);
    const filterRaw = (url.searchParams.get("filter") ?? "ACTIVE").toUpperCase();
    const filter = allowedFilters.has(filterRaw as NotificationFilter)
      ? (filterRaw as NotificationFilter)
      : "ACTIVE";
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    );

    const inbox = await getNotificationInbox({
      storeId,
      filter,
      limit,
    });

    return NextResponse.json({
      ok: true,
      filter,
      ...inbox,
    });
  } catch (error) {
    if (error instanceof NotificationServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (isNotificationSchemaMissingError(error)) {
      return NextResponse.json({
        ok: true,
        filter: "ACTIVE",
        items: [],
        summary: EMPTY_SUMMARY,
        warning:
          "notification schema ยังไม่พร้อมใช้งาน กรุณารัน npm run db:repair แล้วตามด้วย npm run db:migrate",
      });
    }
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { storeId } = await enforcePermission("settings.view");
    const body = await request.json().catch(() => null);
    const parsed = notificationActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const summary = await markNotificationAction({
      storeId,
      ...parsed.data,
    });

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    if (error instanceof NotificationServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (isNotificationSchemaMissingError(error)) {
      return NextResponse.json(
        {
          message:
            "notification schema ยังไม่พร้อมใช้งาน กรุณารัน npm run db:repair แล้วตามด้วย npm run db:migrate",
        },
        { status: 503 },
      );
    }
    return toRBACErrorResponse(error);
  }
}
