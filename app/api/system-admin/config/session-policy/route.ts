import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { getGlobalSessionPolicy, upsertGlobalSessionPolicy } from "@/lib/system-config/policy";

const updateGlobalSessionPolicySchema = z.object({
  defaultSessionLimit: z.number().int().min(1).max(10),
});

export async function GET() {
  try {
    await enforceSystemAdminSession();

    const config = await getGlobalSessionPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await enforceSystemAdminSession();

    const payload = updateGlobalSessionPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
    }

    await upsertGlobalSessionPolicy(payload.data);
    const config = await getGlobalSessionPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
