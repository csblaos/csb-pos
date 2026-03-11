import { NextResponse } from "next/server";

import { buildRequestContext } from "@/lib/http/request-context";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  isPostgresPurchaseReceiveStatusEnabled,
  receivePurchaseOrderInPostgres,
} from "@/lib/purchases/postgres-write";
import {
  updatePOStatusSchema,
  updatePurchaseOrderSchema,
} from "@/lib/purchases/validation";
import {
  getPurchaseOrderDetail,
  updatePurchaseOrderFlow,
  updatePurchaseOrderStatusFlow,
  PurchaseServiceError,
} from "@/server/services/purchase.service";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import {
  claimIdempotency,
  getIdempotencyKeyFromHeaders,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { getReportStoreCurrency } from "@/lib/reports/queries";

type RouteParams = { params: Promise<{ poId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const { poId } = await params;
    const po = await getPurchaseOrderDetail(poId, storeId);
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    if (error instanceof PurchaseServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const action = "po.status.change";

  let requestContext = buildRequestContext(null);
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
    requestContext = buildRequestContext(request);
    const { poId } = await params;
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      poId,
    };

    const rawBody = await request.text();
    const idempotencyKey = getIdempotencyKeyFromHeaders(request.headers);
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
          return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
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
      return NextResponse.json({ message: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
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
        return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
      }
      if (claim.kind === "conflict") {
        return NextResponse.json(
          { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
          { status: 409 },
        );
      }
      idempotencyRecordId = claim.recordId;
    }

    const parsed = updatePOStatusSchema.safeParse(body);
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
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        requestContext,
      });
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    if (
      parsed.data.status === "RECEIVED" &&
      isPostgresPurchaseReceiveStatusEnabled()
    ) {
      const currentPo = await getPurchaseOrderDetail(poId, storeId);
      const purchaseOrder = await receivePurchaseOrderInPostgres({
        storeId,
        userId: session.userId,
        po: currentPo,
        payload: parsed.data,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: {
              ok: true,
              purchaseOrder,
            },
          });
        } catch (error) {
          console.error(
            `[purchase.write.pg] idempotency mark failed action=po.status.change poId=${poId}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      return NextResponse.json({ ok: true, purchaseOrder });
    }

    const po = await updatePurchaseOrderStatusFlow({
      poId,
      storeId,
      userId: session.userId,
      payload: parsed.data,
      audit: {
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        requestContext,
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
          requestContext,
        });
      }
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
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
        requestContext,
      });
    }
    return toRBACErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const action = "po.update";

  let requestContext = buildRequestContext(null);
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
    requestContext = buildRequestContext(request);
    const { poId } = await params;
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      poId,
    };

    const rawBody = await request.text();
    const idempotencyKey = getIdempotencyKeyFromHeaders(request.headers);
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
          return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
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
      return NextResponse.json({ message: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
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
        return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
      }
      if (claim.kind === "conflict") {
        return NextResponse.json(
          { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
          { status: 409 },
        );
      }
      idempotencyRecordId = claim.recordId;
    }

    const parsed = updatePurchaseOrderSchema.safeParse(body);
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
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        requestContext,
      });
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const storeCurrency = await getReportStoreCurrency(storeId);

    const po = await updatePurchaseOrderFlow({
      poId,
      storeId,
      userId: session.userId,
      storeCurrency,
      payload: parsed.data,
      audit: {
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        requestContext,
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
          requestContext,
        });
      }
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
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
        requestContext,
      });
    }
    return toRBACErrorResponse(error);
  }
}
