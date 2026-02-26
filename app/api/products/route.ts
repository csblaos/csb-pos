import { randomUUID } from "node:crypto";

import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { productUnits, products, units } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  buildVariantColumns,
  isVariantCombinationUniqueError,
} from "@/lib/products/variant-persistence";
import {
  getStoreProductSummaryCounts,
  listStoreProducts,
  listStoreProductsPage,
  type ProductSortOption,
  type ProductStatusFilter,
} from "@/lib/products/service";
import { normalizeProductPayload, productUpsertSchema } from "@/lib/products/validation";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.view");
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("q")?.trim() || undefined;
    const categoryId = searchParams.get("categoryId")?.trim() || undefined;

    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "30");
    const page = Number.isFinite(pageParam) ? Math.max(1, Math.trunc(pageParam)) : 1;
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(100, Math.max(1, Math.trunc(pageSizeParam)))
      : 30;

    const statusParam = searchParams.get("status");
    const status: ProductStatusFilter =
      statusParam === "active" || statusParam === "inactive" ? statusParam : "all";

    const sortParam = searchParams.get("sort");
    const sort: ProductSortOption =
      sortParam === "name-asc" ||
      sortParam === "name-desc" ||
      sortParam === "price-asc" ||
      sortParam === "price-desc"
        ? sortParam
        : "newest";

    const [pageResult, summary] = await Promise.all([
      listStoreProductsPage({
        storeId,
        search: keyword,
        categoryId,
        status,
        sort,
        page,
        pageSize,
      }),
      getStoreProductSummaryCounts(storeId),
    ]);

    return NextResponse.json({
      ok: true,
      products: pageResult.items,
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.page * pageResult.pageSize < pageResult.total,
      summary,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.create");

    const parsed = productUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = normalizeProductPayload(parsed.data);

    const [existingSku] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.sku, payload.sku)))
      .limit(1);

    if (existingSku) {
      return NextResponse.json({ message: "SKU นี้มีอยู่แล้วในร้าน" }, { status: 409 });
    }

    const unitIds = [...new Set([payload.baseUnitId, ...payload.conversions.map((item) => item.unitId)])];

    const unitRows = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          inArray(units.id, unitIds),
          or(
            eq(units.scope, "SYSTEM"),
            and(eq(units.scope, "STORE"), eq(units.storeId, storeId)),
          ),
        ),
      );

    if (unitRows.length !== unitIds.length) {
      return NextResponse.json({ message: "พบหน่วยสินค้าที่ไม่ถูกต้อง" }, { status: 400 });
    }

    const productId = randomUUID();

    try {
      await db.transaction(async (tx) => {
        const variantColumns = await buildVariantColumns(tx, {
          storeId,
          categoryId: payload.categoryId,
          variant: payload.variant,
        });

        await tx.insert(products).values({
          id: productId,
          storeId,
          sku: payload.sku,
          name: payload.name,
          barcode: payload.barcode,
          modelId: variantColumns.modelId,
          variantLabel: variantColumns.variantLabel,
          variantOptionsJson: variantColumns.variantOptionsJson,
          variantSortOrder: variantColumns.variantSortOrder,
          baseUnitId: payload.baseUnitId,
          priceBase: payload.priceBase,
          costBase: payload.costBase,
          outStockThreshold: payload.outStockThreshold,
          lowStockThreshold: payload.lowStockThreshold,
          categoryId: payload.categoryId,
          active: true,
        });

        if (payload.conversions.length > 0) {
          await tx.insert(productUnits).values(
            payload.conversions.map((conversion) => ({
              id: randomUUID(),
              productId,
              unitId: conversion.unitId,
              multiplierToBase: conversion.multiplierToBase,
            })),
          );
        }
      });
    } catch (error) {
      if (isVariantCombinationUniqueError(error)) {
        return NextResponse.json(
          {
            message:
              "Variant นี้ซ้ำกับสินค้าใน Model เดียวกัน กรุณาเปลี่ยนตัวเลือก/ชื่อ Variant",
          },
          { status: 409 },
        );
      }
      throw error;
    }

    const createdItems = await listStoreProducts(storeId);
    const created = createdItems.find((item) => item.id === productId);

    return NextResponse.json({ ok: true, product: created }, { status: 201 });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
