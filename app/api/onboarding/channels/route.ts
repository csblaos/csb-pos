import { NextResponse } from "next/server";
import { z } from "zod";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  connectOnboardingChannel,
  getOnboardingChannelStatus,
} from "@/server/services/onboarding-channels.service";

const connectChannelSchema = z.object({
  channel: z.enum(["FACEBOOK", "WHATSAPP"]),
});

export async function GET() {
  try {
    const { storeId } = await enforcePermission("connections.view");
    const status = await getOnboardingChannelStatus(storeId);

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("connections.update");

    const payload = connectChannelSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลช่องทางไม่ถูกต้อง" }, { status: 400 });
    }

    const status = await connectOnboardingChannel(storeId, payload.data.channel);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
