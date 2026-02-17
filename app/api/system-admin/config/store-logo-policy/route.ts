import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import {
  getGlobalStoreLogoPolicy,
  upsertGlobalStoreLogoPolicy,
} from "@/lib/system-config/policy";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const updateGlobalStoreLogoPolicySchema = z.object({
  maxSizeMb: z.number().int().min(1).max(20),
  autoResize: z.boolean(),
  resizeMaxWidth: z.number().int().min(256).max(4096),
});

export async function GET() {
  try {
    await enforceSystemAdminSession();

    const config = await getGlobalStoreLogoPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let auditContext: { userId: string; actorName: string | null } | null = null;

  try {
    const { session } = await enforceSystemAdminSession();
    auditContext = { userId: session.userId, actorName: session.displayName };

    const payload = updateGlobalStoreLogoPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      await safeLogAuditEvent({
        scope: "SYSTEM",
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: "SYSTEM_ADMIN",
        action: "system.store_logo_policy.update",
        entityType: "system_policy",
        entityId: "store_logo_policy",
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
    }

    await upsertGlobalStoreLogoPolicy(payload.data);
    const config = await getGlobalStoreLogoPolicy();

    await safeLogAuditEvent({
      scope: "SYSTEM",
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: "SYSTEM_ADMIN",
      action: "system.store_logo_policy.update",
      entityType: "system_policy",
      entityId: "store_logo_policy",
      metadata: payload.data,
      request,
    });

    return NextResponse.json({ ok: true, config });
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "SYSTEM",
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: "SYSTEM_ADMIN",
        action: "system.store_logo_policy.update",
        entityType: "system_policy",
        entityId: "store_logo_policy",
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toSystemAdminErrorResponse(error);
  }
}
