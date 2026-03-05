import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { auditEvents, orders } from "@/lib/db/schema";
import { listPendingCodReconcile } from "@/lib/orders/queries";
import { enforcePermission, hasPermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { buildAuditEventValues } from "@/server/services/audit.service";
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
import {
  claimIdempotency,
  getIdempotencyKey,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { invalidateReportsOverviewCache } from "@/server/services/reports.service";

const nowIso = () => new Date().toISOString();

const bulkSettleSchema = z.object({
  items: z
    .array(
      z.object({
        orderId: z.string().min(1),
        codAmount: z.coerce.number().int().min(0),
        codFee: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("orders.view");
    const { searchParams } = new URL(request.url);

    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";
    const provider = searchParams.get("provider") ?? "";
    const q = searchParams.get("q") ?? "";
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "50");

    const list = await listPendingCodReconcile(storeId, {
      dateFrom,
      dateTo,
      provider,
      q,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    });

    const providerWhereClauses = [
      eq(orders.storeId, storeId),
      eq(orders.paymentMethod, "COD"),
      eq(orders.status, "SHIPPED"),
      eq(orders.paymentStatus, "COD_PENDING_SETTLEMENT"),
    ];
    if (dateFrom.trim().length > 0) {
      providerWhereClauses.push(
        sql`${orders.shippedAt} >= datetime(${dateFrom.trim()}, 'start of day', 'utc')`,
      );
    }
    if (dateTo.trim().length > 0) {
      providerWhereClauses.push(
        sql`${orders.shippedAt} < datetime(${dateTo.trim()}, 'start of day', '+1 day', 'utc')`,
      );
    }

    const providerRows = await db
      .select({
        provider: sql<string>`coalesce(
          nullif(trim(${orders.shippingProvider}), ''),
          nullif(trim(${orders.shippingCarrier}), ''),
          'ไม่ระบุ'
        )`,
      })
      .from(orders)
      .where(and(...providerWhereClauses))
      .groupBy(
        sql`coalesce(
          nullif(trim(${orders.shippingProvider}), ''),
          nullif(trim(${orders.shippingCarrier}), ''),
          'ไม่ระบุ'
        )`,
      )
      .orderBy(
        sql`coalesce(
          nullif(trim(${orders.shippingProvider}), ''),
          nullif(trim(${orders.shippingCarrier}), ''),
          'ไม่ระบุ'
        ) asc`,
      );

    return NextResponse.json({
      ok: true,
      page: list,
      providers: providerRows.map((row) => row.provider),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const idempotencyAction = "order.cod_reconcile.bulk_settle";
  let idempotencyRecordId: string | null = null;

  try {
    const { storeId, session } = await enforcePermission("orders.view");
    const canMarkPaid = await hasPermission({ userId: session.userId }, storeId, "orders.mark_paid");
    if (!canMarkPaid) {
      return NextResponse.json({ message: "ไม่มีสิทธิ์ปิดยอด COD" }, { status: 403 });
    }

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
          action: idempotencyAction,
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
        action: idempotencyAction,
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

    const parsed = bulkSettleSchema.safeParse(body);
    if (!parsed.success) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "ข้อมูลไม่ถูกต้อง" },
        });
      }
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const items = parsed.data.items;
    const orderIds = Array.from(new Set(items.map((item) => item.orderId)));
    const orderRows = await db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        paymentMethod: orders.paymentMethod,
        paidAt: orders.paidAt,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), inArray(orders.id, orderIds)));

    const orderMap = new Map(orderRows.map((row) => [row.id, row]));
    const results: Array<{
      orderId: string;
      orderNo: string | null;
      ok: boolean;
      message?: string;
    }> = [];

    let successCount = 0;

    await db.transaction(async (tx) => {
      for (const item of items) {
        const order = orderMap.get(item.orderId);
        if (!order) {
          results.push({
            orderId: item.orderId,
            orderNo: null,
            ok: false,
            message: "ไม่พบออเดอร์",
          });
          continue;
        }

        if (
          order.paymentMethod !== "COD" ||
          order.status !== "SHIPPED" ||
          order.paymentStatus !== "COD_PENDING_SETTLEMENT"
        ) {
          results.push({
            orderId: order.id,
            orderNo: order.orderNo,
            ok: false,
            message: "สถานะไม่พร้อมปิดยอด COD",
          });
          continue;
        }

        const codAmount = Math.max(0, Math.trunc(item.codAmount));
        const codFee = Math.max(0, Math.trunc(item.codFee ?? 0));
        const now = nowIso();
        const updated = await tx
          .update(orders)
          .set({
            paymentStatus: "COD_SETTLED",
            codSettledAt: now,
            paidAt: order.paidAt ?? now,
            codAmount,
            codFee,
          })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.storeId, storeId),
              eq(orders.status, "SHIPPED"),
              eq(orders.paymentMethod, "COD"),
              eq(orders.paymentStatus, "COD_PENDING_SETTLEMENT"),
            ),
          )
          .returning({ id: orders.id });

        if (updated.length <= 0) {
          results.push({
            orderId: order.id,
            orderNo: order.orderNo,
            ok: false,
            message: "รายการถูกอัปเดตโดยผู้ใช้อื่นแล้ว",
          });
          continue;
        }

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.confirm_paid.bulk_cod_reconcile",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              toPaymentStatus: "COD_SETTLED",
              codAmount,
              codFee,
            },
            request,
          }),
        );

        successCount += 1;
        results.push({
          orderId: order.id,
          orderNo: order.orderNo,
          ok: true,
        });
      }
    });

    if (successCount > 0) {
      await Promise.all([
        invalidateDashboardSummaryCache(storeId),
        invalidateReportsOverviewCache(storeId),
      ]);
    }

    const responseBody = {
      ok: true,
      settledCount: successCount,
      failedCount: results.length - successCount,
      results,
    };

    if (idempotencyRecordId) {
      await markIdempotencySucceeded({
        recordId: idempotencyRecordId,
        statusCode: 200,
        body: responseBody,
      });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    if (idempotencyRecordId) {
      await safeMarkIdempotencyFailed({
        recordId: idempotencyRecordId,
        statusCode: 500,
        body: { message: "เกิดข้อผิดพลาดภายในระบบ" },
      });
    }
    return toRBACErrorResponse(error);
  }
}
