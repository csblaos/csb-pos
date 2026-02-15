import { type StoreVatMode } from "@/lib/finance/store-financial";

export type OrderTotalsInput = {
  subtotal: number;
  discount: number;
  vatEnabled: boolean;
  vatRate: number;
  vatMode: StoreVatMode;
  shippingFeeCharged: number;
};

export type OrderTotalsResult = {
  discount: number;
  vatAmount: number;
  total: number;
};

export function computeOrderTotals(input: OrderTotalsInput): OrderTotalsResult {
  const safeSubtotal = Math.max(0, Math.round(input.subtotal));
  const safeDiscount = Math.max(0, Math.min(Math.round(input.discount), safeSubtotal));
  const safeShipping = Math.max(0, Math.round(input.shippingFeeCharged));
  const taxableGross = Math.max(safeSubtotal - safeDiscount, 0);

  if (!input.vatEnabled || input.vatRate <= 0) {
    return {
      discount: safeDiscount,
      vatAmount: 0,
      total: taxableGross + safeShipping,
    };
  }

  const safeVatRate = Math.max(0, Math.min(10000, Math.round(input.vatRate)));

  if (input.vatMode === "INCLUSIVE") {
    const netBeforeVat = Math.round((taxableGross * 10000) / (10000 + safeVatRate));
    const vatAmount = Math.max(taxableGross - netBeforeVat, 0);

    return {
      discount: safeDiscount,
      vatAmount,
      total: taxableGross + safeShipping,
    };
  }

  const vatAmount = Math.round((taxableGross * safeVatRate) / 10000);

  return {
    discount: safeDiscount,
    vatAmount,
    total: taxableGross + vatAmount + safeShipping,
  };
}
