import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getPurchaseApSupplierSummary } from "@/server/services/purchase-ap.service";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? 100)),
    );

    const result = await getPurchaseApSupplierSummary({
      storeId,
      q: q || undefined,
      limit,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
