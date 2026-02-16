import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { createPurchaseOrderSchema } from "@/lib/purchases/validation";
import {
  createPurchaseOrder,
  getPurchaseOrderList,
  PurchaseServiceError,
} from "@/server/services/purchase.service";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

export async function GET() {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const list = await getPurchaseOrderList(storeId);
    return NextResponse.json({ ok: true, purchaseOrders: list });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, storeId } = await enforcePermission("inventory.create");

    const body = await request.json();
    const parsed = createPurchaseOrderSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    // Get store currency
    const [storeRow] = await db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const storeCurrency = storeRow?.currency ?? "LAK";

    const po = await createPurchaseOrder({
      storeId,
      userId: session.userId,
      storeCurrency,
      payload: parsed.data,
    });

    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    if (error instanceof PurchaseServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return toRBACErrorResponse(error);
  }
}
