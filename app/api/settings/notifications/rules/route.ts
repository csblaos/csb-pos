import { NextResponse } from "next/server";
import { z } from "zod";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  NotificationServiceError,
  updateNotificationRule,
} from "@/server/services/notification.service";

const updateNotificationRuleSchema = z.object({
  topic: z.enum(["PURCHASE_AP_DUE"]),
  entityType: z.enum(["PURCHASE_ORDER"]),
  entityId: z.string().trim().min(1),
  mode: z.enum(["SNOOZE", "MUTE", "CLEAR"]),
  until: z.string().trim().optional().or(z.literal("")),
  forever: z.boolean().optional(),
  note: z.string().trim().max(240).optional().or(z.literal("")),
});

export async function PATCH(request: Request) {
  try {
    const { session, storeId } = await enforcePermission("settings.update");
    const body = await request.json().catch(() => null);
    const parsed = updateNotificationRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const result = await updateNotificationRule({
      storeId,
      userId: session.userId,
      topic: parsed.data.topic,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      mode: parsed.data.mode,
      until: parsed.data.until || null,
      forever: parsed.data.forever ?? false,
      note: parsed.data.note || null,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof NotificationServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return toRBACErrorResponse(error);
  }
}
