import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getInventoryBalanceForProduct } from "@/lib/inventory/queries";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json({ message: "กรุณาระบุ productId" }, { status: 400 });
    }

    const balance = await getInventoryBalanceForProduct(storeId, productId);

    if (!balance) {
      return NextResponse.json({
        ok: true,
        stock: {
          onHand: 0,
          reserved: 0,
          available: 0,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      stock: {
        onHand: balance.onHand,
        reserved: balance.reserved,
        available: balance.available,
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
