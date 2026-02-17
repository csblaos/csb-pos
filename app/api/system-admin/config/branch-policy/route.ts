import { NextResponse } from "next/server";
import { z } from "zod";

import { getGlobalBranchPolicy, upsertGlobalBranchPolicy } from "@/lib/branches/policy";
import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const updateGlobalBranchPolicySchema = z.object({
  defaultCanCreateBranches: z.boolean(),
  defaultMaxBranchesPerStore: z.number().int().min(0).max(500).nullable(),
});

export async function GET() {
  try {
    await enforceSystemAdminSession();

    const config = await getGlobalBranchPolicy();
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

    const payload = updateGlobalBranchPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      await safeLogAuditEvent({
        scope: "SYSTEM",
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: "SYSTEM_ADMIN",
        action: "system.branch_policy.update",
        entityType: "system_policy",
        entityId: "branch_policy",
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
    }

    await upsertGlobalBranchPolicy(payload.data);

    const config = await getGlobalBranchPolicy();

    await safeLogAuditEvent({
      scope: "SYSTEM",
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: "SYSTEM_ADMIN",
      action: "system.branch_policy.update",
      entityType: "system_policy",
      entityId: "branch_policy",
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
        action: "system.branch_policy.update",
        entityType: "system_policy",
        entityId: "branch_policy",
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
