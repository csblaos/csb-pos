import { NextResponse } from "next/server";

import {
  enforcePermission,
  toRBACErrorResponse,
} from "@/lib/rbac/access";
import { stockMovementSchema } from "@/lib/inventory/validation";
import {
  getStockOverview,
  postStockMovement,
  StockServiceError,
} from "@/server/services/stock.service";

export async function GET() {
  try {
    const { storeId } = await enforcePermission("inventory.view");

    const { products, movements } = await getStockOverview({
      storeId,
      movementLimit: 30,
      useCache: false,
    });

    return NextResponse.json({ ok: true, products, movements });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, storeId } = await enforcePermission("inventory.create");

    const parsed = stockMovementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลการเคลื่อนไหวสต็อกไม่ถูกต้อง" }, { status: 400 });
    }

    const { balance } = await postStockMovement({
      storeId,
      sessionUserId: session.userId,
      payload: parsed.data,
    });

    return NextResponse.json({ ok: true, balance });
  } catch (error) {
    if (error instanceof StockServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return toRBACErrorResponse(error);
  }
}
