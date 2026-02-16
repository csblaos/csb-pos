import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { listStoreProducts } from "@/lib/products/service";
import { getInventoryBalanceForProduct } from "@/lib/inventory/queries";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.view");
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const includeStock = searchParams.get("includeStock") === "true";

    // ค้นหาสินค้าด้วย keyword
    const items = await listStoreProducts(storeId, q);

    // ถ้าต้องการข้อมูลสต็อก ให้ดึงมาเพิ่ม
    if (includeStock) {
      const itemsWithStock = await Promise.all(
        items.map(async (item) => {
          const stock = await getInventoryBalanceForProduct(storeId, item.id);
          return {
            ...item,
            stock: {
              onHand: stock?.onHand ?? 0,
              reserved: stock?.reserved ?? 0,
              available: stock?.available ?? 0,
            },
          };
        }),
      );

      return NextResponse.json({ ok: true, products: itemsWithStock });
    }

    return NextResponse.json({ ok: true, products: items });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
