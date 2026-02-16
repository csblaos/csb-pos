import { and, eq, like } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

/**
 * EAN-13 internal barcode generator.
 *
 * Uses prefix "20" (GS1 reserved for in-store use).
 * Format: 20 + 10-digit zero-padded running number + 1 check digit = 13 digits.
 */

function calcEAN13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export async function POST() {
  try {
    const { storeId } = await enforcePermission("products.create");

    // Find the highest existing internal barcode for this store
    const rows = await db
      .select({ barcode: products.barcode })
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          like(products.barcode, "20%"),
        ),
      )
      .orderBy(products.barcode);

    let maxSeq = 0;
    for (const row of rows) {
      if (row.barcode && /^20\d{11}$/.test(row.barcode)) {
        const seq = Number(row.barcode.slice(2, 12));
        if (seq > maxSeq) maxSeq = seq;
      }
    }

    const nextSeq = maxSeq + 1;
    const first12 = "20" + String(nextSeq).padStart(10, "0");
    const checkDigit = calcEAN13CheckDigit(first12);
    const barcode = first12 + String(checkDigit);

    return NextResponse.json({ ok: true, barcode });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
