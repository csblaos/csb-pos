import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { buildRequestContext } from "@/lib/http/request-context";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  createPurchaseOrderReceivedInPostgres,
  isPostgresPurchaseCreateReceivedEnabled,
  poNumberExistsInPostgres,
} from "@/lib/purchases/postgres-write";
import { createPurchaseOrderSchema } from "@/lib/purchases/validation";
import {
  createPurchaseOrder,
  getPurchaseOrderListPage,
  PurchaseServiceError,
} from "@/server/services/purchase.service";
import { getNextPoNumber } from "@/server/repositories/purchase.repo";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import {
  claimIdempotency,
  getIdempotencyKeyFromHeaders,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      50,
      Math.max(5, Number(url.searchParams.get("pageSize") ?? 20)),
    );
    const offset = (page - 1) * pageSize;
    const rows = await getPurchaseOrderListPage(storeId, pageSize + 1, offset);
    const hasMore = rows.length > pageSize;
    const purchaseOrders = rows.slice(0, pageSize);

    return NextResponse.json({
      ok: true,
      purchaseOrders,
      page,
      pageSize,
      hasMore,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const action = "po.create";

  let requestContext = buildRequestContext(null);
  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
  } | null = null;
  let idempotencyRecordId: string | null = null;

  try {
    const { session, storeId } = await enforcePermission("inventory.create");
    requestContext = buildRequestContext(request);
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
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

    const parsed = createPurchaseOrderSchema.safeParse(body);
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
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        requestContext,
      });
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    // Get store currency
    const [storeRow] = await db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const storeCurrency = storeRow?.currency ?? "LAK";

    if (parsed.data.receiveImmediately && isPostgresPurchaseCreateReceivedEnabled()) {
      let poNumber = await getNextPoNumber(storeId);
      const poNumberBase = poNumber;
      let attempts = 0;

      while (await poNumberExistsInPostgres(storeId, poNumber)) {
        attempts += 1;
        const suffix =
          attempts <= 5
            ? `${Math.floor(Math.random() * 90 + 10)}`
            : `${Date.now().toString().slice(-6)}-${attempts}`;
        poNumber = `${poNumberBase}-${suffix}`;
      }

      try {
        const purchaseOrder = await createPurchaseOrderReceivedInPostgres({
          storeId,
          userId: session.userId,
          storeCurrency: storeCurrency as "LAK" | "THB" | "USD",
          poNumber,
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
              `[purchase.write.pg] idempotency mark failed action=po.create poNumber=${poNumber}: ${
                error instanceof Error ? error.message : "unknown"
              }`,
            );
          }
        }

        return NextResponse.json({ ok: true, purchaseOrder });
      } catch (error) {
        console.warn(
          `[purchase.write.pg] fallback to turso for po.create receiveImmediately poNumber=${poNumber}: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
      }
    }

    const po = await createPurchaseOrder({
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
