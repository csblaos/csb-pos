"use client";

import { currencyLabel, vatModeLabel } from "@/lib/finance/store-financial";

type PrintableOrderItem = {
  id: string;
  productName: string;
  productSku: string;
  qty: number;
  unitCode: string;
  lineTotal: number;
};

export type PrintableOrder = {
  orderNo: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  contactDisplayName: string | null;
  contactPhone: string | null;
  subtotal: number;
  discount: number;
  vatAmount: number;
  shippingFeeCharged: number;
  shippingCost: number;
  shippingProvider: string | null;
  shippingCarrier: string | null;
  trackingNo: string | null;
  total: number;
  paymentCurrency: "LAK" | "THB" | "USD";
  paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  storeCurrency: string;
  storeVatMode: "EXCLUSIVE" | "INCLUSIVE";
  items: PrintableOrderItem[];
  status?: string | null;
};

const paymentMethodLabel: Record<PrintableOrder["paymentMethod"], string> = {
  CASH: "เงินสด",
  LAO_QR: "QR โอนเงิน",
  ON_CREDIT: "ค้างจ่าย",
  COD: "COD",
  BANK_TRANSFER: "โอนเงิน",
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

export const buildReceiptPrintHtml = (order: PrintableOrder) => {
  const receiptDateText = new Date(order.createdAt).toLocaleString("th-TH");
  const receiptCustomerName = order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป";
  const rowsHtml = order.items
    .map((item) => {
      const productName = escapeHtml(item.productName);
      const productSku = escapeHtml(item.productSku || "-");
      const qtyText = `${item.qty.toLocaleString("th-TH")} ${escapeHtml(item.unitCode)}`;
      const lineTotalText = item.lineTotal.toLocaleString("th-TH");
      return `<tr>
  <td class="col-item"><div>${productName}</div><div class="sku">${productSku}</div></td>
  <td class="col-qty">${qtyText}</td>
  <td class="col-total">${lineTotalText}</td>
</tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Receipt ${escapeHtml(order.orderNo)}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: #0f172a;
        font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
        font-size: 11px;
        line-height: 1.35;
      }
      .receipt {
        width: 72mm;
        margin: 0 auto;
        padding: 2mm 0;
      }
      .center { text-align: center; }
      .title { font-weight: 700; font-size: 12px; margin: 0; }
      .meta { margin: 2px 0 0; font-size: 10px; }
      .sep { border-top: 1px dashed #64748b; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10px; font-weight: 600; padding-bottom: 3px; }
      td { vertical-align: top; padding: 2px 0; }
      .col-item { width: 52%; }
      .sku { color: #475569; font-size: 10px; }
      .col-qty { width: 22%; text-align: right; white-space: nowrap; }
      .col-total { width: 26%; text-align: right; white-space: nowrap; }
      .totals-row { display: flex; justify-content: space-between; margin: 2px 0; }
      .totals-main { font-weight: 700; font-size: 12px; }
      .muted { color: #475569; }
      .thanks { text-align: center; margin-top: 6px; font-size: 10px; }
    </style>
  </head>
  <body>
    <main class="receipt">
      <p class="title center">ใบเสร็จรับเงิน</p>
      <p class="meta center">เลขที่ ${escapeHtml(order.orderNo)}</p>
      <div class="sep"></div>

      <div>ลูกค้า: ${escapeHtml(receiptCustomerName)}</div>
      <div>วันที่: ${escapeHtml(receiptDateText)}</div>

      <div class="sep"></div>

      <table>
        <thead>
          <tr>
            <th>รายการ</th>
            <th style="text-align:right;">จำนวน</th>
            <th style="text-align:right;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="sep"></div>

      <div class="totals-row"><span>ยอดสินค้า</span><span>${order.subtotal.toLocaleString("th-TH")}</span></div>
      <div class="totals-row"><span>ส่วนลด</span><span>${order.discount.toLocaleString("th-TH")}</span></div>
      <div class="totals-row"><span>VAT</span><span>${order.vatAmount.toLocaleString("th-TH")} (${escapeHtml(vatModeLabel(order.storeVatMode))})</span></div>
      <div class="totals-row"><span>ค่าส่ง</span><span>${order.shippingFeeCharged.toLocaleString("th-TH")}</span></div>
      <div class="totals-row totals-main"><span>ยอดสุทธิ</span><span>${order.total.toLocaleString("th-TH")} ${escapeHtml(order.storeCurrency)}</span></div>
      <div class="totals-row muted"><span>สกุลชำระ</span><span>${escapeHtml(currencyLabel(order.paymentCurrency))}</span></div>
      <div class="totals-row muted"><span>วิธีชำระ</span><span>${escapeHtml(paymentMethodLabel[order.paymentMethod])}</span></div>

      <div class="sep"></div>
      <p class="thanks">ขอบคุณที่ใช้บริการ</p>
    </main>
  </body>
</html>`;
};

export const buildShippingLabelPrintHtml = (order: PrintableOrder) => {
  const labelDateText = new Date(order.createdAt).toLocaleString("th-TH");
  const receiverName = order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป";
  const receiverPhone = order.customerPhone || order.contactPhone || "-";
  const shippingProviderLabel = order.shippingProvider || order.shippingCarrier || "-";
  const trackingNo = order.trackingNo || "-";

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Shipping Label ${escapeHtml(order.orderNo)}</title>
    <style>
      @page { size: A6 portrait; margin: 6mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: #0f172a;
        font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
      }
      .label {
        min-height: calc(148mm - 12mm);
        border: 1px solid #0f172a;
        padding: 12px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .order-no { font-size: 18px; font-weight: 700; }
      .section-title { font-size: 12px; color: #475569; margin-bottom: 6px; }
      .receiver { font-size: 21px; font-weight: 700; line-height: 1.2; }
      .phone { font-size: 16px; margin-top: 4px; }
      .address {
        margin-top: 8px;
        font-size: 16px;
        line-height: 1.35;
        white-space: pre-wrap;
      }
      .meta {
        border-top: 1px dashed #475569;
        margin-top: 12px;
        padding-top: 8px;
        font-size: 14px;
        line-height: 1.5;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .meta-label { color: #475569; }
      .meta-value { text-align: right; font-weight: 600; }
    </style>
  </head>
  <body>
    <main class="label">
      <section>
        <div class="order-no">ออเดอร์ ${escapeHtml(order.orderNo)}</div>
        <div class="section-title">ป้ายจัดส่ง</div>
        <div class="receiver">${escapeHtml(receiverName)}</div>
        <div class="phone">โทร: ${escapeHtml(receiverPhone)}</div>
        <div class="address">ที่อยู่: ${escapeHtml(order.customerAddress || "-")}</div>
      </section>

      <section class="meta">
        ${order.status ? `<div class="meta-row"><span class="meta-label">สถานะ</span><span class="meta-value">${escapeHtml(order.status)}</span></div>` : ""}
        <div class="meta-row">
          <span class="meta-label">ขนส่ง</span>
          <span class="meta-value">${escapeHtml(shippingProviderLabel)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Tracking</span>
          <span class="meta-value">${escapeHtml(trackingNo)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">ต้นทุนค่าส่ง</span>
          <span class="meta-value">${order.shippingCost.toLocaleString("th-TH")} ${escapeHtml(order.storeCurrency)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">วันที่สร้าง</span>
          <span class="meta-value">${escapeHtml(labelDateText)}</span>
        </div>
      </section>
    </main>
  </body>
</html>`;
};

export const printHtmlViaWindow = (
  html: string,
  options: {
    kind: "receipt" | "label";
    rootIdPrefix: string;
    onSettled?: () => void;
    onError?: (message: string) => void;
  },
) => {
  if (typeof window === "undefined") {
    return;
  }

  const printRootId = `${options.rootIdPrefix}-root`;
  const printStyleId = `${options.rootIdPrefix}-style`;
  document.getElementById(printRootId)?.remove();
  document.getElementById(printStyleId)?.remove();
  document
    .querySelectorAll<HTMLIFrameElement>('iframe[data-order-print-frame="true"]')
    .forEach((existingFrame) => existingFrame.remove());

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const bodyMarkup = parsed.body?.innerHTML?.trim() || html;
  const collectedStyles = Array.from(parsed.querySelectorAll("style"))
    .map((styleNode) => styleNode.textContent ?? "")
    .filter((styleText) => styleText.trim().length > 0)
    .join("\n");

  const printRoot = document.createElement("div");
  printRoot.id = printRootId;
  printRoot.setAttribute("aria-hidden", "true");
  printRoot.innerHTML = bodyMarkup;

  const printStyle = document.createElement("style");
  printStyle.id = printStyleId;
  printStyle.textContent = `
    ${collectedStyles}
    @media screen {
      #${printRootId} {
        display: none !important;
      }
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        position: static !important;
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        width: auto !important;
        overflow: visible !important;
      }
      body > *:not(#${printRootId}) {
        display: none !important;
      }
      #${printRootId} {
        display: block !important;
      }
    }
  `;

  document.head.appendChild(printStyle);
  document.body.appendChild(printRoot);

  const cleanup = () => {
    printRoot.remove();
    printStyle.remove();
  };

  let settled = false;
  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    options.onSettled?.();
  };

  const handleAfterPrint = () => {
    settle();
    cleanup();
  };
  window.addEventListener("afterprint", handleAfterPrint, { once: true });

  window.setTimeout(() => {
    settle();
  }, 1200);

  window.setTimeout(() => {
    cleanup();
  }, 20000);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        window.focus();
        window.print();
      } catch {
        window.removeEventListener("afterprint", handleAfterPrint);
        options.onError?.(
          options.kind === "receipt" ? "ไม่สามารถพิมพ์ใบเสร็จได้" : "ไม่สามารถพิมพ์ป้ายจัดส่งได้",
        );
        settle();
        cleanup();
      }
    });
  });
};
