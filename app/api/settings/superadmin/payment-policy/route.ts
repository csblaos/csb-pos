import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getGlobalPaymentPolicy, upsertGlobalPaymentPolicy } from "@/lib/system-config/policy";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const updateGlobalPaymentPolicySchema = z.object({
  maxAccountsPerStore: z.number().int().min(1).max(20),
  requireSlipForLaoQr: z.boolean(),
});

async function enforceSuperadmin() {
  const session = await getSession();
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 }),
    };
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole !== "SUPERADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "เฉพาะบัญชี SUPERADMIN เท่านั้น" }, { status: 403 }),
    };
  }

  return { ok: true as const, session };
}

export async function GET() {
  try {
    const access = await enforceSuperadmin();
    if (!access.ok) {
      return access.response;
    }

    const policy = await getGlobalPaymentPolicy();
    return NextResponse.json({ ok: true, policy });
  } catch {
    return NextResponse.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const action = "system.payment_policy.update";
  let auditContext: { userId: string; actorName: string | null } | null = null;

  try {
    const access = await enforceSuperadmin();
    if (!access.ok) {
      return access.response;
    }
    auditContext = { userId: access.session.userId, actorName: access.session.displayName };

    const payload = updateGlobalPaymentPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      await safeLogAuditEvent({
        scope: "SYSTEM",
        actorUserId: access.session.userId,
        actorName: access.session.displayName,
        actorRole: "SUPERADMIN",
        action,
        entityType: "system_policy",
        entityId: "payment_policy",
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: "ข้อมูลนโยบายไม่ถูกต้อง" }, { status: 400 });
    }

    const before = await getGlobalPaymentPolicy();
    await upsertGlobalPaymentPolicy(payload.data);
    const policy = await getGlobalPaymentPolicy();

    await safeLogAuditEvent({
      scope: "SYSTEM",
      actorUserId: access.session.userId,
      actorName: access.session.displayName,
      actorRole: "SUPERADMIN",
      action,
      entityType: "system_policy",
      entityId: "payment_policy",
      before,
      after: policy,
      request,
    });

    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "SYSTEM",
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: "SUPERADMIN",
        action,
        entityType: "system_policy",
        entityId: "payment_policy",
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return NextResponse.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}
