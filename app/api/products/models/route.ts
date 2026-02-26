import { NextResponse } from "next/server";

import {
  getNextVariantSortOrderByModelName,
  listVariantLabelsByModelName,
  listStoreProductModelNames,
} from "@/lib/products/service";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.view");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() || undefined;
    const modelName = searchParams.get("name")?.trim() || undefined;
    const variantSearch = searchParams.get("variantQ")?.trim() || undefined;
    const limitParam = Number(searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitParam)
      ? Math.min(30, Math.max(1, Math.trunc(limitParam)))
      : 10;

    const [models, nextSortOrder, variantLabels] = await Promise.all([
      listStoreProductModelNames({
        storeId,
        search,
        limit,
      }),
      modelName
        ? getNextVariantSortOrderByModelName({
            storeId,
            modelName,
          })
        : Promise.resolve<number | null>(null),
      modelName
        ? listVariantLabelsByModelName({
            storeId,
            modelName,
            search: variantSearch,
            limit,
          })
        : Promise.resolve<string[]>([]),
    ]);

    return NextResponse.json({ ok: true, models, nextSortOrder, variantLabels });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
