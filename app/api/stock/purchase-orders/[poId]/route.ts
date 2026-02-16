import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { updatePOStatusSchema } from "@/lib/purchases/validation";
import {
  getPurchaseOrderDetail,
  updatePurchaseOrderStatusFlow,
  PurchaseServiceError,
} from "@/server/services/purchase.service";

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
