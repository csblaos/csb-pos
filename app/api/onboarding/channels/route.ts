import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  connectOnboardingChannel,
  getOnboardingChannelStatus,
} from "@/server/services/onboarding-channels.service";

const connectChannelSchema = z.object({
  channel: z.enum(["FACEBOOK", "WHATSAPP"]),
});

const ONLINE_STORE_TYPE = "ONLINE_RETAIL" as const;
const nonOnlineStoreMessage = "เชื่อมช่องทางได้เฉพาะร้านประเภท Online POS";

async function getStoreType(storeId: string) {
  const [store] = await db
    .select({
      storeType: stores.storeType,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  return store?.storeType ?? null;
}

export async function GET() {
  try {
    const { storeId } = await enforcePermission("connections.view");
    const storeType = await getStoreType(storeId);
    if (!storeType) {
      return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
    }

    const eligible = storeType === ONLINE_STORE_TYPE;
    const status = await getOnboardingChannelStatus(storeId);

    return NextResponse.json({
      ok: true,
      status,
      eligible,
      storeType,
      reason: eligible ? null : nonOnlineStoreMessage,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("connections.update");
    const storeType = await getStoreType(storeId);
    if (!storeType) {
      return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
    }

    if (storeType !== ONLINE_STORE_TYPE) {
      return NextResponse.json({ message: nonOnlineStoreMessage }, { status: 403 });
    }

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
