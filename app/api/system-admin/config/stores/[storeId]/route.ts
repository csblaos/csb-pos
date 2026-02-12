import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

const updateStoreConfigSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    storeType: z.enum(["ONLINE_RETAIL", "RESTAURANT", "CAFE", "OTHER"]).optional(),
    currency: z.string().trim().min(2).max(12).optional(),
    vatEnabled: z.boolean().optional(),
    vatRate: z.number().int().min(0).max(10000).optional(),
    maxBranchesOverride: z.number().int().min(0).max(500).nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.name !== undefined ||
      payload.storeType !== undefined ||
      payload.currency !== undefined ||
      payload.vatEnabled !== undefined ||
      payload.vatRate !== undefined ||
      payload.maxBranchesOverride !== undefined,
    {
      message: "ไม่มีข้อมูลสำหรับอัปเดต",
      path: ["name"],
    },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    await enforceSystemAdminSession();

    const { storeId } = await context.params;
    const payload = updateStoreConfigSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลตั้งค่าร้านไม่ถูกต้อง" }, { status: 400 });
    }

    const [targetStore] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!targetStore) {
      return NextResponse.json({ message: "ไม่พบร้านค้า" }, { status: 404 });
    }

    const updateValues: Partial<typeof stores.$inferInsert> = {};

    if (payload.data.name !== undefined) {
      updateValues.name = payload.data.name;
    }
    if (payload.data.storeType !== undefined) {
      updateValues.storeType = payload.data.storeType;
    }
    if (payload.data.currency !== undefined) {
      updateValues.currency = payload.data.currency;
    }
    if (payload.data.vatEnabled !== undefined) {
      updateValues.vatEnabled = payload.data.vatEnabled;
    }
    if (payload.data.vatRate !== undefined) {
      updateValues.vatRate = payload.data.vatRate;
    }
    if (payload.data.maxBranchesOverride !== undefined) {
      updateValues.maxBranchesOverride = payload.data.maxBranchesOverride;
    }

    await db.update(stores).set(updateValues).where(eq(stores.id, storeId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
