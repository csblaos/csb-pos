import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import { productCategories, productUnits, products, units } from "@/lib/db/schema";

export type UnitOption = {
  id: string;
  code: string;
  nameTh: string;
  scope: "SYSTEM" | "STORE";
  storeId: string | null;
};

export type ProductConversionView = {
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitNameTh: string;
  priceBase: number;
  costBase: number;
  outStockThreshold: number | null;
  lowStockThreshold: number | null;
  active: boolean;
  createdAt: string;
  conversions: ProductConversionView[];
};

export async function listUnits(storeId: string): Promise<UnitOption[]> {
  const rows = await db
    .select({
      id: units.id,
      code: units.code,
      nameTh: units.nameTh,
      scope: units.scope,
      storeId: units.storeId,
    })
    .from(units)
    .where(
      or(
        eq(units.scope, "SYSTEM"),
        and(eq(units.scope, "STORE"), eq(units.storeId, storeId)),
      ),
    )
    .orderBy(sql`case when ${units.scope} = 'STORE' then 0 else 1 end`, asc(units.code));

  return rows;
}

export async function listStoreProducts(
  storeId: string,
  search?: string,
): Promise<ProductListItem[]> {
  const baseUnits = alias(units, "base_units");
  const conversionUnits = alias(units, "conversion_units");

  const keyword = search?.trim();
  const withSearch = Boolean(keyword);

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      baseUnitId: products.baseUnitId,
      baseUnitCode: baseUnits.code,
      baseUnitNameTh: baseUnits.nameTh,
      priceBase: products.priceBase,
      costBase: products.costBase,
        outStockThreshold: products.outStockThreshold,
        lowStockThreshold: products.lowStockThreshold,
      active: products.active,
      createdAt: products.createdAt,
      conversionUnitId: conversionUnits.id,
      conversionUnitCode: conversionUnits.code,
      conversionUnitNameTh: conversionUnits.nameTh,
      multiplierToBase: productUnits.multiplierToBase,
    })
    .from(products)
    .innerJoin(baseUnits, eq(products.baseUnitId, baseUnits.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productUnits, eq(productUnits.productId, products.id))
    .leftJoin(conversionUnits, eq(productUnits.unitId, conversionUnits.id))
    .where(
      withSearch
        ? and(
            eq(products.storeId, storeId),
            or(
              like(products.name, `%${keyword}%`),
              like(products.sku, `%${keyword}%`),
              like(products.barcode, `%${keyword}%`),
            ),
          )
        : eq(products.storeId, storeId),
    )
    .orderBy(desc(products.createdAt), asc(products.name));

  const productMap = new Map<string, ProductListItem>();

  for (const row of rows) {
    const current = productMap.get(row.id);
    if (!current) {
      productMap.set(row.id, {
        id: row.id,
        sku: row.sku,
        name: row.name,
        barcode: row.barcode,
        imageUrl: row.imageUrl,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        baseUnitId: row.baseUnitId,
        baseUnitCode: row.baseUnitCode,
        baseUnitNameTh: row.baseUnitNameTh,
        priceBase: row.priceBase,
        costBase: row.costBase,
        outStockThreshold: row.outStockThreshold ?? null,
        lowStockThreshold: row.lowStockThreshold ?? null,
        active: Boolean(row.active),
        createdAt: row.createdAt,
        conversions: [],
      });
    }

    if (
      row.conversionUnitId &&
      row.conversionUnitCode &&
      row.conversionUnitNameTh &&
      row.multiplierToBase !== null
    ) {
      const item = productMap.get(row.id);
      if (item) {
        item.conversions.push({
          unitId: row.conversionUnitId,
          unitCode: row.conversionUnitCode,
          unitNameTh: row.conversionUnitNameTh,
          multiplierToBase: row.multiplierToBase,
        });
      }
    }
  }

  const productsList = [...productMap.values()];
  productsList.forEach((item) => {
    item.conversions.sort((a, b) => a.multiplierToBase - b.multiplierToBase);
  });

  return productsList;
}

/* ── Categories ── */

export type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

export async function listCategories(storeId: string): Promise<CategoryItem[]> {
  const rows = await db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      sortOrder: productCategories.sortOrder,
      productCount: sql<number>`count(${products.id})`,
    })
    .from(productCategories)
    .leftJoin(
      products,
      and(
        eq(products.categoryId, productCategories.id),
        eq(products.storeId, storeId),
      ),
    )
    .where(eq(productCategories.storeId, storeId))
    .groupBy(
      productCategories.id,
      productCategories.name,
      productCategories.sortOrder,
    )
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

  return rows;
}
