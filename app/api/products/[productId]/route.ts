import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { productUnits, products, units } from "@/lib/db/schema";
import {
  RBACError,
  enforcePermission,
  hasPermission,
  toRBACErrorResponse,
} from "@/lib/rbac/access";
import { normalizeProductPayload, updateProductSchema } from "@/lib/products/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const parsed = updateProductSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const { productId } = await context.params;

    if (parsed.data.action === "set_active") {
      const { storeId, session } = await enforcePermission("products.view");
      const [canArchive, canDelete] = await Promise.all([
        hasPermission({ userId: session.userId }, storeId, "products.archive"),
        hasPermission({ userId: session.userId }, storeId, "products.delete"),
      ]);

      if (!canArchive && !canDelete) {
        throw new RBACError(403, "ไม่มีสิทธิ์ปิดใช้งานสินค้า");
      }

      const [targetProduct] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
        .limit(1);

      if (!targetProduct) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      await db
        .update(products)
        .set({ active: parsed.data.active })
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)));

      return NextResponse.json({ ok: true });
    }

    const { storeId } = await enforcePermission("products.update");

    const [targetProduct] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
      .limit(1);

    if (!targetProduct) {
      return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
    }

    const payload = normalizeProductPayload(parsed.data.data);

    const [existingSku] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.sku, payload.sku),
        ),
      )
      .limit(1);

    if (existingSku && existingSku.id !== productId) {
      return NextResponse.json({ message: "SKU นี้มีอยู่แล้วในร้าน" }, { status: 409 });
    }

    const unitIds = [...new Set([payload.baseUnitId, ...payload.conversions.map((item) => item.unitId)])];

    const unitRows = await db
      .select({ id: units.id })
      .from(units)
      .where(inArray(units.id, unitIds));

    if (unitRows.length !== unitIds.length) {
      return NextResponse.json({ message: "พบหน่วยสินค้าที่ไม่ถูกต้อง" }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({
          sku: payload.sku,
          name: payload.name,
          barcode: payload.barcode,
          baseUnitId: payload.baseUnitId,
          priceBase: payload.priceBase,
          costBase: payload.costBase,
        })
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)));

      await tx.delete(productUnits).where(eq(productUnits.productId, productId));

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
