import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { settlePurchaseOrderSchema } from "@/lib/purchases/validation";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import {
  claimIdempotency,
  getIdempotencyKey,
  hashRequestBody,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import {
  PurchaseServiceError,
  settlePurchaseOrderPaymentFlow,
} from "@/server/services/purchase.service";

type RouteParams = { params: Promise<{ poId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const action = "po.payment.settle";

  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
    poId: string;
  } | null = null;
  let idempotencyRecordId: string | null = null;

  try {
    const { session, storeId } = await enforcePermission("inventory.create");
    const { poId } = await params;
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      poId,
    };

    const rawBody = await request.text();
    const idempotencyKey = getIdempotencyKey(request);
    const requestHash = hashRequestBody(rawBody);
    let body: unknown;

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      if (idempotencyKey) {
        const claim = await claimIdempotency({
          storeId,
          action,
          idempotencyKey,
          requestHash,
          createdBy: session.userId,
        });
        if (claim.kind === "replay") {
          return NextResponse.json(claim.body, { status: claim.statusCode });
        }
        if (claim.kind === "processing") {
          return NextResponse.json(
            { message: "คำขอนี้กำลังประมวลผลอยู่" },
            { status: 409 },
          );
        }
        if (claim.kind === "conflict") {
          return NextResponse.json(
            { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
            { status: 409 },
          );
        }
        idempotencyRecordId = claim.recordId;
        await safeMarkIdempotencyFailed({
          recordId: claim.recordId,
          statusCode: 400,
          body: { message: "รูปแบบ JSON ไม่ถูกต้อง" },
        });
      }
      return NextResponse.json(
        { message: "รูปแบบ JSON ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    if (idempotencyKey) {
      const claim = await claimIdempotency({
        storeId,
        action,
        idempotencyKey,
        requestHash,
        createdBy: session.userId,
      });
      if (claim.kind === "replay") {
        return NextResponse.json(claim.body, { status: claim.statusCode });
      }
      if (claim.kind === "processing") {
        return NextResponse.json(
          { message: "คำขอนี้กำลังประมวลผลอยู่" },
          { status: 409 },
        );
      }
      if (claim.kind === "conflict") {
        return NextResponse.json(
          { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
          { status: 409 },
        );
      }
      idempotencyRecordId = claim.recordId;
    }

    const parsed = settlePurchaseOrderSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: firstError },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "purchase_order",
        entityId: poId,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: parsed.error.issues
            .map((issue) => issue.path.join("."))
            .slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const [storeRow] = await db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const po = await settlePurchaseOrderPaymentFlow({
      poId,
      storeId,
      userId: session.userId,
      storeCurrency: storeRow?.currency ?? "LAK",
      payload: parsed.data,
      audit: {
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        request,
      },
      idempotency: idempotencyRecordId
        ? {
            recordId: idempotencyRecordId,
          }
        : undefined,
    });

    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    if (error instanceof PurchaseServiceError) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: error.status,
          body: { message: error.message },
        });
      }
      if (auditContext) {
        await safeLogAuditEvent({
          scope: "STORE",
          storeId: auditContext.storeId,
          actorUserId: auditContext.userId,
          actorName: auditContext.actorName,
          actorRole: auditContext.actorRole,
          action,
          entityType: "purchase_order",
          entityId: auditContext.poId,
          result: "FAIL",
          reasonCode: "BUSINESS_RULE",
          metadata: {
            message: error.message,
          },
          request,
        });
      }
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (idempotencyRecordId) {
      await safeMarkIdempotencyFailed({
        recordId: idempotencyRecordId,
        statusCode: 500,
        body: { message: "เกิดข้อผิดพลาดภายในระบบ" },
      });
    }

    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action,
        entityType: "purchase_order",
        entityId: auditContext.poId,
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }

    return toRBACErrorResponse(error);
  }
}
