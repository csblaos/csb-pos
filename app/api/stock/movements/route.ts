import { NextResponse } from "next/server";

import {
  claimIdempotencyForRoute,
  readJsonRouteRequest,
} from "@/lib/http/route-handler";
import {
  buildRequestContext,
  type RequestContext,
} from "@/lib/http/request-context";
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

type StockMovementAuditContext = {
  storeId: string;
  userId: string;
  actorName: string | null;
  actorRole: string | null;
};

const failStockMovementRequest = async (input: {
  status: number;
  body: { message: string };
  recordId?: string | null;
  audit?: StockMovementAuditContext | null;
  action: string;
  requestContext: RequestContext;
  reasonCode: "VALIDATION_ERROR" | "BUSINESS_RULE" | "INTERNAL_ERROR";
  metadata?: Record<string, unknown>;
}) => {
  if (input.recordId) {
    await safeMarkIdempotencyFailed({
      recordId: input.recordId,
      statusCode: input.status,
      body: input.body,
    });
  }

  if (input.audit) {
    await safeLogAuditEvent({
      scope: "STORE",
      storeId: input.audit.storeId,
      actorUserId: input.audit.userId,
      actorName: input.audit.actorName,
      actorRole: input.audit.actorRole,
      action: input.action,
      entityType: "inventory_movement",
      result: "FAIL",
      reasonCode: input.reasonCode,
      metadata: input.metadata,
      requestContext: input.requestContext,
    });
  }

  return NextResponse.json(input.body, { status: input.status });
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

  let requestContext = buildRequestContext(null);
  let auditContext: StockMovementAuditContext | null = null;
  let idempotencyRecordId: string | null = null;

  try {
    const { session, storeId } = await enforcePermission("inventory.create");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };

    const requestEnvelope = await readJsonRouteRequest(request);
    requestContext = requestEnvelope.value.requestContext;
    const { idempotencyKey, requestHash } = requestEnvelope.value;

    if (!requestEnvelope.ok) {
      if (idempotencyKey) {
        const claimResult = await claimIdempotencyForRoute({
          storeId,
          action,
          idempotencyKey,
          requestHash,
          createdBy: session.userId,
        });
        if (!claimResult.ok) {
          return claimResult.response;
        }

        idempotencyRecordId = claimResult.claim.recordId;
      }
      return failStockMovementRequest({
        status: 400,
        body: { message: "รูปแบบ JSON ไม่ถูกต้อง" },
        recordId: idempotencyRecordId,
        audit: auditContext,
        action,
        requestContext,
        reasonCode: "VALIDATION_ERROR",
      });
    }

    const body = requestEnvelope.value.body;

    if (idempotencyKey) {
      const claimResult = await claimIdempotencyForRoute({
        storeId,
        action,
        idempotencyKey,
        requestHash,
        createdBy: session.userId,
      });
      if (!claimResult.ok) {
        return claimResult.response;
      }
      idempotencyRecordId = claimResult.claim.recordId;
    }

    const forbiddenFields = getForbiddenStockMovementFields(body);
    if (forbiddenFields.length > 0) {
      return failStockMovementRequest({
        status: 400,
        body: {
          message:
            "แท็บบันทึกสต็อกไม่รองรับต้นทุน/อัตราแลกเปลี่ยน กรุณาใช้แท็บสั่งซื้อ (PO) หรือ Month-End Close",
        },
        recordId: idempotencyRecordId,
        audit: auditContext,
        action,
        requestContext,
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: forbiddenFields,
        },
      });
    }

    const parsed = stockMovementSchema.safeParse(body);
    if (!parsed.success) {
      return failStockMovementRequest({
        status: 400,
        body: { message: "ข้อมูลการเคลื่อนไหวสต็อกไม่ถูกต้อง" },
        recordId: idempotencyRecordId,
        audit: auditContext,
        action,
        requestContext,
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
      });
    }

    const { balance } = await postStockMovement({
      storeId,
      sessionUserId: session.userId,
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

    return NextResponse.json({ ok: true, balance });
  } catch (error) {
    if (error instanceof StockServiceError) {
      return failStockMovementRequest({
        status: error.status,
        body: { message: error.message },
        recordId: idempotencyRecordId,
        audit: auditContext,
        action,
        requestContext,
        reasonCode: "BUSINESS_RULE",
        metadata: {
          message: error.message,
        },
      });
    }

    await failStockMovementRequest({
      status: 500,
      body: { message: "เกิดข้อผิดพลาดภายในระบบ" },
      recordId: idempotencyRecordId,
      audit: auditContext,
      action,
      requestContext,
      reasonCode: "INTERNAL_ERROR",
      metadata: {
        message: error instanceof Error ? error.message : "unknown",
      },
    });

    return toRBACErrorResponse(error);
  }
}
