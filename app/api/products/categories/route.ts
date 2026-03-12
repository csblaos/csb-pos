import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createCategoryInPostgres,
  deleteCategoryInPostgres,
  updateCategoryInPostgres,
} from "@/lib/platform/postgres-products-onboarding-write";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { listCategories } from "@/lib/products/service";

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อหมวดหมู่").max(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const updateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "กรุณากรอกชื่อหมวดหมู่").max(120).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const deleteCategorySchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  try {
    const { storeId } = await enforcePermission("products.view");
    const categories = await listCategories(storeId);
    return NextResponse.json({ ok: true, categories });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.create");
    const parsed = createCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลหมวดหมู่ไม่ถูกต้อง" }, { status: 400 });
    }

    const result = await createCategoryInPostgres({
      storeId,
      name: parsed.data.name.trim(),
      sortOrder: parsed.data.sortOrder,
    });

    if (!result.ok) {
      return NextResponse.json({ message: "ชื่อหมวดหมู่นี้มีอยู่แล้ว" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, categories: result.categories }, { status: 201 });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.update");
    const parsed = updateCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const result = await updateCategoryInPostgres({
      storeId,
      id: parsed.data.id,
      name: parsed.data.name?.trim(),
      sortOrder: parsed.data.sortOrder,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ message: "ไม่พบหมวดหมู่" }, { status: 404 });
      }

      return NextResponse.json({ message: "ชื่อหมวดหมู่นี้มีอยู่แล้ว" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, categories: result.categories });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.delete");
    const parsed = deleteCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const result = await deleteCategoryInPostgres({
      storeId,
      id: parsed.data.id,
    });

    return NextResponse.json({
      ok: true,
      categories: result.ok ? result.categories : [],
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
