import { NextResponse } from "next/server";

import { createProductInPostgres } from "@/lib/platform/postgres-products-write";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  getStoreProductSummaryCounts,
  listStoreProductsPage,
  type ProductSortOption,
  type ProductStatusFilter,
} from "@/lib/products/service";
import { normalizeProductPayload, productUpsertSchema } from "@/lib/products/validation";

function toProductWriteErrorResponse(error: string) {
  if (error === "CONFLICT_SKU") {
    return NextResponse.json({ message: "SKU นี้มีอยู่แล้วในร้าน" }, { status: 409 });
  }

  if (error === "INVALID_UNIT") {
    return NextResponse.json({ message: "พบหน่วยสินค้าที่ไม่ถูกต้อง" }, { status: 400 });
  }

  if (error === "INVALID_CATEGORY") {
    return NextResponse.json({ message: "พบหมวดหมู่สินค้าที่ไม่ถูกต้อง" }, { status: 400 });
  }

  if (error === "VARIANT_CONFLICT") {
    return NextResponse.json(
      {
        message:
          "Variant นี้ซ้ำกับสินค้าใน Model เดียวกัน กรุณาเปลี่ยนตัวเลือก/ชื่อ Variant",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ message: "บันทึกสินค้าไม่สำเร็จ" }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.view");
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("q")?.trim() || undefined;
    const categoryId = searchParams.get("categoryId")?.trim() || undefined;

    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "30");
    const page = Number.isFinite(pageParam) ? Math.max(1, Math.trunc(pageParam)) : 1;
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(100, Math.max(1, Math.trunc(pageSizeParam)))
      : 30;

    const statusParam = searchParams.get("status");
    const status: ProductStatusFilter =
      statusParam === "active" || statusParam === "inactive" ? statusParam : "all";

    const sortParam = searchParams.get("sort");
    const sort: ProductSortOption =
      sortParam === "name-asc" ||
      sortParam === "name-desc" ||
      sortParam === "price-asc" ||
      sortParam === "price-desc"
        ? sortParam
        : "newest";

    const [pageResult, summary] = await Promise.all([
      listStoreProductsPage({
        storeId,
        search: keyword,
        categoryId,
        status,
        sort,
        page,
        pageSize,
      }),
      getStoreProductSummaryCounts(storeId),
    ]);

    return NextResponse.json({
      ok: true,
      products: pageResult.items,
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.page * pageResult.pageSize < pageResult.total,
      summary,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.create");

    const parsed = productUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = normalizeProductPayload(parsed.data);
    const result = await createProductInPostgres({
      storeId,
      payload,
    });

    if (!result.ok) {
      return toProductWriteErrorResponse(result.error);
    }

    return NextResponse.json({ ok: true, product: result.product }, { status: 201 });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
