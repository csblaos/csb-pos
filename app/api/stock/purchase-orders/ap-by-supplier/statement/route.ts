import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  getPurchaseApSupplierStatement,
  type PurchaseApDueFilter,
  type PurchaseApPaymentFilter,
} from "@/server/services/purchase-ap.service";

const allowedPaymentStatus = new Set<PurchaseApPaymentFilter>([
  "ALL",
  "UNPAID",
  "PARTIAL",
]);
const allowedDueFilter = new Set<PurchaseApDueFilter>([
  "ALL",
  "OVERDUE",
  "DUE_SOON",
  "NOT_DUE",
  "NO_DUE_DATE",
]);

function isDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("inventory.view");
    const url = new URL(request.url);

    const supplierKey = url.searchParams.get("supplierKey")?.trim().toLowerCase() ?? "";
    if (!supplierKey) {
      return NextResponse.json(
        { message: "กรุณาระบุ supplierKey" },
        { status: 400 },
      );
    }

    const paymentStatusRaw = (url.searchParams.get("paymentStatus") ?? "ALL").toUpperCase();
    const dueFilterRaw = (url.searchParams.get("dueFilter") ?? "ALL").toUpperCase();
    const paymentStatus = allowedPaymentStatus.has(
      paymentStatusRaw as PurchaseApPaymentFilter,
    )
      ? (paymentStatusRaw as PurchaseApPaymentFilter)
      : null;
    const dueFilter = allowedDueFilter.has(dueFilterRaw as PurchaseApDueFilter)
      ? (dueFilterRaw as PurchaseApDueFilter)
      : null;
    if (!paymentStatus || !dueFilter) {
      return NextResponse.json(
        { message: "ตัวกรองไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const dueFrom = url.searchParams.get("dueFrom")?.trim() ?? "";
    const dueTo = url.searchParams.get("dueTo")?.trim() ?? "";
    if ((dueFrom && !isDateInput(dueFrom)) || (dueTo && !isDateInput(dueTo))) {
      return NextResponse.json(
        { message: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      1000,
      Math.max(1, Number(url.searchParams.get("limit") ?? 500)),
    );

    const result = await getPurchaseApSupplierStatement({
      storeId,
      supplierKey,
      paymentStatus,
      dueFilter,
      dueFrom: dueFrom || undefined,
      dueTo: dueTo || undefined,
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
