import { randomUUID } from "node:crypto";

import { and, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { units } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { createUnitSchema, normalizeUnitPayload } from "@/lib/products/validation";

export async function GET() {
  try {
    const { storeId } = await enforcePermission("units.view");

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
      .orderBy(sql`case when ${units.scope} = 'STORE' then 0 else 1 end`, units.code);

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

    if (existing) {
      return NextResponse.json({ message: "รหัสหน่วยนี้มีอยู่แล้ว" }, { status: 409 });
    }

    const unitId = randomUUID();
    await db.insert(units).values({
      id: unitId,
      code: payload.code,
      nameTh: payload.nameTh,
      scope: "STORE",
      storeId,
    });

    const [created] = await db
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

    return NextResponse.json(
      {
        ok: true,
        unit: created ?? {
          id: unitId,
          code: payload.code,
          nameTh: payload.nameTh,
          scope: "STORE",
          storeId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
