import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { productCategories } from "@/lib/db/schema";
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
      return NextResponse.json(
        { message: "ข้อมูลหมวดหมู่ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const name = parsed.data.name.trim();

    // Check duplicate name
    const [existing] = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.storeId, storeId),
          eq(productCategories.name, name),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { message: "ชื่อหมวดหมู่นี้มีอยู่แล้ว" },
        { status: 409 },
      );
    }

    const id = randomUUID();
    await db.insert(productCategories).values({
      id,
      storeId,
      name,
      sortOrder: parsed.data.sortOrder,
    });

    const categories = await listCategories(storeId);
    return NextResponse.json({ ok: true, categories }, { status: 201 });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.update");

    const parsed = updateCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "ข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const { id, name, sortOrder } = parsed.data;

    const [target] = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.id, id),
          eq(productCategories.storeId, storeId),
        ),
      )
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { message: "ไม่พบหมวดหมู่" },
        { status: 404 },
      );
    }

    // Check name conflict
    if (name) {
      const [dup] = await db
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(
          and(
            eq(productCategories.storeId, storeId),
            eq(productCategories.name, name.trim()),
          ),
        )
        .limit(1);

      if (dup && dup.id !== id) {
        return NextResponse.json(
          { message: "ชื่อหมวดหมู่นี้มีอยู่แล้ว" },
          { status: 409 },
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    if (Object.keys(updates).length > 0) {
      await db
        .update(productCategories)
        .set(updates)
        .where(
          and(
            eq(productCategories.id, id),
            eq(productCategories.storeId, storeId),
          ),
        );
    }

    const categories = await listCategories(storeId);
    return NextResponse.json({ ok: true, categories });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { storeId } = await enforcePermission("products.delete");

    const parsed = deleteCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "ข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    await db
      .delete(productCategories)
      .where(
        and(
          eq(productCategories.id, parsed.data.id),
          eq(productCategories.storeId, storeId),
        ),
      );

    const categories = await listCategories(storeId);
    return NextResponse.json({ ok: true, categories });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
