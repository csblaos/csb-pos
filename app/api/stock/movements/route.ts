import { NextResponse } from "next/server";

import {
  enforcePermission,
  toRBACErrorResponse,
} from "@/lib/rbac/access";
import { stockMovementSchema } from "@/lib/inventory/validation";
import {
  getStockMovementsPage,
  getStockOverview,
  postStockMovement,
  StockServiceError,
} from "@/server/services/stock.service";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import {
  claimIdempotency,
  getIdempotencyKey,
  hashRequestBody,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";

const HISTORY_TYPE_VALUES = new Set([
  "IN",
  "OUT",
  "RESERVE",
  "RELEASE",
  "ADJUST",
  "RETURN",
]);

const FORBIDDEN_STOCK_MOVEMENT_FIELDS = new Set([
  "cost",
  "costBase",
  "rate",
  "exchangeRate",
  "exchange_rate",
  "unitCost",
  "unitCostBase",
]);

const parsePositiveInt = (
  value: string | null,
  fallbackValue: number,
  maxValue: number,
) => {
  if (!value) {
    return fallbackValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return Math.min(parsed, maxValue);
};

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const getForbiddenStockMovementFields = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  return Object.keys(payload).filter((field) =>
    FORBIDDEN_STOCK_MOVEMENT_FIELDS.has(field),
  );
};

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "history") {
      const page = parsePositiveInt(searchParams.get("page"), 1, 100_000);
      const pageSize = parsePositiveInt(searchParams.get("pageSize"), 30, 100);
      const typeParam = searchParams.get("type");
      const q = searchParams.get("q")?.trim() ?? "";
      const productId = searchParams.get("productId")?.trim() ?? "";
      const dateFromRaw = searchParams.get("dateFrom")?.trim() ?? "";
      const dateToRaw = searchParams.get("dateTo")?.trim() ?? "";

      if (dateFromRaw && !isDateOnly(dateFromRaw)) {
        return NextResponse.json(
          { message: "รูปแบบวันที่เริ่มต้นไม่ถูกต้อง (YYYY-MM-DD)" },
          { status: 400 },
        );
      }

      if (dateToRaw && !isDateOnly(dateToRaw)) {
        return NextResponse.json(
          { message: "รูปแบบวันที่สิ้นสุดไม่ถูกต้อง (YYYY-MM-DD)" },
          { status: 400 },
        );
      }

      if (dateFromRaw && dateToRaw && dateFromRaw > dateToRaw) {
        return NextResponse.json(
          { message: "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด" },
          { status: 400 },
        );
      }

      const normalizedType =
        typeParam && typeParam !== "all" && HISTORY_TYPE_VALUES.has(typeParam)
          ? (typeParam as "IN" | "OUT" | "RESERVE" | "RELEASE" | "ADJUST" | "RETURN")
          : undefined;

      const { movements, total } = await getStockMovementsPage({
        storeId,
        page,
        pageSize,
        filters: {
          type: normalizedType,
          productId: productId || undefined,
          query: q || undefined,
          dateFrom: dateFromRaw || undefined,
          dateTo: dateToRaw || undefined,
        },
      });

      return NextResponse.json({
        ok: true,
        movements,
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      });
    }

    const { products, movements } = await getStockOverview({
      storeId,
      movementLimit: 30,
      useCache: false,
    });

    return NextResponse.json({ ok: true, products, movements });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const action = "stock.movement.create";

  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
  } | null = null;
  let idempotencyRecordId: string | null = null;

  try {
    const { session, storeId } = await enforcePermission("inventory.create");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
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

    const forbiddenFields = getForbiddenStockMovementFields(body);
    if (forbiddenFields.length > 0) {
      const responseBody = {
        message:
          "แท็บบันทึกสต็อกไม่รองรับต้นทุน/อัตราแลกเปลี่ยน กรุณาใช้แท็บสั่งซื้อ (PO) หรือ Month-End Close",
      };
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: responseBody,
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "inventory_movement",
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: forbiddenFields,
        },
        request,
      });
      return NextResponse.json(responseBody, { status: 400 });
    }

    const parsed = stockMovementSchema.safeParse(body);
    if (!parsed.success) {
      const responseBody = { message: "ข้อมูลการเคลื่อนไหวสต็อกไม่ถูกต้อง" };
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: responseBody,
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "inventory_movement",
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json(responseBody, { status: 400 });
    }

    const { balance } = await postStockMovement({
      storeId,
      sessionUserId: session.userId,
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

    return NextResponse.json({ ok: true, balance });
  } catch (error) {
    if (error instanceof StockServiceError) {
      const responseBody = { message: error.message };
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: error.status,
          body: responseBody,
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
          entityType: "inventory_movement",
          result: "FAIL",
          reasonCode: "BUSINESS_RULE",
          metadata: {
            message: error.message,
          },
          request,
        });
      }
      return NextResponse.json(responseBody, { status: error.status });
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
        entityType: "inventory_movement",
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
