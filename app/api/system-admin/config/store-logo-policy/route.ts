import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import {
  getGlobalStoreLogoPolicy,
  upsertGlobalStoreLogoPolicy,
} from "@/lib/system-config/policy";

const updateGlobalStoreLogoPolicySchema = z.object({
  maxSizeMb: z.number().int().min(1).max(20),
  autoResize: z.boolean(),
  resizeMaxWidth: z.number().int().min(256).max(4096),
});

export async function GET() {
  try {
    await enforceSystemAdminSession();

    const config = await getGlobalStoreLogoPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await enforceSystemAdminSession();

    const payload = updateGlobalStoreLogoPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
    }

    await upsertGlobalStoreLogoPolicy(payload.data);
    const config = await getGlobalStoreLogoPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
