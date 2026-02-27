import { randomUUID } from "node:crypto";

import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { auditEvents, productUnits, products, units } from "@/lib/db/schema";
import {
  RBACError,
  enforcePermission,
  hasPermission,
  toRBACErrorResponse,
} from "@/lib/rbac/access";
import { normalizeProductPayload, updateProductSchema } from "@/lib/products/validation";
import { buildAuditEventValues } from "@/server/services/audit.service";
import {
  deleteProductImageFromR2,
  uploadProductImageToR2,
  isProductImageR2Configured,
} from "@/lib/storage/r2";
import {
  buildVariantColumns,
  isVariantCombinationUniqueError,
} from "@/lib/products/variant-persistence";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // ── Image upload (multipart/form-data) ──
    if (contentType.includes("multipart/form-data")) {
      const { storeId } = await enforcePermission("products.update");
      const { productId } = await context.params;

      if (!isProductImageR2Configured()) {
        return NextResponse.json(
          { message: "ยังไม่ได้ตั้งค่า R2 สำหรับรูปสินค้า" },
          { status: 500 },
        );
      }

      const [targetProduct] = await db
        .select({ id: products.id, name: products.name, imageUrl: products.imageUrl })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
        .limit(1);

      if (!targetProduct) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      const formData = await request.formData();
      const file = formData.get("image");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { message: "กรุณาเลือกไฟล์รูปภาพ" },
          { status: 400 },
        );
      }

      const { url: imageUrl } = await uploadProductImageToR2({
        storeId,
        productName: targetProduct.name,
        file,
      });

      // Delete old image if exists
      if (targetProduct.imageUrl) {
        try {
          await deleteProductImageFromR2({ imageUrl: targetProduct.imageUrl });
        } catch {
          // non-critical
        }
      }

      await db
        .update(products)
        .set({ imageUrl })
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)));

      return NextResponse.json({ ok: true, imageUrl });
    }

    // ── JSON actions ──
    const parsed = updateProductSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const { productId } = await context.params;

    // ── set_active ──
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

    // ── update_cost ──
    if (parsed.data.action === "update_cost") {
      const { storeId, session } = await enforcePermission("products.view");
      const canUpdateCost = await hasPermission(
        { userId: session.userId },
        storeId,
        "products.cost.update",
      );
      if (!canUpdateCost) {
        throw new RBACError(403, "ไม่มีสิทธิ์แก้ไขต้นทุนสินค้า");
      }

      const [targetProduct] = await db
        .select({ id: products.id, costBase: products.costBase, name: products.name })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
        .limit(1);

      if (!targetProduct) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      const nextCostBase = parsed.data.costBase;
      const reason = parsed.data.reason;
      if (nextCostBase === targetProduct.costBase) {
        return NextResponse.json({ ok: true, unchanged: true });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(products)
          .set({ costBase: nextCostBase })
          .where(and(eq(products.id, productId), eq(products.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "product.cost.manual_update",
            entityType: "product",
            entityId: productId,
            metadata: {
              source: "MANUAL",
              productName: targetProduct.name,
              reason,
              previousCostBase: targetProduct.costBase,
              nextCostBase,
            },
            before: {
              costBase: targetProduct.costBase,
            },
            after: {
              costBase: nextCostBase,
            },
            request,
          }),
        );
      });

      return NextResponse.json({ ok: true });
    }

    // ── remove_image ──
    if (parsed.data.action === "remove_image") {
      const { storeId } = await enforcePermission("products.update");

      const [targetProduct] = await db
        .select({ id: products.id, imageUrl: products.imageUrl })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
        .limit(1);

      if (!targetProduct) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      if (targetProduct.imageUrl) {
        try {
          await deleteProductImageFromR2({ imageUrl: targetProduct.imageUrl });
        } catch {
          // non-critical
        }
      }

      await db
        .update(products)
        .set({ imageUrl: null })
        .where(and(eq(products.id, productId), eq(products.storeId, storeId)));

      return NextResponse.json({ ok: true });
    }

    // ── update (full product data) ──
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

    try {
      await db.transaction(async (tx) => {
        const variantColumns = await buildVariantColumns(tx, {
          storeId,
          categoryId: payload.categoryId,
          variant: payload.variant,
        });

        await tx
          .update(products)
          .set({
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/products/:id] error →", error);
    return toRBACErrorResponse(error);
  }
}
