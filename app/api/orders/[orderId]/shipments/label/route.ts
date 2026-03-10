import { NextResponse } from "next/server";
import { z } from "zod";

import { buildRequestContext } from "@/lib/http/request-context";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import {
  claimIdempotency,
  getIdempotencyKeyFromHeaders,
  hashRequestBody,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import {
  createOrderShipmentLabel,
  OrderShipmentServiceError,
} from "@/server/services/order-shipment.service";

const createShipmentLabelSchema = z.object({
  provider: z.string().trim().max(60).optional().or(z.literal("")),
  forceRegenerate: z.coerce.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const action = "order.create_shipping_label";
  let requestContext = buildRequestContext(null);
  let idempotencyRecordId: string | null = null;
  let auditContext:
    | {
        storeId: string;
        userId: string;
        actorName: string | null;
        actorRole: string | null;
        orderId: string;
      }
    | null = null;

  try {
    const { session, storeId } = await enforcePermission("orders.ship");
    const { orderId } = await context.params;
    requestContext = buildRequestContext(request);
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      orderId,
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

    const payload = createShipmentLabelSchema.safeParse(body);
    if (!payload.success) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "ข้อมูลการสร้างป้ายจัดส่งไม่ถูกต้อง" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        requestContext,
      });
      return NextResponse.json(
        { message: "ข้อมูลการสร้างป้ายจัดส่งไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const result = await createOrderShipmentLabel({
      storeId,
      orderId,
      userId: session.userId,
      payload: payload.data,
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

    return NextResponse.json({
      ok: true,
      reused: result.reused,
      shipment: result.shipment,
    });
  } catch (error) {
    if (error instanceof OrderShipmentServiceError) {
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
          entityType: "order",
          entityId: auditContext.orderId,
          result: "FAIL",
          reasonCode: error.reasonCode,
          metadata: {
            message: error.message,
          },
          requestContext,
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
        entityType: "order",
        entityId: auditContext.orderId,
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
