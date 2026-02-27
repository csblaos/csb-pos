import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getOutstandingPurchaseRowsForExport } from "@/server/services/reports.service";

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (!/[",\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replaceAll("\"", "\"\"")}"`;
}

function toAgingBucket(ageDays: number) {
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 60) return "31-60";
  return "61+";
}

export async function GET() {
  try {
    const { storeId } = await enforcePermission("reports.view");
    const { rows, storeCurrency } = await getOutstandingPurchaseRowsForExport(storeId);

    const supplierSummary = new Map<
      string,
      {
        outstandingBase: number;
        fxDeltaBase: number;
      }
    >();
    for (const row of rows) {
      const supplierName = row.supplierName?.trim() || "ไม่ระบุซัพพลายเออร์";
      const current = supplierSummary.get(supplierName) ?? {
        outstandingBase: 0,
        fxDeltaBase: 0,
      };
      current.outstandingBase += row.outstandingBase;
      current.fxDeltaBase += row.fxDeltaBase;
      supplierSummary.set(supplierName, current);
    }

    const headers = [
      "supplier_name",
      "po_number",
      "payment_status",
      "purchase_currency",
      "due_date",
      "received_at",
      "aging_bucket",
      "age_days",
      "grand_total_base",
      "total_paid_base",
      "outstanding_base",
      "fx_delta_base",
      "supplier_outstanding_base",
      "supplier_fx_delta_base",
      "store_currency",
    ];

    const lines = rows.map((row) => {
      const supplierName = row.supplierName?.trim() || "ไม่ระบุซัพพลายเออร์";
      const supplier = supplierSummary.get(supplierName) ?? {
        outstandingBase: 0,
        fxDeltaBase: 0,
      };
      return [
        csvEscape(supplierName),
        csvEscape(row.poNumber),
        csvEscape(row.paymentStatus),
        csvEscape(row.purchaseCurrency),
        csvEscape(row.dueDate),
        csvEscape(row.receivedAt),
        csvEscape(toAgingBucket(row.ageDays)),
        csvEscape(row.ageDays),
        csvEscape(row.grandTotalBase),
        csvEscape(row.totalPaidBase),
        csvEscape(row.outstandingBase),
        csvEscape(row.fxDeltaBase),
        csvEscape(supplier.outstandingBase),
        csvEscape(supplier.fxDeltaBase),
        csvEscape(storeCurrency),
      ].join(",");
    });

    const csv = [headers.join(","), ...lines].join("\n");
    const filename = `po-outstanding-fx-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
