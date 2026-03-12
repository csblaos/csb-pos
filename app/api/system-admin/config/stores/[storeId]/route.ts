import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { storeCurrencyValues } from "@/lib/finance/store-financial";
import {
  findStoreByIdFromPostgres,
  updateSystemAdminStoreConfigInPostgres,
} from "@/lib/platform/postgres-settings-admin-write";

const updateStoreConfigSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    storeType: z.enum(["ONLINE_RETAIL", "RESTAURANT", "CAFE", "OTHER"]).optional(),
    currency: z.enum(storeCurrencyValues).optional(),
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

    const targetStore = await findStoreByIdFromPostgres(storeId);
    if (targetStore === undefined) {
      throw new Error("PostgreSQL system-admin write path is not available");
    }

    if (!targetStore) {
      return NextResponse.json({ message: "ไม่พบร้านค้า" }, { status: 404 });
    }

    await updateSystemAdminStoreConfigInPostgres({
      storeId,
      name: payload.data.name,
      storeType: payload.data.storeType,
      currency: payload.data.currency,
      vatEnabled: payload.data.vatEnabled,
      vatRate: payload.data.vatRate,
      maxBranchesOverride: payload.data.maxBranchesOverride,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
