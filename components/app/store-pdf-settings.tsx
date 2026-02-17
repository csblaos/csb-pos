"use client";

import { CheckCircle2, ChevronRight, CircleAlert, Eye, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";

/* ── Types ── */
export type PdfConfig = {
  pdfShowLogo: boolean;
  pdfShowSignature: boolean;
  pdfShowNote: boolean;
  pdfHeaderColor: string;
  pdfCompanyName: string | null;
  pdfCompanyAddress: string | null;
  pdfCompanyPhone: string | null;
};

type Props = {
  initialConfig: PdfConfig;
  storeLogoUrl: string | null;
  storeCurrency: string;
  canUpdate: boolean;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  config?: PdfConfig;
};

type PdfSection = "po" | "invoice" | "quotation" | "bill";

const SECTION_ITEMS: { key: PdfSection; label: string; description: string }[] = [
  {
    key: "po",
    label: "ใบสั่งซื้อ (PO)",
    description: "ควบคุมลายเซ็นและหมายเหตุที่แสดงบน PO",
  },
  {
    key: "invoice",
    label: "ใบแจ้งหนี้ (Invoice)",
    description: "ตั้งค่าหัวตาราง, โลโก้ และข้อมูลบริษัทที่แสดงบน Invoice",
  },
  {
    key: "quotation",
    label: "ใบเสนอราคา",
    description: "กำหนดการแสดงผลเฉพาะใบเสนอราคาและข้อความท้ายเอกสาร",
  },
  {
    key: "bill",
    label: "ใบเสร็จ / Bill",
    description: "ปรับข้อความขอบคุณ, QR และข้อมูลท้ายใบเสร็จ",
  },
];

const SECTION_ENABLE_STORAGE_KEY = "csb-pos:pdf-section-enabled";

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

const COLOR_PRESETS = [
  { label: "เทาอ่อน", value: "#f1f5f9" },
  { label: "ฟ้าอ่อน", value: "#dbeafe" },
  { label: "เขียวอ่อน", value: "#dcfce7" },
  { label: "ม่วงอ่อน", value: "#ede9fe" },
  { label: "ส้มอ่อน", value: "#ffedd5" },
  { label: "ชมพูอ่อน", value: "#fce7f3" },
];

export function StorePdfSettings({
  initialConfig,
  storeLogoUrl,
  storeCurrency,
  canUpdate,
}: Props) {
  /* ── State ── */
  const [showLogo, setShowLogo] = useState(initialConfig.pdfShowLogo);
  const [showSignature, setShowSignature] = useState(initialConfig.pdfShowSignature);
  const [showNote, setShowNote] = useState(initialConfig.pdfShowNote);
  const [headerColor, setHeaderColor] = useState(initialConfig.pdfHeaderColor);
  const [companyName, setCompanyName] = useState(initialConfig.pdfCompanyName ?? "");
  const [companyAddress, setCompanyAddress] = useState(initialConfig.pdfCompanyAddress ?? "");
  const [companyPhone, setCompanyPhone] = useState(initialConfig.pdfCompanyPhone ?? "");

  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* ── Preview ── */
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSectionSheetOpen, setIsSectionSheetOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<PdfSection>("po");
  const [sectionEnabled, setSectionEnabled] = useState<Record<PdfSection, boolean>>({
    po: true,
    invoice: true,
    quotation: false,
    bill: false,
  });

  // Support deep link via ?section=po (and fallback ?tab=po for compatibility)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sectionParam = params.get("section") ?? params.get("tab");
      if (sectionParam) {
        const normalized = sectionParam.toLowerCase();
        if (["po", "invoice", "quotation", "bill"].includes(normalized)) {
          setActiveSection(normalized as PdfSection);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SECTION_ENABLE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<PdfSection, boolean>>;
      setSectionEnabled((prev) => ({
        ...prev,
        po: typeof parsed.po === "boolean" ? parsed.po : prev.po,
        invoice: typeof parsed.invoice === "boolean" ? parsed.invoice : prev.invoice,
        quotation: typeof parsed.quotation === "boolean" ? parsed.quotation : prev.quotation,
        bill: typeof parsed.bill === "boolean" ? parsed.bill : prev.bill,
      }));
    } catch {
      /* ignore invalid local storage */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SECTION_ENABLE_STORAGE_KEY, JSON.stringify(sectionEnabled));
    } catch {
      /* ignore write error */
    }
  }, [sectionEnabled]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const validColor = HEX_REGEX.test(headerColor);

  const isDirty = useMemo(() => {
    return (
      showLogo !== savedConfig.pdfShowLogo ||
      showSignature !== savedConfig.pdfShowSignature ||
      showNote !== savedConfig.pdfShowNote ||
      headerColor !== savedConfig.pdfHeaderColor ||
      (companyName || null) !== (savedConfig.pdfCompanyName ?? null) ||
      (companyAddress || null) !== (savedConfig.pdfCompanyAddress ?? null) ||
      (companyPhone || null) !== (savedConfig.pdfCompanyPhone ?? null)
    );
  }, [
    showLogo,
    showSignature,
    showNote,
    headerColor,
    companyName,
    companyAddress,
    companyPhone,
    savedConfig,
  ]);

  /* ── Save ── */
  const save = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!canUpdate) {
      setErrorMessage("ไม่มีสิทธิ์อัปเดตการตั้งค่า");
      return;
    }
    if (!validColor) {
      setErrorMessage("รหัสสีไม่ถูกต้อง (ต้องเป็น HEX เช่น #f1f5f9)");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<PdfConfig> = {
        pdfShowLogo: showLogo,
        pdfShowSignature: showSignature,
        pdfShowNote: showNote,
        pdfHeaderColor: headerColor,
        pdfCompanyName: companyName.trim() || null,
        pdfCompanyAddress: companyAddress.trim() || null,
        pdfCompanyPhone: companyPhone.trim() || null,
      };

      const res = await authFetch("/api/settings/store/pdf", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok) {
        setErrorMessage(data?.message ?? "บันทึกไม่สำเร็จ");
        return;
      }

      if (data?.config) {
        setSavedConfig(data.config);
        setShowLogo(data.config.pdfShowLogo);
        setShowSignature(data.config.pdfShowSignature);
        setShowNote(data.config.pdfShowNote);
        setHeaderColor(data.config.pdfHeaderColor);
        setCompanyName(data.config.pdfCompanyName ?? "");
        setCompanyAddress(data.config.pdfCompanyAddress ?? "");
        setCompanyPhone(data.config.pdfCompanyPhone ?? "");
      }
      setSuccessMessage("บันทึกการตั้งค่า PDF เรียบร้อยแล้ว");
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Generate Preview ── */
  const generatePreview = useCallback(async () => {
    setIsGeneratingPreview(true);
    try {
      const { generatePoPdf } = await import("@/lib/pdf/generate-po-pdf");

      const mockData = {
        poNumber: "PO-20260217-001",
        status: "ORDERED",
        supplierName: "บริษัท ซัพพลาย จำกัด",
        supplierContact: "020-1234-5678",
        purchaseCurrency: storeCurrency,
        exchangeRate: 1,
        shippingCost: 50000,
        otherCost: 10000,
        otherCostNote: "ค่าบรรจุภัณฑ์",
        note: showNote ? "ส่งของภายในวันพฤหัส กรุณาติดต่อก่อนจัดส่ง" : null,
        createdByName: "สมชาย ใจดี",
        createdAt: new Date().toISOString(),
        orderedAt: new Date().toISOString(),
        shippedAt: null,
        receivedAt: null,
        expectedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        trackingInfo: null,
        totalCostBase: 1_060_000,
        storeLogoUrl: showLogo ? storeLogoUrl : null,
        items: [
          {
            productName: "กาแฟคั่วเข้ม 500g",
            productSku: "COFFEE-DK-500",
            qtyOrdered: 100,
            unitCostBase: 8500,
          },
          {
            productName: "นมข้นหวาน 380ml",
            productSku: "MILK-SWEET-380",
            qtyOrdered: 200,
            unitCostBase: 1200,
          },
          {
            productName: "น้ำตาลทราย 1kg",
            productSku: "SUGAR-WH-1KG",
            qtyOrdered: 50,
            unitCostBase: 3200,
          },
        ],
      };

      const configOverride = {
        showLogo,
        showSignature,
        showNote,
        headerColor,
        companyName: companyName.trim() || null,
        companyAddress: companyAddress.trim() || null,
        companyPhone: companyPhone.trim() || null,
      };

      const blob = await generatePoPdf(
        mockData,
        storeCurrency as "LAK" | "THB" | "USD",
        configOverride,
      );

      // Revoke previous preview
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);

      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
      setIsPreviewOpen(true);
    } catch (err) {
      console.error("Preview error:", err);
      setErrorMessage("สร้าง Preview ไม่สำเร็จ");
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [
    showLogo,
    showSignature,
    showNote,
    headerColor,
    companyName,
    companyAddress,
    companyPhone,
    storeLogoUrl,
    storeCurrency,
    previewBlobUrl,
  ]);

  const toggleSectionEnabled = (section: PdfSection) => {
    setSectionEnabled((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const resetFormToSaved = useCallback(() => {
    setShowLogo(savedConfig.pdfShowLogo);
    setShowSignature(savedConfig.pdfShowSignature);
    setShowNote(savedConfig.pdfShowNote);
    setHeaderColor(savedConfig.pdfHeaderColor);
    setCompanyName(savedConfig.pdfCompanyName ?? "");
    setCompanyAddress(savedConfig.pdfCompanyAddress ?? "");
    setCompanyPhone(savedConfig.pdfCompanyPhone ?? "");
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [savedConfig]);

  const openSectionSheet = (section: PdfSection) => {
    setActiveSection(section);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSectionSheetOpen(true);
  };

  const closeSectionSheet = useCallback(() => {
    if (isSaving) return;
    if (isDirty) {
      const shouldDiscard = window.confirm("มีการแก้ไขที่ยังไม่บันทึก ต้องการปิดและยกเลิกการแก้ไขหรือไม่?");
      if (!shouldDiscard) return;
      resetFormToSaved();
    }
    setIsSectionSheetOpen(false);
  }, [isSaving, isDirty, resetFormToSaved]);

  /* ── UI ── */
  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  const toggleClassName = (active: boolean) =>
    `relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      active ? "bg-primary" : "bg-slate-200"
    }`;

  const toggleKnobClassName = (active: boolean) =>
    `pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
      active ? "translate-x-5" : "translate-x-0"
    }`;

  const activeSectionMeta =
    SECTION_ITEMS.find((item) => item.key === activeSection) ?? SECTION_ITEMS[0];

  return (
    <section className="space-y-4">
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-1 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">เมนูตั้งค่าเอกสาร PDF</p>
          <p className="text-xs text-slate-500">เลือกรายการ แล้วระบบจะเปิดฟอร์มในหน้าต่าง Slide-up</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {SECTION_ITEMS.map((section, index) => (
            <li key={section.key}>
              <button
                type="button"
                onClick={() => openSectionSheet(section.key)}
                className="group flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{section.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{section.description}</span>
                </span>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                    sectionEnabled[section.key]
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }`}
                >
                  {sectionEnabled[section.key] ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </article>

      <SlideUpSheet
        isOpen={isSectionSheetOpen}
        onClose={closeSectionSheet}
        title={`ตั้งค่า ${activeSectionMeta.label}`}
        description={activeSectionMeta.description}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {activeSection === "po" ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-1.5 px-4 sm:w-auto"
                onClick={generatePreview}
                disabled={isGeneratingPreview || !validColor}
              >
                {isGeneratingPreview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Preview PDF
              </Button>
            ) : null}
            <Button
              type="button"
              className="h-10 w-full px-4 sm:w-auto"
              onClick={save}
              disabled={isSaving || !isDirty || !validColor}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </span>
              ) : (
                "บันทึกการตั้งค่า"
              )}
            </Button>
          </div>
        }
        disabled={isSaving}
      >
        <div className="space-y-6 pb-2">
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              isDirty
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {isDirty ? (
              <CircleAlert className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {isDirty ? "ยังไม่บันทึก" : "บันทึกแล้ว"}
          </span>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">เปิดใช้งานเอกสารนี้</p>
                <p className="text-xs text-slate-500">สถานะนี้จะถูกจำไว้ในเบราว์เซอร์เครื่องปัจจุบัน</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={sectionEnabled[activeSection]}
                onClick={() => toggleSectionEnabled(activeSection)}
                className={toggleClassName(sectionEnabled[activeSection])}
                disabled={isSaving}
              >
                <span className={toggleKnobClassName(sectionEnabled[activeSection])} />
              </button>
            </div>
          </div>

          {activeSection === "po" ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">ตัวเอกสาร (PO)</p>
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-700">แสดงลายเซ็น</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showSignature}
                  onClick={() => setShowSignature(!showSignature)}
                  className={toggleClassName(showSignature)}
                  disabled={isSaving}
                >
                  <span className={toggleKnobClassName(showSignature)} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-700">แสดงหมายเหตุ</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showNote}
                  onClick={() => setShowNote(!showNote)}
                  className={toggleClassName(showNote)}
                  disabled={isSaving}
                >
                  <span className={toggleKnobClassName(showNote)} />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              ฟอร์มเฉพาะของ {activeSectionMeta.label} จะเพิ่มในขั้นถัดไป ตอนนี้ปรับสถานะเปิด/ปิดได้แล้ว
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">ตั้งค่ารวม (ทุกเอกสาร)</p>
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-700">แสดง Logo ร้าน</label>
              <button
                type="button"
                role="switch"
                aria-checked={showLogo}
                onClick={() => setShowLogo(!showLogo)}
                className={toggleClassName(showLogo)}
                disabled={isSaving}
              >
                <span className={toggleKnobClassName(showLogo)} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">สีหัวตาราง</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setHeaderColor(c.value)}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all ${
                    headerColor === c.value
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  disabled={isSaving}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-slate-300"
                    style={{ backgroundColor: c.value }}
                  />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">ข้อมูลบริษัท (แสดงบน PDF)</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="pdf-company-name">ชื่อบริษัท / ร้านค้า</label>
              <input
                id="pdf-company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="เว้นว่างจะไม่แสดง"
                className={fieldClassName}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="pdf-company-address">ที่อยู่</label>
              <input
                id="pdf-company-address"
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="เว้นว่างจะไม่แสดง"
                className={fieldClassName}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="pdf-company-phone">เบอร์โทร</label>
              <input
                id="pdf-company-phone"
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="เว้นว่างจะไม่แสดง"
                className={fieldClassName}
                disabled={isSaving}
              />
            </div>
          </div>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
        </div>
      </SlideUpSheet>

      {/* ── Preview SlideUpSheet ── */}
      <SlideUpSheet
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl(null);
          }
        }}
        title="ตัวอย่าง PDF"
        description="Preview จากข้อมูลตัวอย่าง (mock data)"
      >
        {previewBlobUrl && (
          <iframe
            src={previewBlobUrl}
            className="h-[75vh] w-full rounded-lg border border-slate-100"
            title="PDF Preview"
          />
        )}
      </SlideUpSheet>
    </section>
  );
}
