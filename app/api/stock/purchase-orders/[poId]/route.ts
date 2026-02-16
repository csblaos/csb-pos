import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  updatePOStatusSchema,
  updatePurchaseOrderSchema,
} from "@/lib/purchases/validation";
import {
  getPurchaseOrderDetail,
  updatePurchaseOrderFlow,
  updatePurchaseOrderStatusFlow,
  PurchaseServiceError,
} from "@/server/services/purchase.service";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ poId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const { poId } = await params;
    const po = await getPurchaseOrderDetail(poId, storeId);
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

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, storeId } = await enforcePermission("inventory.create");
    const { poId } = await params;

    const body = await request.json();
    const parsed = updatePOStatusSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const po = await updatePurchaseOrderStatusFlow({
      poId,
      storeId,
      userId: session.userId,
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

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { storeId } = await enforcePermission("inventory.create");
    const { poId } = await params;

    const body = await request.json();
    const parsed = updatePurchaseOrderSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const [storeRow] = await db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const po = await updatePurchaseOrderFlow({
      poId,
      storeId,
      storeCurrency: storeRow?.currency ?? "LAK",
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
