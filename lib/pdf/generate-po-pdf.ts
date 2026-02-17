import type { StoreCurrency } from "@/lib/finance/store-financial";

/* ── Types ── */
export type POPdfData = {
  poNumber: string;
  status: string;
  supplierName: string | null;
  supplierContact: string | null;
  purchaseCurrency: string;
  exchangeRate: number;
  shippingCost: number;
  otherCost: number;
  otherCostNote: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  orderedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  expectedAt: string | null;
  trackingInfo: string | null;
  totalCostBase: number;
  storeLogoUrl?: string | null;
  items: {
    productName: string;
    productSku: string;
    qtyOrdered: number;
    unitCostBase: number;
  }[];
};

/* ── Language detection ── */
type PdfLang = "lo" | "th";

/** Lao Unicode block: U+0E80–U+0EFF */
const LAO_REGEX = /[\u0E80-\u0EFF]/;
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Scan all text fields in the PO and decide which language it is.
 * If any field contains Lao characters → "lo", otherwise → "th".
 */
function detectPOLanguage(po: POPdfData): PdfLang {
  const fields = [
    po.supplierName,
    po.supplierContact,
    po.note,
    po.otherCostNote,
    po.createdByName,
    po.trackingInfo,
    ...po.items.map((i) => i.productName),
    ...po.items.map((i) => i.productSku),
  ];
  for (const f of fields) {
    if (f && LAO_REGEX.test(f)) return "lo";
  }
  return "th";
}

/* ── Constants ── */
const CURRENCY_SYMBOLS: Record<string, string> = {
  LAK: "₭",
  THB: "฿",
  USD: "$",
};

const STATUS_LABELS: Record<PdfLang, Record<string, string>> = {
  th: {
    DRAFT: "ร่าง",
    ORDERED: "สั่งแล้ว",
    SHIPPED: "กำลังจัดส่ง",
    RECEIVED: "รับแล้ว",
    CANCELLED: "ยกเลิก",
  },
  lo: {
    DRAFT: "ຮ່າງ",
    ORDERED: "ສັ່ງແລ້ວ",
    SHIPPED: "ກຳລັງຈັດສົ່ງ",
    RECEIVED: "ຮັບແລ້ວ",
    CANCELLED: "ຍົກເລີກ",
  },
};

/** All translatable labels used in the PDF */
const LABELS: Record<PdfLang, {
  title: string;
  subtitle: string;
  poNumber: string;
  status: string;
  createdAt: string;
  confirmedAt: string;
  shippedAt: string;
  receivedAt: string;
  supplier: string;
  contact: string;
  purchaseCurrency: string;
  exchangeRate: string;
  expectedAt: string;
  tableNo: string;
  tableProduct: string;
  tableSku: string;
  tableQty: string;
  tableUnitPrice: string;
  tableTotal: string;
  subtotal: string;
  shipping: string;
  otherCost: string;
  grandTotal: string;
  note: string;
  createdBy: string;
  sigApprover: string;
  sigSupplier: string;
}> = {
  th: {
    title: "ใบสั่งซื้อ (PO)",
    subtitle: "Purchase Order",
    poNumber: "เลขที่",
    status: "สถานะ",
    createdAt: "สร้างเมื่อ",
    confirmedAt: "ยืนยันเมื่อ",
    shippedAt: "จัดส่งเมื่อ",
    receivedAt: "รับเมื่อ",
    supplier: "ซัพพลายเออร์",
    contact: "ติดต่อ",
    purchaseCurrency: "สกุลเงินซื้อ",
    exchangeRate: "อัตราแลกเปลี่ยน",
    expectedAt: "คาดว่ารับ",
    tableNo: "#",
    tableProduct: "สินค้า",
    tableSku: "SKU",
    tableQty: "จำนวน",
    tableUnitPrice: "ราคา/หน่วย",
    tableTotal: "รวม",
    subtotal: "ยอดสินค้า",
    shipping: "ค่าขนส่ง",
    otherCost: "ค่าอื่นๆ",
    grandTotal: "ยอดรวมทั้งสิ้น",
    note: "หมายเหตุ",
    createdBy: "สร้างโดย",
    sigApprover: "ผู้อนุมัติ / ผู้สั่งซื้อ",
    sigSupplier: "ซัพพลายเออร์",
  },
  lo: {
    title: "ໃບສັ່ງຊື້ (PO)",
    subtitle: "Purchase Order",
    poNumber: "ເລກທີ",
    status: "ສະຖານະ",
    createdAt: "ສ້າງເມື່ອ",
    confirmedAt: "ຢືນຢັນເມື່ອ",
    shippedAt: "ຈັດສົ່ງເມື່ອ",
    receivedAt: "ຮັບເມື່ອ",
    supplier: "ຜູ້ສະໜອງ",
    contact: "ຕິດຕໍ່",
    purchaseCurrency: "ສະກຸນເງິນຊື້",
    exchangeRate: "ອັດຕາແລກປ່ຽນ",
    expectedAt: "ຄາດວ່າຈະໄດ້ຮັບ",
    tableNo: "#",
    tableProduct: "ສິນຄ້າ",
    tableSku: "SKU",
    tableQty: "ຈຳນວນ",
    tableUnitPrice: "ລາຄາ/ໜ່ວຍ",
    tableTotal: "ລວມ",
    subtotal: "ຍອດສິນຄ້າ",
    shipping: "ຄ່າຂົນສົ່ງ",
    otherCost: "ຄ່າອື່ນໆ",
    grandTotal: "ຍອດລວມທັງໝົດ",
    note: "ໝາຍເຫດ",
    createdBy: "ສ້າງໂດຍ",
    sigApprover: "ຜູ້ອະນຸມັດ / ຜູ້ສັ່ງຊື້",
    sigSupplier: "ຜູ້ສະໜອງ",
  },
};

/* ── Font config per language ── */
type FontConfig = {
  path: string;
  fileName: string;
  familyName: string;
};

const FONT_CONFIG: Record<PdfLang, FontConfig> = {
  th: {
    path: "/fonts/Sarabun-Regular.ttf",
    fileName: "Sarabun-Regular.ttf",
    familyName: "Sarabun",
  },
  lo: {
    path: "/fonts/NotoSansLao-Regular.ttf",
    fileName: "NotoSansLao-Regular.ttf",
    familyName: "NotoSansLao",
  },
};

/* ── Font cache (per language) ── */
const fontCache = new Map<PdfLang, string>();

async function loadFont(lang: PdfLang): Promise<string | null> {
  const cached = fontCache.get(lang);
  if (cached) return cached;

  try {
    const cfg = FONT_CONFIG[lang];
    const res = await fetch(cfg.path);
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    fontCache.set(lang, base64);
    return base64;
  } catch {
    return null;
  }
}

/* ── Logo cache ── */
let logoCache: { url: string; dataUri: string } | null = null;

async function loadLogoAsDataUri(
  url: string,
): Promise<{ dataUri: string; format: "PNG" | "JPEG" } | null> {
  try {
    if (logoCache && logoCache.url === url) {
      const fmt = logoCache.dataUri.includes("image/png") ? "PNG" : "JPEG";
      return { dataUri: logoCache.dataUri, format: fmt as "PNG" | "JPEG" };
    }

    // Proxy through Next.js image optimiser to avoid CORS issues with R2
    const proxyUrl = `/_next/image?url=${encodeURIComponent(url)}&w=256&q=80`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const dataUri = `data:${contentType};base64,${base64}`;
    const format: "PNG" | "JPEG" = contentType.includes("png") ? "PNG" : "JPEG";

    logoCache = { url, dataUri };
    return { dataUri, format };
  } catch {
    return null;
  }
}

/* ── Helpers ── */
function sym(currency: StoreCurrency | string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

function fmtMoney(value: number, currency: StoreCurrency | string): string {
  return `${sym(currency)}${value.toLocaleString("th-TH")}`;
}

function fmtDate(dateStr: string, lang: PdfLang = "th"): string {
  const locale = lang === "lo" ? "lo-LA" : "th-TH";
  return new Date(dateStr).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ── PDF config (from store settings) ── */
export type PoPdfConfig = {
  showLogo: boolean;
  showSignature: boolean;
  showNote: boolean;
  headerColor: string;
  companyName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
};

const DEFAULT_PDF_CONFIG: PoPdfConfig = {
  showLogo: true,
  showSignature: true,
  showNote: true,
  headerColor: "#f1f5f9",
  companyName: null,
  companyAddress: null,
  companyPhone: null,
};

/* ── Main generator ── */
export async function generatePoPdf(
  po: POPdfData,
  storeCurrency: StoreCurrency,
  config?: Partial<PoPdfConfig>,
): Promise<Blob> {
  const cfg: PoPdfConfig = { ...DEFAULT_PDF_CONFIG, ...config };
  // Dynamically import jspdf + autotable (tree-shaking friendly)
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  // jspdf-autotable registers itself as a plugin
  const autoTable =
    typeof autoTableModule.default === "function"
      ? autoTableModule.default
      : (autoTableModule as unknown as { default: typeof autoTableModule.default }).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Detect language from PO data ──
  const lang = detectPOLanguage(po);
  const L = LABELS[lang];
  const statusLabels = STATUS_LABELS[lang];
  const fontCfg = FONT_CONFIG[lang];

  // ── Register font ──
  const fontBase64 = await loadFont(lang);
  if (fontBase64) {
    doc.addFileToVFS(fontCfg.fileName, fontBase64);
    doc.addFont(fontCfg.fileName, fontCfg.familyName, "normal");
    doc.setFont(fontCfg.familyName);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header (logo + title) ──
  const logoSize = 18; // mm
  let titleX = margin;

  if (cfg.showLogo && po.storeLogoUrl) {
    const logoData = await loadLogoAsDataUri(po.storeLogoUrl);
    if (logoData) {
      doc.addImage(logoData.dataUri, logoData.format, margin, y - 4, logoSize, logoSize);
      titleX = margin + logoSize + 4;
    }
  }

  doc.setFontSize(18);
  doc.text(L.title, titleX, y);
  y += 4;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(L.subtitle, titleX, y);
  doc.setTextColor(0);

  // Company info (right side of header)
  if (cfg.companyName || cfg.companyAddress || cfg.companyPhone) {
    const companyX = pageWidth - margin;
    let companyY = margin;
    doc.setFontSize(10);
    if (cfg.companyName) {
      doc.text(cfg.companyName, companyX, companyY, { align: "right" });
      companyY += 4.5;
    }
    doc.setFontSize(8);
    doc.setTextColor(100);
    if (cfg.companyAddress) {
      doc.text(cfg.companyAddress, companyX, companyY, { align: "right" });
      companyY += 4;
    }
    if (cfg.companyPhone) {
      doc.text(cfg.companyPhone, companyX, companyY, { align: "right" });
    }
    doc.setTextColor(0);
  }

  // Ensure y is below logo if present
  if (titleX > margin) {
    y = Math.max(y, margin - 4 + logoSize) + 4;
  } else {
    y += 8;
  }

  // ── PO Info (two columns) ──
  doc.setFontSize(10);

  const leftInfo = [
    `${L.poNumber}: ${po.poNumber}`,
    `${L.status}: ${statusLabels[po.status] ?? po.status}`,
    `${L.createdAt}: ${fmtDate(po.createdAt, lang)}`,
    ...(po.orderedAt ? [`${L.confirmedAt}: ${fmtDate(po.orderedAt, lang)}`] : []),
    ...(po.shippedAt ? [`${L.shippedAt}: ${fmtDate(po.shippedAt, lang)}`] : []),
    ...(po.receivedAt ? [`${L.receivedAt}: ${fmtDate(po.receivedAt, lang)}`] : []),
  ];

  const rightInfo = [
    `${L.supplier}: ${po.supplierName || "-"}`,
    ...(po.supplierContact ? [`${L.contact}: ${po.supplierContact}`] : []),
    `${L.purchaseCurrency}: ${po.purchaseCurrency}`,
    ...(po.exchangeRate !== 1
      ? [`${L.exchangeRate}: ${po.exchangeRate}`]
      : []),
    ...(po.expectedAt ? [`${L.expectedAt}: ${fmtDate(po.expectedAt, lang)}`] : []),
    ...(po.trackingInfo ? [`Tracking: ${po.trackingInfo}`] : []),
  ];

  const infoLineHeight = 5;
  const infoStartY = y;

  for (const line of leftInfo) {
    doc.text(line, margin, y);
    y += infoLineHeight;
  }

  let rightY = infoStartY;
  const rightX = pageWidth / 2 + 5;
  for (const line of rightInfo) {
    doc.text(line, rightX, rightY);
    rightY += infoLineHeight;
  }

  y = Math.max(y, rightY) + 4;

  // ── Divider ──
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Items table ──
  const tableBody = po.items.map((item, idx) => [
    String(idx + 1),
    item.productName,
    item.productSku,
    item.qtyOrdered.toLocaleString("th-TH"),
    fmtMoney(item.unitCostBase, storeCurrency),
    fmtMoney(item.unitCostBase * item.qtyOrdered, storeCurrency),
  ]);

  // Parse header color from config
  const hc = cfg.headerColor;
  const headerRgb: [number, number, number] = HEX_REGEX.test(hc)
    ? [
        parseInt(hc.slice(1, 3), 16),
        parseInt(hc.slice(3, 5), 16),
        parseInt(hc.slice(5, 7), 16),
      ]
    : [241, 245, 249];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[L.tableNo, L.tableProduct, L.tableSku, L.tableQty, L.tableUnitPrice, L.tableTotal]],
    body: tableBody,
    styles: {
      font: fontBase64 ? fontCfg.familyName : "helvetica",
      fontSize: 9,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: headerRgb,
      textColor: [30, 30, 30],
      fontStyle: "normal",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 30, halign: "right" },
    },
    theme: "grid",
  });

  // Get the Y position after the table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 20;
  y += 6;

  // ── Cost summary (right-aligned block) ──
  const summaryX = pageWidth - margin - 65;
  const summaryValX = pageWidth - margin;

  doc.setFontSize(10);

  const summaryLines: [string, string][] = [
    [L.subtotal, fmtMoney(po.totalCostBase, storeCurrency)],
  ];
  if (po.shippingCost > 0) {
    summaryLines.push([L.shipping, fmtMoney(po.shippingCost, storeCurrency)]);
  }
  if (po.otherCost > 0) {
    summaryLines.push([
      `${L.otherCost}${po.otherCostNote ? ` (${po.otherCostNote})` : ""}`,
      fmtMoney(po.otherCost, storeCurrency),
    ]);
  }

  for (const [label, value] of summaryLines) {
    doc.text(label, summaryX, y);
    doc.text(value, summaryValX, y, { align: "right" });
    y += 5;
  }

  // Grand total
  const grandTotal = po.totalCostBase + po.shippingCost + po.otherCost;
  doc.setDrawColor(200);
  doc.line(summaryX, y, summaryValX, y);
  y += 5;
  doc.setFontSize(11);
  doc.text(L.grandTotal, summaryX, y);
  doc.text(fmtMoney(grandTotal, storeCurrency), summaryValX, y, {
    align: "right",
  });
  y += 10;

  // ── Note ──
  if (cfg.showNote && po.note) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${L.note}: ${po.note}`, margin, y);
    doc.setTextColor(0);
    y += 8;
  }

  // ── Created by ──
  if (po.createdByName) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${L.createdBy}: ${po.createdByName}`, margin, y);
    doc.setTextColor(0);
  }

  // ── Signature lines ──
  if (cfg.showSignature) {
    const sigY = doc.internal.pageSize.getHeight() - 35;
    doc.setDrawColor(150);
    doc.setFontSize(9);

    // Left signature
    doc.line(margin, sigY, margin + contentWidth / 2 - 10, sigY);
    doc.text(L.sigApprover, margin + (contentWidth / 2 - 10) / 2, sigY + 5, {
      align: "center",
    });

    // Right signature
    const rightSigStart = pageWidth / 2 + 5;
    doc.line(rightSigStart, sigY, pageWidth - margin, sigY);
    doc.text(
      L.sigSupplier,
      rightSigStart + (pageWidth - margin - rightSigStart) / 2,
      sigY + 5,
      { align: "center" },
    );
  }

  return doc.output("blob");
}
