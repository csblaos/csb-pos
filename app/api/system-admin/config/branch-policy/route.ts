import { NextResponse } from "next/server";
import { z } from "zod";

import { getGlobalBranchPolicy, upsertGlobalBranchPolicy } from "@/lib/branches/policy";
import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";

const updateGlobalBranchPolicySchema = z.object({
  defaultCanCreateBranches: z.boolean(),
  defaultMaxBranchesPerStore: z.number().int().min(0).max(500).nullable(),
});

export async function GET() {
  try {
    await enforceSystemAdminSession();

    const config = await getGlobalBranchPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await enforceSystemAdminSession();

    const payload = updateGlobalBranchPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
    }

    await upsertGlobalBranchPolicy(payload.data);

    const config = await getGlobalBranchPolicy();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
