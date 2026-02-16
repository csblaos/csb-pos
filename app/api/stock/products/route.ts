import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getStockProductsPage } from "@/server/services/stock.service";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      50,
      Math.max(5, Number(url.searchParams.get("pageSize") ?? 20)),
    );
    const offset = (page - 1) * pageSize;
    const rows = await getStockProductsPage({
      storeId,
      limit: pageSize + 1,
      offset,
    });
    const hasMore = rows.length > pageSize;
    const products = rows.slice(0, pageSize);

    return NextResponse.json({
      ok: true,
      products,
      page,
      pageSize,
      hasMore,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}