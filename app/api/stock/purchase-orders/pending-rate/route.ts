import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getPendingExchangeRateQueue } from "@/server/services/purchase.service";

function toDateStartIso(value: string): string | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function toDateEndIso(value: string): string | null {
  const parsed = new Date(`${value}T23:59:59.999Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const url = new URL(request.url);

    const supplierQuery = url.searchParams.get("supplier")?.trim() ?? "";
    const receivedFromRaw = url.searchParams.get("receivedFrom")?.trim() ?? "";
    const receivedToRaw = url.searchParams.get("receivedTo")?.trim() ?? "";
    const limit = Math.min(
      200,
      Math.max(10, Number(url.searchParams.get("limit") ?? 50)),
    );

    const receivedFromParsed = receivedFromRaw
      ? toDateStartIso(receivedFromRaw)
      : undefined;
    const receivedToParsed = receivedToRaw ? toDateEndIso(receivedToRaw) : undefined;
    if ((receivedFromRaw && !receivedFromParsed) || (receivedToRaw && !receivedToParsed)) {
      return NextResponse.json(
        { message: "รูปแบบวันที่ไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    const receivedFrom = receivedFromParsed ?? undefined;
    const receivedTo = receivedToParsed ?? undefined;

    const [storeRow] = await db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const queue = await getPendingExchangeRateQueue({
      storeId,
      storeCurrency: (storeRow?.currency ?? "LAK") as "LAK" | "THB" | "USD",
      supplierQuery: supplierQuery || undefined,
      receivedFrom,
      receivedTo,
      limit,
    });

    return NextResponse.json({
      ok: true,
      queue,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
