import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { units } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { createUnitSchema, normalizeUnitPayload } from "@/lib/products/validation";

export async function GET() {
  try {
    await enforcePermission("units.view");

    const rows = await db
      .select({
        id: units.id,
        code: units.code,
        nameTh: units.nameTh,
      })
      .from(units)
      .orderBy(units.code);

    return NextResponse.json({ ok: true, units: rows });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await enforcePermission("units.create");

    const parsed = createUnitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลหน่วยสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = normalizeUnitPayload(parsed.data);

    const [existing] = await db
      .select({ id: units.id })
      .from(units)
      .where(eq(units.code, payload.code))
      .limit(1);

    if (existing) {
      return NextResponse.json({ message: "รหัสหน่วยนี้มีอยู่แล้ว" }, { status: 409 });
    }

    await db.insert(units).values(payload);

    const [created] = await db
      .select({
        id: units.id,
        code: units.code,
        nameTh: units.nameTh,
      })
      .from(units)
      .where(and(eq(units.code, payload.code), eq(units.nameTh, payload.nameTh)))
      .limit(1);

    return NextResponse.json({ ok: true, unit: created ?? payload }, { status: 201 });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
