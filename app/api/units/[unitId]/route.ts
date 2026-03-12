import { NextResponse } from "next/server";

import {
  deleteUnitInPostgres,
  updateUnitInPostgres,
} from "@/lib/platform/postgres-products-onboarding-write";
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
    const result = await updateUnitInPostgres({
      storeId,
      unitId,
      code: payload.code,
      nameTh: payload.nameTh,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ message: "ไม่พบหน่วยสินค้า" }, { status: 404 });
      }
      if (result.error === "SYSTEM_SCOPE") {
        throw new RBACError(403, "ไม่สามารถแก้ไขหน่วยมาตรฐานของระบบ");
      }
      return NextResponse.json({ message: "รหัสหน่วยนี้มีอยู่แล้ว" }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      unit: result.unit,
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
    const result = await deleteUnitInPostgres({
      storeId,
      unitId,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ message: "ไม่พบหน่วยสินค้า" }, { status: 404 });
      }
      if (result.error === "SYSTEM_SCOPE") {
        throw new RBACError(403, "ไม่สามารถลบหน่วยมาตรฐานของระบบ");
      }
      return NextResponse.json(
        {
          message:
            "ลบหน่วยนี้ไม่ได้ เพราะยังถูกใช้งานอยู่ในสินค้า/รายการขาย กรุณาแก้ไขข้อมูลที่เกี่ยวข้องก่อน",
          usage: result.usage,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
