import "server-only";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { hasPermission } from "@/lib/rbac/access";
import type { StockMovementInput } from "@/lib/inventory/validation";
import {
  createPerfScope,
  timePerf,
} from "@/server/perf/perf";
import {
  createInventoryMovementRecord,
  findStockMutationProduct,
  findUnitMultiplierToBase,
  getStockBalanceByProduct,
  listRecentStockMovementsByStore,
  listStockMovementsPageByStore,
  listStockProductsByStore,
  listStockProductsByStorePage,
} from "@/server/repositories/stock.repo";
import type {
  InventoryMovementFilters,
  InventoryMovementView,
  StockProductOption,
} from "@/lib/inventory/queries";
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
import { db } from "@/server/db/client";
import { buildAuditEventValues } from "@/server/services/audit.service";
import { auditEvents } from "@/lib/db/schema";
import { markIdempotencySucceeded } from "@/server/services/idempotency.service";

const STOCK_OVERVIEW_TTL_SECONDS = 15;

const stockOverviewCacheKey = (storeId: string, movementLimit: number) =>
  `stock:overview:${storeId}:${movementLimit}`;

export class StockServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toQtyBase(qty: number, multiplierToBase: number) {
  const computed = qty * multiplierToBase;
  const rounded = Math.round(computed);

  if (Math.abs(computed - rounded) > 1e-9) {
    throw new StockServiceError(
      400,
      "จำนวนที่กรอกไม่สามารถแปลงเป็นหน่วยหลักแบบจำนวนเต็มได้",
    );
  }

  if (rounded <= 0) {
    throw new StockServiceError(400, "จำนวนหน่วยหลักต้องมากกว่า 0");
  }

  return rounded;
}

async function hasInventoryActionPermission(
  userId: string,
  storeId: string,
  movementType: "IN" | "ADJUST" | "RETURN",
) {
  if (movementType === "IN" || movementType === "RETURN") {
    return hasPermission({ userId }, storeId, "inventory.in");
  }

  return hasPermission({ userId }, storeId, "inventory.adjust");
}

export async function getStockOverview(params: {
  storeId: string;
  movementLimit?: number;
  useCache?: boolean;
}): Promise<{ products: StockProductOption[]; movements: InventoryMovementView[] }> {
  const movementLimit = params.movementLimit ?? 30;
  const useCache = params.useCache ?? true;
  const cacheKey = stockOverviewCacheKey(params.storeId, movementLimit);

  return timePerf("stock.service.getOverview.total", async () => {
    const scope = createPerfScope("stock.service.getOverview");

    try {
      if (useCache) {
        const cached = await scope.step("cache.read", async () =>
          redisGetJson<{ products: StockProductOption[]; movements: InventoryMovementView[] }>(
            cacheKey,
          ),
        );
        if (cached) {
          return cached;
        }
      }

      const [products, movements] = await scope.step("repo.parallel", async () =>
        Promise.all([
          listStockProductsByStore(params.storeId),
          listRecentStockMovementsByStore(params.storeId, movementLimit),
        ]),
      );

      const response = { products, movements };

      if (useCache) {
        await scope.step("cache.write", async () =>
          redisSetJson(cacheKey, response, STOCK_OVERVIEW_TTL_SECONDS),
        );
      }

      return response;
    } finally {
      scope.end();
    }
  });
}

export async function getRecentStockMovements(params: {
  storeId: string;
  limit: number;
}): Promise<InventoryMovementView[]> {
  return listRecentStockMovementsByStore(params.storeId, params.limit);
}

export async function getStockMovementsPage(params: {
  storeId: string;
  page: number;
  pageSize: number;
  filters?: InventoryMovementFilters;
}): Promise<{ movements: InventoryMovementView[]; total: number }> {
  return listStockMovementsPageByStore(
    params.storeId,
    params.page,
    params.pageSize,
    params.filters,
  );
}

export async function getStockProductsPage(params: {
  storeId: string;
  limit: number;
  offset: number;
}): Promise<StockProductOption[]> {
  return listStockProductsByStorePage(
    params.storeId,
    params.limit,
    params.offset,
  );
}

export async function invalidateStockOverviewCache(
  storeId: string,
  movementLimit = 30,
) {
  await redisDelete(stockOverviewCacheKey(storeId, movementLimit));
}

export async function postStockMovement(params: {
  storeId: string;
  sessionUserId: string;
  payload: StockMovementInput;
  audit?: {
    actorName: string | null;
    actorRole: string | null;
    request?: Request;
  };
  idempotency?: {
    recordId: string;
  };
}) {
  const { storeId, sessionUserId, payload } = params;

  return timePerf("stock.service.postMovement.total", async () => {
    const scope = createPerfScope("stock.service.postMovement");

    try {
      const [allowedMovement, product] = await scope.step(
        "permissionAndProduct.parallel",
        async () =>
          Promise.all([
            hasInventoryActionPermission(sessionUserId, storeId, payload.movementType),
            findStockMutationProduct(storeId, payload.productId),
          ]),
      );

      if (!allowedMovement) {
        throw new StockServiceError(403, "ไม่มีสิทธิ์บันทึกรายการสต็อกประเภทนี้");
      }

      if (!product) {
        throw new StockServiceError(404, "ไม่พบสินค้า");
      }

      if (!product.active) {
        throw new StockServiceError(400, "สินค้านี้ถูกปิดใช้งาน");
      }

      let multiplierToBase = 1;

      if (payload.unitId !== product.baseUnitId) {
        const conversion = await scope.step("repo.findUnitConversion", async () =>
          findUnitMultiplierToBase(payload.productId, payload.unitId),
        );
        if (!conversion) {
          throw new StockServiceError(400, "หน่วยที่เลือกไม่ตรงกับสินค้านี้");
        }
        multiplierToBase = conversion;
      }

      const qtyBaseAbs = toQtyBase(payload.qty, multiplierToBase);
      const qtyBase =
        payload.movementType === "ADJUST" && payload.adjustMode === "DECREASE"
          ? -qtyBaseAbs
          : qtyBaseAbs;

      const { movementId, balance } = await scope.step(
        "repo.writeAndAuditTx",
        async () =>
          db.transaction(async (tx) => {
            const movementId = await createInventoryMovementRecord({
              storeId,
              productId: payload.productId,
              type: payload.movementType,
              qtyBase,
              note: payload.note?.trim() ? payload.note.trim() : null,
              createdBy: sessionUserId,
              tx,
            });

            const balance = await getStockBalanceByProduct(
              storeId,
              payload.productId,
              tx,
            );

            if (params.audit) {
              await tx.insert(auditEvents).values(
                buildAuditEventValues({
                  scope: "STORE",
                  storeId,
                  actorUserId: sessionUserId,
                  actorName: params.audit.actorName,
                  actorRole: params.audit.actorRole,
                  action: "stock.movement.create",
                  entityType: "inventory_movement",
                  entityId: movementId,
                  metadata: {
                    movementType: payload.movementType,
                    productId: payload.productId,
                    qty: payload.qty,
                    unitId: payload.unitId,
                    adjustMode: payload.adjustMode ?? null,
                  },
                  request: params.audit.request,
                }),
              );
            }

            if (params.idempotency) {
              await markIdempotencySucceeded({
                recordId: params.idempotency.recordId,
                statusCode: 200,
                body: { ok: true, balance },
                tx,
              });
            }

            return { movementId, balance };
          }),
      );

      await scope.step("cache.invalidate", async () => {
        const [stockCacheResult, dashboardCacheResult] = await Promise.allSettled([
          invalidateStockOverviewCache(storeId),
          invalidateDashboardSummaryCache(storeId),
        ]);

        if (
          stockCacheResult.status === "rejected" ||
          dashboardCacheResult.status === "rejected"
        ) {
          console.error(
            `[stock] cache invalidate failed storeId=${storeId} movementId=${movementId}`,
            {
              stockError:
                stockCacheResult.status === "rejected"
                  ? stockCacheResult.reason
                  : null,
              dashboardError:
                dashboardCacheResult.status === "rejected"
                  ? dashboardCacheResult.reason
                  : null,
            },
          );
        }
      });

      return { balance, movementId };
    } finally {
      scope.end();
    }
  });
}
