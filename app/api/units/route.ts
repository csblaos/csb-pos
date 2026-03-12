import { NextResponse } from "next/server";

import { createUnitInPostgres } from "@/lib/platform/postgres-products-onboarding-write";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { listUnits } from "@/lib/products/service";
import { createUnitSchema, normalizeUnitPayload } from "@/lib/products/validation";

export async function GET() {
  try {
    const { storeId } = await enforcePermission("units.view");
    const rows = await listUnits(storeId);
    return NextResponse.json({ ok: true, units: rows });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("units.create");
    const parsed = createUnitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลหน่วยสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = normalizeUnitPayload(parsed.data);
    const result = await createUnitInPostgres({
      storeId,
      code: payload.code,
      nameTh: payload.nameTh,
    });

    if (!result.ok) {
      return NextResponse.json({ message: "รหัสหน่วยนี้มีอยู่แล้ว" }, { status: 409 });
    }

    return NextResponse.json(
      {
        ok: true,
        unit: result.unit,
      },
      { status: 201 },
    );
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
