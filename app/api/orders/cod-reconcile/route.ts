import { NextResponse } from "next/server";
import { z } from "zod";

import { buildRequestContext } from "@/lib/http/request-context";
import { listPendingCodReconcile, listPendingCodReconcileProviders } from "@/lib/orders/queries";
import { bulkSettleCodReconcileInPostgres } from "@/lib/orders/postgres-write";
import { enforcePermission, hasPermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
import {
  claimIdempotency,
  getIdempotencyKeyFromHeaders,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { invalidateReportsOverviewCache } from "@/server/services/reports.service";

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

    const providers = await listPendingCodReconcileProviders(storeId, {
      dateFrom,
      dateTo,
    });

    return NextResponse.json({
      ok: true,
      page: list,
      providers,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const idempotencyAction = "order.cod_reconcile.bulk_settle";
  let requestContext = buildRequestContext(null);
  let idempotencyRecordId: string | null = null;

  try {
    const { storeId, session } = await enforcePermission("orders.view");
    requestContext = buildRequestContext(request);
    const canMarkPaid = await hasPermission({ userId: session.userId }, storeId, "orders.mark_paid");
    if (!canMarkPaid) {
      return NextResponse.json({ message: "ไม่มีสิทธิ์ปิดยอด COD" }, { status: 403 });
    }

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
    const result = await bulkSettleCodReconcileInPostgres({
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      items: items.map((item) => ({
        orderId: item.orderId,
        codAmount: item.codAmount,
        codFee: item.codFee ?? 0,
      })),
      requestContext,
    });

    if (result.settledCount > 0) {
      await Promise.all([
        invalidateDashboardSummaryCache(storeId),
        invalidateReportsOverviewCache(storeId),
      ]);
    }

    const responseBody = {
      ok: true,
      settledCount: result.settledCount,
      failedCount: result.failedCount,
      results: result.results,
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
