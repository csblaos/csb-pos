import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getGlobalPaymentPolicy, upsertGlobalPaymentPolicy } from "@/lib/system-config/policy";

const updateGlobalPaymentPolicySchema = z.object({
  maxAccountsPerStore: z.number().int().min(1).max(20),
  requireSlipForLaoQr: z.boolean(),
});

async function enforceSuperadmin() {
  const session = await getSession();
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 }),
    };
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole !== "SUPERADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "เฉพาะบัญชี SUPERADMIN เท่านั้น" }, { status: 403 }),
    };
  }

  return { ok: true as const, session };
}

export async function GET() {
  try {
    const access = await enforceSuperadmin();
    if (!access.ok) {
      return access.response;
    }

    const policy = await getGlobalPaymentPolicy();
    return NextResponse.json({ ok: true, policy });
  } catch {
    return NextResponse.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await enforceSuperadmin();
    if (!access.ok) {
      return access.response;
    }

    const payload = updateGlobalPaymentPolicySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลนโยบายไม่ถูกต้อง" }, { status: 400 });
    }

    await upsertGlobalPaymentPolicy(payload.data);
    const policy = await getGlobalPaymentPolicy();
    return NextResponse.json({ ok: true, policy });
  } catch {
    return NextResponse.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}
