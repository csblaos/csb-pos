import { and, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { orderItems, orders, productUnits, products, units } from "@/lib/db/schema";
import { RBACError, enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { createUnitSchema, normalizeUnitPayload } from "@/lib/products/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ unitId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("units.update");

    const parsed = createUnitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลหน่วยสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const { unitId } = await context.params;
    const payload = normalizeUnitPayload(parsed.data);

    const [targetUnit] = await db
      .select({ id: units.id, scope: units.scope, storeId: units.storeId })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    if (!targetUnit) {
      return NextResponse.json({ message: "ไม่พบหน่วยสินค้า" }, { status: 404 });
    }

    if (targetUnit.scope === "SYSTEM") {
      throw new RBACError(403, "ไม่สามารถแก้ไขหน่วยมาตรฐานของระบบ");
    }

    if (targetUnit.storeId !== storeId) {
      return NextResponse.json({ message: "ไม่พบหน่วยสินค้า" }, { status: 404 });
    }

    const [existing] = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.code, payload.code),
          or(
            eq(units.scope, "SYSTEM"),
            and(eq(units.scope, "STORE"), eq(units.storeId, storeId)),
          ),
        ),
      )
      .limit(1);

    if (existing && existing.id !== unitId) {
      return NextResponse.json({ message: "รหัสหน่วยนี้มีอยู่แล้ว" }, { status: 409 });
    }

    await db
      .update(units)
      .set({
        code: payload.code,
        nameTh: payload.nameTh,
      })
      .where(eq(units.id, unitId));

    const [updated] = await db
      .select({
        id: units.id,
        code: units.code,
        nameTh: units.nameTh,
        scope: units.scope,
        storeId: units.storeId,
      })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    return NextResponse.json({
      ok: true,
      unit: updated ?? {
        id: unitId,
        code: payload.code,
        nameTh: payload.nameTh,
        scope: "STORE",
        storeId,
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ unitId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("units.delete");
    const { unitId } = await context.params;

    const [targetUnit] = await db
      .select({ id: units.id, scope: units.scope, storeId: units.storeId, code: units.code })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    if (!targetUnit) {
      return NextResponse.json({ message: "ไม่พบหน่วยสินค้า" }, { status: 404 });
    }

    if (targetUnit.scope === "SYSTEM") {
      throw new RBACError(403, "ไม่สามารถลบหน่วยมาตรฐานของระบบ");
    }

    if (targetUnit.storeId !== storeId) {
      return NextResponse.json({ message: "ไม่พบหน่วยสินค้า" }, { status: 404 });
    }

    const [baseUsage, conversionUsage, orderItemUsage] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.baseUnitId, unitId)))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)` })
        .from(productUnits)
        .innerJoin(products, eq(productUnits.productId, products.id))
        .where(and(eq(products.storeId, storeId), eq(productUnits.unitId, unitId)))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orders.storeId, storeId), eq(orderItems.unitId, unitId)))
        .limit(1),
    ]);

    const productBaseCount = Number(baseUsage[0]?.count ?? 0);
    const productConversionCount = Number(conversionUsage[0]?.count ?? 0);
    const orderItemCount = Number(orderItemUsage[0]?.count ?? 0);

    if (productBaseCount > 0 || productConversionCount > 0 || orderItemCount > 0) {
      return NextResponse.json(
        {
          message:
            "ลบหน่วยนี้ไม่ได้ เพราะยังถูกใช้งานอยู่ในสินค้า/รายการขาย กรุณาแก้ไขข้อมูลที่เกี่ยวข้องก่อน",
          usage: {
            productBaseCount,
            productConversionCount,
            orderItemCount,
          },
        },
        { status: 409 },
      );
    }

    await db.delete(units).where(and(eq(units.id, unitId), eq(units.storeId, storeId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
