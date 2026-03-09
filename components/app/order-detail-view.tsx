"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowDownToLine, Expand, ExternalLink, X } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  ManagerCancelApprovalModal,
  type ManagerCancelApprovalPayload,
  type ManagerCancelApprovalResult,
} from "@/components/app/manager-cancel-approval-modal";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import {
  currencyLabel,
  currencySymbol,
  parseStoreCurrency,
  vatModeLabel,
} from "@/lib/finance/store-financial";
import { compressRasterImageFile, validateRasterImageFile } from "@/lib/media/client-image";
import { RASTER_IMAGE_ACCEPT } from "@/lib/media/image-upload";
import type { OrderCatalogPaymentAccount, OrderDetail } from "@/lib/orders/queries";
import { maskAccountValue } from "@/lib/payments/store-payment";

type MessagingInfo = {
  within24h: boolean;
  template: string;
  waDeepLink: string | null;
  facebookInboxUrl: string;
};

type OrderDetailViewProps = {
  order: OrderDetail;
  qrPaymentAccounts: OrderCatalogPaymentAccount[];
  messaging: MessagingInfo;
  canUpdate: boolean;
  canMarkPaid: boolean;
  canPack: boolean;
  canShip: boolean;
  canCodReturn: boolean;
  canCancel: boolean;
  canSelfApproveCancel: boolean;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

const statusLabel: Record<OrderDetail["status"], string> = {
  DRAFT: "ร่าง",
  PENDING_PAYMENT: "ค้างจ่าย",
  READY_FOR_PICKUP: "รอรับที่ร้าน",
  PICKED_UP_PENDING_PAYMENT: "รับสินค้าแล้ว (ค้างจ่าย)",
  PAID: "ชำระแล้ว",
  PACKED: "แพ็กแล้ว",
  SHIPPED: "จัดส่งแล้ว",
  COD_RETURNED: "COD ตีกลับ",
  CANCELLED: "ยกเลิก",
};

const channelLabel: Record<OrderDetail["channel"], string> = {
  WALK_IN: "Walk-in",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
};

const paymentMethodLabel: Record<OrderDetail["paymentMethod"], string> = {
  CASH: "เงินสด",
  LAO_QR: "QR โอนเงิน",
  ON_CREDIT: "ค้างจ่าย",
  COD: "COD",
  BANK_TRANSFER: "โอนเงิน",
};

const paymentStatusLabel: Record<OrderDetail["paymentStatus"], string> = {
  UNPAID: "ยังไม่ชำระ",
  PENDING_PROOF: "รอตรวจหลักฐาน",
  PAID: "ชำระแล้ว",
  COD_PENDING_SETTLEMENT: "COD รอปิดยอด",
  COD_SETTLED: "COD ปิดยอดแล้ว",
  FAILED: "ล้มเหลว",
};

const shippingLabelStatusLabel: Record<OrderDetail["shippingLabelStatus"], string> = {
  NONE: "ยังไม่สร้าง",
  REQUESTED: "กำลังสร้าง",
  READY: "พร้อมใช้งาน",
  FAILED: "สร้างไม่สำเร็จ",
};

const SHIPPING_LABEL_MAX_SIZE_MB = 6;
const SHIPPING_LABEL_MAX_SIZE_BYTES = SHIPPING_LABEL_MAX_SIZE_MB * 1024 * 1024;

export function OrderDetailView({
  order,
  qrPaymentAccounts,
  messaging,
  canUpdate,
  canMarkPaid,
  canPack,
  canShip,
  canCodReturn,
  canCancel,
  canSelfApproveCancel,
}: OrderDetailViewProps) {
  const router = useRouter();

  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [shippingLabelUrl, setShippingLabelUrl] = useState(order.shippingLabelUrl ?? "");
  const [codSettlementAmount, setCodSettlementAmount] = useState(
    String(order.codAmount > 0 ? order.codAmount : order.total),
  );
  const [codReturnFeeInput, setCodReturnFeeInput] = useState("");
  const [codReturnNoteInput, setCodReturnNoteInput] = useState(order.codReturnNote ?? "");
  const [messageText, setMessageText] = useState(messaging.template);
  const [receiptPrintLoading, setReceiptPrintLoading] = useState(false);
  const [labelPrintLoading, setLabelPrintLoading] = useState(false);
  const [showConfirmPaidConfirmModal, setShowConfirmPaidConfirmModal] = useState(false);
  const [showConfirmPickupBeforePaidModal, setShowConfirmPickupBeforePaidModal] = useState(false);
  const [showCancelApprovalModal, setShowCancelApprovalModal] = useState(false);
  const [showConfirmPaidQrImageViewer, setShowConfirmPaidQrImageViewer] = useState(false);
  const [showOrderQrImageViewer, setShowOrderQrImageViewer] = useState(false);
  const [showShippingLabelSourcePicker, setShowShippingLabelSourcePicker] = useState(false);
  const [showDeleteShippingLabelConfirm, setShowDeleteShippingLabelConfirm] = useState(false);
  const [confirmPaidPaymentMethod, setConfirmPaidPaymentMethod] = useState<"CASH" | "LAO_QR">("CASH");
  const [confirmPaidPaymentAccountId, setConfirmPaidPaymentAccountId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [shippingLabelUploadError, setShippingLabelUploadError] = useState<string | null>(null);
  const shippingLabelFileInputRef = useRef<HTMLInputElement | null>(null);
  const shippingLabelCameraInputRef = useRef<HTMLInputElement | null>(null);

  const isCodPendingAfterShipped =
    order.paymentMethod === "COD" &&
    order.status === "SHIPPED" &&
    order.paymentStatus === "COD_PENDING_SETTLEMENT";
  const isWalkInOrder = order.channel === "WALK_IN";
  const isPickupReadyPrepaid =
    order.paymentMethod !== "COD" &&
    order.status === "READY_FOR_PICKUP" &&
    order.paymentStatus === "PAID";
  const isInStoreCreditSettlement =
    isWalkInOrder &&
    order.paymentMethod === "ON_CREDIT" &&
    ((order.status === "PENDING_PAYMENT" && order.paymentStatus !== "PAID") ||
      (order.status === "READY_FOR_PICKUP" && order.paymentStatus !== "PAID") ||
      (order.status === "PICKED_UP_PENDING_PAYMENT" && order.paymentStatus !== "PAID"));
  const isPickupOrder =
    order.status === "READY_FOR_PICKUP" ||
    order.status === "PICKED_UP_PENDING_PAYMENT" ||
    isPickupReadyPrepaid;
  const isOnlineOrder = !isWalkInOrder;
  const isWalkInPaidComplete =
    isWalkInOrder &&
    order.status === "PAID" &&
    order.paymentStatus === "PAID";
  const canConfirmPaid =
    canMarkPaid &&
    (isCodPendingAfterShipped ||
      (order.paymentMethod !== "COD" &&
        (order.status === "PENDING_PAYMENT" ||
          order.status === "READY_FOR_PICKUP" ||
          order.status === "PICKED_UP_PENDING_PAYMENT")));
  const canMarkPickupBeforePaid =
    canMarkPaid &&
    order.paymentMethod !== "COD" &&
    order.status === "READY_FOR_PICKUP" &&
    order.paymentStatus !== "PAID";
  const canMarkPacked =
    !isWalkInPaidComplete &&
    canPack &&
    (order.status === "PAID" ||
      (order.paymentMethod === "COD" &&
        order.status === "PENDING_PAYMENT" &&
        order.paymentStatus === "COD_PENDING_SETTLEMENT"));
  const canMarkShipped = !isWalkInPaidComplete && canShip && order.status === "PACKED";
  const canMarkCodReturned =
    canCodReturn &&
    order.paymentMethod === "COD" &&
    order.status === "SHIPPED" &&
    order.paymentStatus === "COD_PENDING_SETTLEMENT";
  const canRequestOrderCancel = canCancel || canUpdate;
  const canOrderCancel =
    canRequestOrderCancel &&
    (order.status === "DRAFT" ||
      order.status === "PENDING_PAYMENT" ||
      order.status === "READY_FOR_PICKUP" ||
      order.status === "PICKED_UP_PENDING_PAYMENT" ||
      order.status === "PAID" ||
      order.status === "PACKED" ||
      order.status === "SHIPPED");
  const cancelIsHighRisk =
    order.status === "PAID" || order.status === "PACKED" || order.status === "SHIPPED";
  const orderFlowLabel = isOnlineOrder
    ? "สั่งออนไลน์/จัดส่ง"
    : isPickupOrder
      ? "มารับที่ร้านภายหลัง"
      : "Walk-in ทันที";
  const showShippingSection =
    isOnlineOrder ||
    Boolean(
      order.shippingProvider ||
        order.shippingCarrier ||
        order.trackingNo ||
        order.shippingLabelUrl ||
        order.shippingCost > 0,
    );
  const isLaoQrOrder = order.paymentMethod === "LAO_QR";
  const showLaoQrMessaging = order.paymentMethod === "LAO_QR" && isOnlineOrder;
  const showWhatsappMessagingAction = order.channel === "WHATSAPP" && Boolean(messaging.waDeepLink);
  const showFacebookMessagingAction =
    order.channel === "FACEBOOK" && Boolean(messaging.facebookInboxUrl);
  const messagingActionCount =
    1 + (showWhatsappMessagingAction ? 1 : 0) + (showFacebookMessagingAction ? 1 : 0);
  const canOpenShippingLabelCamera = typeof window !== "undefined" && "mediaDevices" in navigator;
  const storeCurrencyDisplay = currencySymbol(parseStoreCurrency(order.storeCurrency));
  const paymentCurrencyDisplay = currencyLabel(order.paymentCurrency);
  const customerNameDisplay =
    (order.customerName || order.contactDisplayName || (isWalkInOrder ? "ลูกค้าหน้าร้าน" : "ลูกค้าทั่วไป")).trim();
  const customerPhoneDisplay = (order.customerPhone || order.contactPhone || "").trim();
  const customerAddressDisplay = (order.customerAddress || "").trim();
  const hasMeaningfulCustomerSection =
    customerNameDisplay !== "ลูกค้าหน้าร้าน" ||
    customerPhoneDisplay.length > 0 ||
    customerAddressDisplay.length > 0;
  const showCustomerSection = !isWalkInPaidComplete || hasMeaningfulCustomerSection;
  const showCancelApprovalSummary =
    order.status === "CANCELLED" && Boolean(order.cancelApproval);
  const cancelApprovedAtLabel = order.cancelApproval
    ? new Date(order.cancelApproval.approvedAt).toLocaleString("th-TH")
    : "";
  const codCollectedAmount =
    order.paymentMethod === "COD" && order.paymentStatus === "COD_SETTLED"
      ? (order.codAmount > 0 ? order.codAmount : order.total)
      : 0;
  const codShippingMargin = order.shippingFeeCharged - order.shippingCost;
  const codNetOutcome =
    order.paymentMethod === "COD"
      ? order.paymentStatus === "COD_SETTLED"
        ? codCollectedAmount - order.shippingCost
        : order.status === "COD_RETURNED" || isCodPendingAfterShipped
          ? -order.shippingCost
          : 0
      : 0;

  const codSettlementAmountNumber = useMemo(
    () => Number(codSettlementAmount || "0"),
    [codSettlementAmount],
  );
  const codReturnFeeNumber = useMemo(() => Number(codReturnFeeInput || "0"), [codReturnFeeInput]);
  const defaultPickupQrPaymentAccountId = useMemo(
    () => qrPaymentAccounts.find((account) => account.isDefault)?.id ?? qrPaymentAccounts[0]?.id ?? "",
    [qrPaymentAccounts],
  );
  const selectedConfirmPaidQrAccount = useMemo(
    () => qrPaymentAccounts.find((account) => account.id === confirmPaidPaymentAccountId) ?? null,
    [confirmPaidPaymentAccountId, qrPaymentAccounts],
  );
  const openConfirmPaidConfirmModal = useCallback(() => {
    if (isInStoreCreditSettlement) {
      setConfirmPaidPaymentMethod("CASH");
      setConfirmPaidPaymentAccountId(defaultPickupQrPaymentAccountId);
    }
    setShowConfirmPaidQrImageViewer(false);
    setShowConfirmPaidConfirmModal(true);
    setErrorMessage(null);
  }, [defaultPickupQrPaymentAccountId, isInStoreCreditSettlement]);
  const getConfirmPaidQrImageActionUrl = useCallback(
    (download = false) => {
      if (!selectedConfirmPaidQrAccount?.id) {
        return null;
      }
      return `/api/orders/payment-accounts/${selectedConfirmPaidQrAccount.id}/qr-image${
        download ? "?download=1" : ""
      }`;
    },
    [selectedConfirmPaidQrAccount],
  );
  const getOrderQrImageActionUrl = useCallback(
    (download = false) => {
      if (!order.paymentAccountId) {
        return null;
      }
      return `/api/orders/payment-accounts/${order.paymentAccountId}/qr-image${
        download ? "?download=1" : ""
      }`;
    },
    [order.paymentAccountId],
  );
  const runPatchAction = useCallback(
    async (
      payload: Record<string, unknown>,
      key: string,
      successText: string,
    ): Promise<ManagerCancelApprovalResult> => {
      setLoadingKey(key);
      setErrorMessage(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
          }
        | null;

      if (!response.ok) {
        const message = data?.message ?? "บันทึกไม่สำเร็จ";
        setErrorMessage(message);
        setLoadingKey(null);
        return { ok: false, message };
      }

      setSuccessMessage(successText);
      setLoadingKey(null);
      router.refresh();
      return { ok: true };
    },
    [order.id, router],
  );

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setSuccessMessage("คัดลอกข้อความแล้ว");
    } catch {
      setErrorMessage("คัดลอกข้อความไม่สำเร็จ");
    }
  };

  const openConfirmPaidQrImageFull = useCallback(() => {
    if (!selectedConfirmPaidQrAccount?.qrImageUrl) {
      return;
    }
    setShowConfirmPaidQrImageViewer(true);
  }, [selectedConfirmPaidQrAccount]);

  const openOrderQrImageFull = useCallback(() => {
    if (!order.paymentAccountQrImageUrl) {
      return;
    }
    setShowOrderQrImageViewer(true);
  }, [order.paymentAccountQrImageUrl]);

  const openOrderQrImageInNewTab = useCallback(() => {
    if (!order.paymentAccountQrImageUrl) {
      return;
    }
    const targetUrl = getOrderQrImageActionUrl(false) ?? order.paymentAccountQrImageUrl;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [getOrderQrImageActionUrl, order.paymentAccountQrImageUrl]);

  const openConfirmPaidQrImageInNewTab = useCallback(() => {
    if (!selectedConfirmPaidQrAccount?.qrImageUrl) {
      return;
    }
    const targetUrl =
      getConfirmPaidQrImageActionUrl(false) ?? selectedConfirmPaidQrAccount.qrImageUrl;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [getConfirmPaidQrImageActionUrl, selectedConfirmPaidQrAccount]);

  const downloadConfirmPaidQrImage = useCallback(async () => {
    if (!selectedConfirmPaidQrAccount?.qrImageUrl) {
      return;
    }

    const safeFileName = selectedConfirmPaidQrAccount.displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    try {
      const response = await fetch(
        getConfirmPaidQrImageActionUrl(true) ?? selectedConfirmPaidQrAccount.qrImageUrl,
      );
      if (!response.ok) {
        throw new Error("DOWNLOAD_FAILED");
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${safeFileName || "pickup-qr-payment"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success("ดาวน์โหลดรูป QR แล้ว");
    } catch {
      const fallbackUrl =
        getConfirmPaidQrImageActionUrl(false) ?? selectedConfirmPaidQrAccount.qrImageUrl;
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      toast("เปิดรูป QR ในแท็บใหม่แทน");
    }
  }, [getConfirmPaidQrImageActionUrl, selectedConfirmPaidQrAccount]);

  const downloadOrderQrImage = useCallback(async () => {
    if (!order.paymentAccountQrImageUrl) {
      return;
    }

    const safeFileName = (order.paymentAccountDisplayName || "payment-qr")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    try {
      const response = await fetch(getOrderQrImageActionUrl(true) ?? order.paymentAccountQrImageUrl);
      if (!response.ok) {
        throw new Error("DOWNLOAD_FAILED");
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${safeFileName || "payment-qr"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success("ดาวน์โหลดรูป QR แล้ว");
    } catch {
      const fallbackUrl = getOrderQrImageActionUrl(false) ?? order.paymentAccountQrImageUrl;
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      toast("เปิดรูป QR ในแท็บใหม่แทน");
    }
  }, [
    getOrderQrImageActionUrl,
    order.paymentAccountDisplayName,
    order.paymentAccountQrImageUrl,
  ]);

  const copyConfirmPaidQrAccountNumber = useCallback(async () => {
    if (!selectedConfirmPaidQrAccount?.accountNumber) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedConfirmPaidQrAccount.accountNumber);
      toast.success("คัดลอกเลขบัญชีแล้ว");
    } catch {
      toast.error("คัดลอกเลขบัญชีไม่สำเร็จ");
    }
  }, [selectedConfirmPaidQrAccount]);

  const uploadShippingLabelImage = async (file: File, source: "file" | "camera") => {
    const setUploadError = (message: string) => {
      setShippingLabelUploadError(message);
      toast.error(message);
    };

    setLoadingKey(source === "camera" ? "upload-label-camera" : "upload-label-file");
    setShippingLabelUploadError(null);
    setSuccessMessage(null);

    if (!file.type.startsWith("image/")) {
      setUploadError("รองรับเฉพาะไฟล์รูปภาพ");
      setLoadingKey(null);
      return;
    }

    if (file.size > SHIPPING_LABEL_MAX_SIZE_BYTES) {
      setUploadError(`ไฟล์รูปใหญ่เกินกำหนด (ไม่เกิน ${SHIPPING_LABEL_MAX_SIZE_MB}MB)`);
      setLoadingKey(null);
      return;
    }

    try {
      const formData = new FormData();
      formData.set("image", file);
      formData.set("source", source);

      const response = await fetch(`/api/orders/${order.id}/shipments/upload-label`, {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
            labelUrl?: string;
          }
        | null;

      if (!response.ok) {
        setUploadError(data?.message ?? "อัปโหลดรูปบิล/ป้ายจัดส่งไม่สำเร็จ");
        return;
      }

      if (!data?.labelUrl) {
        setUploadError("ไม่พบลิงก์รูปที่อัปโหลด");
        return;
      }

      setShippingLabelUrl(data.labelUrl);
      const patchResponse = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_shipping",
          shippingCarrier: order.shippingCarrier ?? "",
          trackingNo: order.trackingNo ?? "",
          shippingLabelUrl: data.labelUrl,
          shippingCost: order.shippingCost,
        }),
      });
      const patchData = (await patchResponse.json().catch(() => null)) as
        | {
            message?: string;
          }
        | null;

      if (!patchResponse.ok) {
        setUploadError(patchData?.message ?? "อัปโหลดรูปสำเร็จ แต่บันทึกข้อมูลจัดส่งไม่สำเร็จ");
        return;
      }

      setShippingLabelUploadError(null);
      setSuccessMessage(
        source === "camera"
          ? "ถ่ายรูปและบันทึกป้ายจัดส่งแล้ว"
          : "อัปโหลดและบันทึกป้ายจัดส่งแล้ว",
      );
      router.refresh();
    } catch {
      setUploadError("อัปโหลดรูปบิล/ป้ายจัดส่งไม่สำเร็จ");
    } finally {
      setLoadingKey(null);
    }
  };

  const removeShippingLabelImage = async () => {
    const result = await runPatchAction(
      {
        action: "update_shipping",
        shippingCarrier: order.shippingCarrier ?? "",
        trackingNo: order.trackingNo ?? "",
        shippingLabelUrl: "",
        shippingCost: order.shippingCost,
      },
      "remove-shipping-label",
      "ลบรูปป้ายจัดส่งแล้ว",
    );
    if (result.ok) {
      setShippingLabelUrl("");
      setShowDeleteShippingLabelConfirm(false);
    }
    return result;
  };

  const openShippingLabelSourcePicker = useCallback(() => {
    if (!canUpdate || loadingKey !== null) {
      return;
    }
    setShippingLabelUploadError(null);
    setShowShippingLabelSourcePicker(true);
  }, [canUpdate, loadingKey]);

  const closeShippingLabelSourcePicker = useCallback(() => {
    if (loadingKey !== null) {
      return;
    }
    setShowShippingLabelSourcePicker(false);
  }, [loadingKey]);

  const pickShippingLabelFromDevice = useCallback(
    (source: "file" | "camera") => {
      if (loadingKey !== null) {
        return;
      }
      setShowShippingLabelSourcePicker(false);
      if (source === "camera") {
        shippingLabelCameraInputRef.current?.click();
        return;
      }
      shippingLabelFileInputRef.current?.click();
    },
    [loadingKey],
  );

  const handleShippingLabelFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
    source: "file" | "camera",
  ) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    const validation = validateRasterImageFile(file);
    if (!validation.ok) {
      setShippingLabelUploadError(validation.message);
      toast.error(validation.message);
      return;
    }

    setShippingLabelUploadError(null);

    try {
      const optimizedFile = await compressRasterImageFile(file, {
        maxWidth: 1600,
        quality: 0.82,
        fileNameBase: `${order.orderNo}-shipping-label`,
      });
      await uploadShippingLabelImage(optimizedFile, source);
    } catch {
      const message =
        "เตรียมรูปป้ายจัดส่งไม่สำเร็จ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ที่เล็กลง";
      setShippingLabelUploadError(message);
      toast.error(message);
    }
  };

  const buildReceiptPrintMarkup = useCallback(() => {
    const rows = order.items
      .map(
        (item) => `<tr>
          <td style="padding:4px 0;vertical-align:top;">
            <div>${escapeHtml(item.productName)}</div>
            <div style="font-size:10px;color:#475569;">${escapeHtml(item.productSku)}</div>
          </td>
          <td style="padding:4px 0;text-align:right;white-space:nowrap;">${item.qty.toLocaleString("th-TH")} ${escapeHtml(item.unitCode)}</td>
          <td style="padding:4px 0;text-align:right;white-space:nowrap;">${item.lineTotal.toLocaleString("th-TH")}</td>
        </tr>`,
      )
      .join("");

    return `<section class="print-page print-receipt">
      <h1 style="margin:0;text-align:center;font-size:14px;font-weight:700;">ใบเสร็จรับเงิน</h1>
      <p style="margin:4px 0 0;text-align:center;font-size:11px;">เลขที่ ${escapeHtml(order.orderNo)}</p>
      <p style="margin:8px 0 0;font-size:11px;">ลูกค้า: ${escapeHtml(order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป")}</p>
      <p style="margin:2px 0 0;font-size:11px;">วันที่: ${escapeHtml(new Date(order.createdAt).toLocaleString("th-TH"))}</p>
      <hr style="border:0;border-top:1px dashed #64748b;margin:8px 0;" />
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:0 0 4px;">รายการ</th>
            <th style="text-align:right;padding:0 0 4px;">จำนวน</th>
            <th style="text-align:right;padding:0 0 4px;">รวม</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <hr style="border:0;border-top:1px dashed #64748b;margin:8px 0;" />
      <div style="font-size:11px;display:flex;justify-content:space-between;gap:8px;"><span>ยอดสินค้า</span><span>${order.subtotal.toLocaleString("th-TH")}</span></div>
      <div style="font-size:11px;display:flex;justify-content:space-between;gap:8px;"><span>ส่วนลด</span><span>${order.discount.toLocaleString("th-TH")}</span></div>
      <div style="font-size:11px;display:flex;justify-content:space-between;gap:8px;"><span>VAT</span><span>${order.vatAmount.toLocaleString("th-TH")} (${escapeHtml(vatModeLabel(order.storeVatMode))})</span></div>
      <div style="font-size:11px;display:flex;justify-content:space-between;gap:8px;"><span>ค่าส่ง</span><span>${order.shippingFeeCharged.toLocaleString("th-TH")}</span></div>
      <div style="font-size:12px;font-weight:700;display:flex;justify-content:space-between;gap:8px;"><span>ยอดสุทธิ</span><span>${order.total.toLocaleString("th-TH")} ${escapeHtml(storeCurrencyDisplay)}</span></div>
      <div style="font-size:11px;display:flex;justify-content:space-between;gap:8px;"><span>สกุลชำระ</span><span>${escapeHtml(paymentCurrencyDisplay)}</span></div>
      <div style="font-size:11px;display:flex;justify-content:space-between;gap:8px;"><span>วิธีชำระ</span><span>${escapeHtml(paymentMethodLabel[order.paymentMethod])}</span></div>
      <hr style="border:0;border-top:1px dashed #64748b;margin:8px 0;" />
      <p style="margin:0;text-align:center;font-size:11px;">ขอบคุณที่ใช้บริการ</p>
    </section>`;
  }, [order, paymentCurrencyDisplay, storeCurrencyDisplay]);

  const buildLabelPrintMarkup = useCallback(() => {
    return `<section class="print-page print-label">
      <div style="border:1px solid #0f172a;padding:12px;min-height:136mm;display:flex;flex-direction:column;justify-content:space-between;">
        <section>
          <h1 style="margin:0;font-size:18px;font-weight:700;">ป้ายจัดส่ง A6</h1>
          <p style="margin:4px 0 0;font-size:14px;">ออเดอร์ ${escapeHtml(order.orderNo)}</p>
          <p style="margin:2px 0 0;font-size:13px;">สถานะ: ${escapeHtml(statusLabel[order.status])}</p>
        </section>
        <section style="margin-top:10px;">
          <p style="margin:0 0 6px;font-size:12px;color:#475569;">ผู้รับ</p>
          <p style="margin:0;font-size:20px;font-weight:700;line-height:1.2;">${escapeHtml(order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป")}</p>
          <p style="margin:6px 0 0;font-size:15px;">โทร: ${escapeHtml(order.customerPhone || order.contactPhone || "-")}</p>
          <p style="margin:6px 0 0;font-size:15px;white-space:pre-wrap;line-height:1.35;">${escapeHtml(order.customerAddress || "-")}</p>
        </section>
        <section style="border-top:1px dashed #64748b;padding-top:8px;margin-top:12px;font-size:13px;line-height:1.5;">
          <p style="margin:0;">ขนส่ง: ${escapeHtml(order.shippingProvider || order.shippingCarrier || "-")}</p>
          <p style="margin:0;">Tracking: ${escapeHtml(order.trackingNo || "-")}</p>
          <p style="margin:0;">ต้นทุนค่าส่ง: ${order.shippingCost.toLocaleString("th-TH")} ${escapeHtml(storeCurrencyDisplay)}</p>
        </section>
      </div>
    </section>`;
  }, [order, storeCurrencyDisplay]);

  const printViaWindow = useCallback(
    (kind: "receipt" | "label") => {
      if (typeof window === "undefined") {
        return;
      }

      setErrorMessage(null);
      if (kind === "receipt") {
        setReceiptPrintLoading(true);
      } else {
        setLabelPrintLoading(true);
      }

      const printRootId = "order-detail-inline-print-root";
      const printStyleId = "order-detail-inline-print-style";

      document.getElementById(printRootId)?.remove();
      document.getElementById(printStyleId)?.remove();

      const printRoot = document.createElement("div");
      printRoot.id = printRootId;
      printRoot.setAttribute("aria-hidden", "true");
      printRoot.innerHTML = kind === "receipt" ? buildReceiptPrintMarkup() : buildLabelPrintMarkup();

      const printStyle = document.createElement("style");
      printStyle.id = printStyleId;
      printStyle.textContent = `
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
          }
          body > *:not(#${printRootId}) {
            display: none !important;
          }
          #${printRootId} {
            display: block !important;
          }
          #${printRootId} .print-page {
            color: #000000;
            font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
          }
          #${printRootId} .print-receipt {
            width: 80mm;
            margin: 0 auto;
            padding: 2mm;
            font-size: 12px;
            line-height: 1.35;
          }
          #${printRootId} .print-label {
            width: 105mm;
            margin: 0 auto;
            padding: 4mm;
            font-size: 14px;
            line-height: 1.35;
          }
        }
      `;
      document.head.appendChild(printStyle);
      document.body.appendChild(printRoot);

      const cleanup = () => {
        if (printRoot.parentNode) {
          printRoot.parentNode.removeChild(printRoot);
        }
        if (printStyle.parentNode) {
          printStyle.parentNode.removeChild(printStyle);
        }
      };

      let settled = false;
      const settleLoading = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (kind === "receipt") {
          setReceiptPrintLoading(false);
        } else {
          setLabelPrintLoading(false);
        }
      };

      const handleAfterPrint = () => {
        settleLoading();
        cleanup();
      };
      window.addEventListener("afterprint", handleAfterPrint, { once: true });

      window.setTimeout(() => {
        settleLoading();
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
            setErrorMessage(kind === "receipt" ? "ไม่สามารถพิมพ์ใบเสร็จได้" : "ไม่สามารถพิมพ์ป้ายจัดส่งได้");
            settleLoading();
            cleanup();
          }
        });
      });
    },
    [buildLabelPrintMarkup, buildReceiptPrintMarkup],
  );

  const confirmPaidButtonLabel = isCodPendingAfterShipped
    ? "ยืนยันรับเงินปลายทาง (COD)"
    : isPickupReadyPrepaid
      ? "ยืนยันรับสินค้า"
      : isOnlineOrder && order.paymentMethod === "LAO_QR" && order.paymentStatus === "PENDING_PROOF"
        ? "ตรวจสลิปและยืนยันชำระ"
        : isOnlineOrder
          ? "ยืนยันชำระแล้ว"
          : "ยืนยันรับชำระ";
  const confirmPaidSuccessText = isCodPendingAfterShipped
    ? "ปิดยอด COD แล้ว"
    : isPickupReadyPrepaid
      ? "ยืนยันรับสินค้าแล้ว"
      : isOnlineOrder
        ? "บันทึกว่าออเดอร์ชำระแล้ว"
        : "ยืนยันชำระแล้ว";
  const confirmPaidDisabled =
    !canConfirmPaid ||
    loadingKey !== null ||
    (isCodPendingAfterShipped &&
      (!Number.isFinite(codSettlementAmountNumber) || codSettlementAmountNumber < 0)) ||
    (isInStoreCreditSettlement &&
      confirmPaidPaymentMethod === "LAO_QR" &&
      !selectedConfirmPaidQrAccount);
  const shouldConfirmReceivePaymentAction = !isCodPendingAfterShipped && !isPickupReadyPrepaid;
  const shouldConfirmPickupReceiveAction = isPickupReadyPrepaid;
  const confirmPaidConfirmTitle = isPickupReadyPrepaid
    ? "ยืนยันรับสินค้าแล้ว?"
    : isCodPendingAfterShipped
      ? "ยืนยันรับเงินปลายทาง (COD)?"
      : confirmPaidButtonLabel === "ตรวจสลิปและยืนยันชำระ"
        ? "ตรวจสลิปและยืนยันชำระ?"
        : "ยืนยันชำระแล้ว?";
  const runConfirmPaidAction = async () => {
    const pickupSettlementPayload =
      isInStoreCreditSettlement
        ? {
            paymentMethod: confirmPaidPaymentMethod,
            paymentAccountId:
              confirmPaidPaymentMethod === "LAO_QR" ? confirmPaidPaymentAccountId : undefined,
          }
        : {};
    const result = await runPatchAction(
      {
        action: "confirm_paid",
        codAmount:
          isCodPendingAfterShipped && Number.isFinite(codSettlementAmountNumber)
            ? Math.max(0, Math.trunc(codSettlementAmountNumber))
            : undefined,
        ...pickupSettlementPayload,
      },
      "confirm-paid",
      confirmPaidSuccessText,
    );
    if (result.ok) {
      setShowConfirmPaidConfirmModal(false);
    }
    return result;
  };
  const pickupBeforePaidDisabled = !canMarkPickupBeforePaid || loadingKey !== null;
  const runMarkPickupBeforePaidAction = async () => {
    const result = await runPatchAction(
      {
        action: "mark_picked_up_unpaid",
      },
      "mark-picked-up-unpaid",
      "ยืนยันรับสินค้าแบบค้างจ่ายแล้ว",
    );
    if (result.ok) {
      setShowConfirmPickupBeforePaidModal(false);
    }
    return result;
  };
  const codReturnDisabled =
    !canMarkCodReturned ||
    loadingKey !== null ||
    !Number.isFinite(codReturnFeeNumber) ||
    codReturnFeeNumber < 0;
  const submitCancelWithApproval = async ({
    approvalEmail,
    approvalPassword,
    cancelReason,
  }: ManagerCancelApprovalPayload): Promise<ManagerCancelApprovalResult> => {
    const result = await runPatchAction(
      {
        action: "cancel",
        approvalEmail,
        approvalPassword,
        cancelReason,
      },
      "cancel",
      "ยกเลิกออเดอร์แล้ว",
    );
    if (!result.ok) {
      return result;
    }
    setShowCancelApprovalModal(false);
    return { ok: true };
  };

  const selectedConfirmPaidQrBankDisplay = selectedConfirmPaidQrAccount?.bankName?.trim() || "-";

  useEffect(() => {
    if (!showConfirmPaidQrImageViewer) {
      return;
    }
    if (!selectedConfirmPaidQrAccount?.qrImageUrl) {
      setShowConfirmPaidQrImageViewer(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowConfirmPaidQrImageViewer(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedConfirmPaidQrAccount, showConfirmPaidQrImageViewer]);

  useEffect(() => {
    if (!showOrderQrImageViewer) {
      return;
    }
    if (!order.paymentAccountQrImageUrl) {
      setShowOrderQrImageViewer(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowOrderQrImageViewer(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [order.paymentAccountQrImageUrl, showOrderQrImageViewer]);

  const timelineSteps = useMemo(() => {
    if (isOnlineOrder) {
      const labels =
        order.paymentMethod === "COD"
          ? ["สร้างออเดอร์", "แพ็กสินค้า", "จัดส่ง", "ปิดยอด COD"]
          : ["สร้างออเดอร์", "ยืนยันชำระ", "แพ็กสินค้า", "จัดส่ง"];
      let currentStep = 0;
      if (order.paymentMethod === "COD") {
        if (order.status === "PENDING_PAYMENT") {
          currentStep = 1;
        } else if (order.status === "PACKED") {
          currentStep = 2;
        } else if (order.status === "SHIPPED") {
          currentStep = 3;
        }
        if (order.paymentStatus === "COD_SETTLED" || order.status === "COD_RETURNED") {
          currentStep = 3;
        }
      } else {
        if (order.status === "PENDING_PAYMENT" || order.status === "READY_FOR_PICKUP") {
          currentStep = 1;
        } else if (order.status === "PAID") {
          currentStep = 2;
        } else if (order.status === "PACKED" || order.status === "SHIPPED") {
          currentStep = 3;
        }
      }
      return labels.map((label, index) => ({
        label,
        state: index < currentStep ? "done" : index === currentStep ? "current" : "todo",
      }));
    }

    if (isPickupOrder) {
      const labels = ["สร้างออเดอร์", "จองรอรับ", "รับสินค้า", "เสร็จสิ้น"];
      let currentStep = 0;
      if (order.status === "READY_FOR_PICKUP") {
        currentStep = order.paymentStatus === "PAID" ? 2 : 1;
      } else if (order.status === "PICKED_UP_PENDING_PAYMENT") {
        currentStep = 2;
      } else if (order.status === "PAID") {
        currentStep = 3;
      } else if (order.status === "PENDING_PAYMENT") {
        currentStep = 1;
      }
      return labels.map((label, index) => ({
        label,
        state: index < currentStep ? "done" : index === currentStep ? "current" : "todo",
      }));
    }

    const labels = ["สร้างออเดอร์", "ชำระเงิน", "เสร็จสิ้น"];
    let currentStep = 0;
    if (order.status === "PENDING_PAYMENT") {
      currentStep = 1;
    } else if (order.status === "PAID" || order.status === "PACKED" || order.status === "SHIPPED") {
      currentStep = 2;
    }
    return labels.map((label, index) => ({
      label,
      state: index < currentStep ? "done" : index === currentStep ? "current" : "todo",
    }));
  }, [isOnlineOrder, isPickupOrder, order.paymentMethod, order.paymentStatus, order.status]);
  const timelineDoneCount = useMemo(
    () => timelineSteps.filter((step) => step.state === "done").length,
    [timelineSteps],
  );
  const timelineCurrentIndex = useMemo(() => {
    const currentIndex = timelineSteps.findIndex((step) => step.state === "current");
    if (currentIndex >= 0) {
      return currentIndex;
    }
    return Math.max(0, Math.min(timelineSteps.length - 1, timelineDoneCount));
  }, [timelineDoneCount, timelineSteps]);
  const timelineReachedCount = useMemo(() => {
    if (timelineSteps.length === 0) {
      return 0;
    }
    const hasCurrent = timelineSteps.some((step) => step.state === "current");
    if (hasCurrent) {
      return Math.min(timelineSteps.length, timelineDoneCount + 1);
    }
    return Math.min(timelineSteps.length, timelineDoneCount);
  }, [timelineDoneCount, timelineSteps]);
  const timelineProgressPercent = useMemo(() => {
    if (timelineSteps.length === 0) {
      return 0;
    }
    return Math.round((timelineReachedCount / timelineSteps.length) * 100);
  }, [timelineReachedCount, timelineSteps.length]);
  const timelineCurrentLabel = timelineSteps[timelineCurrentIndex]?.label ?? "-";

  const primaryAction =
    isWalkInPaidComplete
      ? null
      : canConfirmPaid
      ? {
          key: "confirm-paid",
          label: confirmPaidButtonLabel,
          onClick: () => {
            if (shouldConfirmReceivePaymentAction || shouldConfirmPickupReceiveAction) {
              openConfirmPaidConfirmModal();
              return;
            }
            return runConfirmPaidAction();
          },
          disabled: confirmPaidDisabled,
        }
      : canMarkPacked
        ? {
            key: "mark-packed",
            label: isOnlineOrder ? "แพ็กสินค้า" : "ยืนยันแพ็กแล้ว",
            onClick: () =>
              runPatchAction(
                { action: "mark_packed" },
                "mark-packed",
                isOnlineOrder ? "บันทึกว่าแพ็กสินค้าแล้ว" : "อัปเดตเป็นแพ็กแล้ว",
              ),
            disabled: loadingKey !== null,
          }
        : canMarkShipped
          ? {
              key: "mark-shipped",
              label: isOnlineOrder ? "จัดส่งแล้ว" : "ยืนยันจัดส่งแล้ว",
              onClick: () =>
                runPatchAction(
                  { action: "mark_shipped" },
                  "mark-shipped",
                  isOnlineOrder ? "บันทึกว่าออเดอร์จัดส่งแล้ว" : "อัปเดตเป็นจัดส่งแล้ว",
                ),
              disabled: loadingKey !== null,
            }
          : order.status === "DRAFT" && canUpdate
            ? {
                key: "submit",
                label: "ส่งเป็นรอชำระ (จองสต็อก)",
                onClick: () =>
                  runPatchAction(
                    { action: "submit_for_payment" },
                    "submit",
                    "จองสต็อกและส่งไปรอชำระแล้ว",
                  ),
                disabled: loadingKey !== null,
              }
            : null;
  const primaryActionKey = primaryAction?.key ?? null;
  const actionRailEmptyMessage =
    isOnlineOrder && order.status === "SHIPPED" && order.paymentMethod !== "COD"
      ? "ออเดอร์ออนไลน์นี้จัดส่งแล้ว ไม่มี action หลักเพิ่มเติม"
      : order.paymentMethod === "COD" && order.paymentStatus === "COD_SETTLED"
        ? "ออเดอร์ COD นี้ปิดยอดแล้ว"
        : order.status === "COD_RETURNED"
          ? "ออเดอร์ COD นี้ตีกลับเข้าร้านแล้ว"
          : "ไม่มี action ถัดไปในสถานะนี้";
  const showExtraActionsHeader = !(
    (isWalkInOrder && (order.status === "CANCELLED" || order.status === "PENDING_PAYMENT")) ||
    order.status === "READY_FOR_PICKUP" ||
    order.status === "PICKED_UP_PENDING_PAYMENT"
  );
  const extraActions = [
    canMarkPacked && primaryActionKey !== "mark-packed"
      ? {
          key: "mark-packed",
          label: isOnlineOrder ? "แพ็กสินค้า" : "ยืนยันแพ็กแล้ว",
          tone: "outline" as const,
          onClick: () =>
            runPatchAction(
              { action: "mark_packed" },
              "mark-packed",
              isOnlineOrder ? "บันทึกว่าแพ็กสินค้าแล้ว" : "อัปเดตเป็นแพ็กแล้ว",
            ),
          disabled: loadingKey !== null,
        }
      : null,
    canMarkShipped && primaryActionKey !== "mark-shipped"
      ? {
          key: "mark-shipped",
          label: isOnlineOrder ? "จัดส่งแล้ว" : "ยืนยันจัดส่งแล้ว",
          tone: "outline" as const,
          onClick: () =>
            runPatchAction(
              { action: "mark_shipped" },
              "mark-shipped",
              isOnlineOrder ? "บันทึกว่าออเดอร์จัดส่งแล้ว" : "อัปเดตเป็นจัดส่งแล้ว",
            ),
          disabled: loadingKey !== null,
        }
      : null,
    canMarkCodReturned
      ? {
          key: "mark-cod-returned",
          label: "ตีกลับเข้าร้าน (COD)",
          tone: "warning" as const,
          onClick: () =>
            runPatchAction(
              {
                action: "mark_cod_returned",
                codFee: Number.isFinite(codReturnFeeNumber)
                  ? Math.max(0, Math.trunc(codReturnFeeNumber))
                  : 0,
                codReturnNote: codReturnNoteInput.trim(),
              },
              "mark-cod-returned",
              "บันทึกตีกลับเข้าร้านแล้ว",
            ),
          disabled: codReturnDisabled,
        }
      : null,
  ].filter((action): action is NonNullable<typeof action> => Boolean(action));

  return (
    <section className="mx-auto max-w-6xl space-y-4 overflow-x-hidden pb-10">
      <header className="space-y-3 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{order.orderNo}</p>
            <h1 className="text-xl font-semibold">รายละเอียดออเดอร์</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                {orderFlowLabel}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                ช่องทาง {channelLabel[order.channel]}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                สถานะ {statusLabel[order.status]}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <article className="space-y-3 border-b border-slate-200 pb-4">
            <h2 className="text-sm font-semibold text-slate-900">สถานะงาน</h2>

            <div className="space-y-2 sm:hidden">
              <div className="flex items-center justify-between text-xs">
                <p className="min-w-0 flex-1 truncate pr-2 font-medium text-slate-800">
                  ขั้น {Math.max(1, timelineCurrentIndex + 1)}/{Math.max(1, timelineSteps.length)}:{" "}
                  {timelineCurrentLabel}
                </p>
                <p className="text-slate-500">{timelineProgressPercent}%</p>
              </div>
              <div className="w-full max-w-full pb-0.5">
                <ol className="flex w-full items-start gap-1.5">
                  {timelineSteps.map((step, index) => {
                    const isDone = step.state === "done";
                    const isCurrent = step.state === "current";
                    const connectorDone = timelineReachedCount > index + 1;
                    return (
                      <li key={step.label} className="flex min-w-0 flex-1 items-center gap-1.5">
                        <div
                          className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md border px-1 py-1.5 ${
                            isDone
                              ? "border-emerald-200 bg-emerald-50"
                              : isCurrent
                                ? "border-blue-300 bg-blue-50"
                                : "border-slate-200 bg-white"
                          }`}
                        >
                          <span
                            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                              isDone
                                ? "bg-emerald-100 text-emerald-700"
                                : isCurrent
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span
                            className={`line-clamp-2 text-center text-[11px] leading-4 ${
                              isDone
                                ? "text-emerald-700"
                                : isCurrent
                                  ? "font-semibold text-blue-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                        {index < timelineSteps.length - 1 ? (
                          <span
                            className={`h-[2px] w-2 shrink-0 rounded-full ${
                              connectorDone ? "bg-emerald-300" : "bg-slate-200"
                            }`}
                            aria-hidden="true"
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${timelineProgressPercent}%` }}
                />
              </div>
            </div>

            <ol className="hidden items-start gap-2 sm:flex">
              {timelineSteps.map((step, index) => {
                const isDone = step.state === "done";
                const isCurrent = step.state === "current";
                const connectorDone = timelineReachedCount > index + 1;
                return (
                  <li key={step.label} className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isDone
                              ? "bg-emerald-100 text-emerald-700"
                              : isCurrent
                                ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span
                          className={`truncate text-xs ${
                            isDone
                              ? "text-slate-700"
                              : isCurrent
                                ? "font-semibold text-blue-700"
                                : "text-slate-500"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    </div>
                    {index < timelineSteps.length - 1 ? (
                      <span
                        className={`h-[2px] w-6 shrink-0 rounded-full lg:w-10 ${
                          connectorDone ? "bg-emerald-300" : "bg-slate-200"
                        }`}
                        aria-hidden="true"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {isWalkInPaidComplete ? (
              <p className="text-xs text-emerald-700">ออเดอร์หน้าร้านเสร็จสิ้นแล้ว</p>
            ) : null}
          </article>

          {showCancelApprovalSummary && order.cancelApproval ? (
            <article className="space-y-2 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">การอนุมัติยกเลิก</h2>
              <div className="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-800">
                <p>เหตุผล: {order.cancelApproval.cancelReason || "-"}</p>
                <p>
                  ผู้อนุมัติ: {order.cancelApproval.approvedByName || "-"}{" "}
                  {order.cancelApproval.approvedByRole
                    ? `(${order.cancelApproval.approvedByRole})`
                    : ""}
                </p>
                <p>อีเมลผู้อนุมัติ: {order.cancelApproval.approvedByEmail || "-"}</p>
                <p>
                  วิธียืนยัน:{" "}
                  {order.cancelApproval.approvalMode === "SELF_SLIDE"
                    ? "Owner/Manager ยืนยันด้วยสไลด์"
                    : order.cancelApproval.approvalMode === "MANAGER_PASSWORD"
                      ? "ยืนยันด้วยรหัสผ่าน Manager"
                      : "-"}
                </p>
                <p>ผู้กดยกเลิก: {order.cancelApproval.cancelledByName || "-"}</p>
                <p>เวลาอนุมัติ: {cancelApprovedAtLabel}</p>
              </div>
            </article>
          ) : null}

          {showCustomerSection ? (
            <article className="space-y-2 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">ข้อมูลลูกค้า</h2>
              <p className="text-sm">{customerNameDisplay}</p>
              <p className="text-xs text-muted-foreground">โทร: {customerPhoneDisplay || "-"}</p>
              <p className="text-xs text-muted-foreground">ที่อยู่: {customerAddressDisplay || "-"}</p>
            </article>
          ) : null}

          <article className="space-y-3 border-b border-slate-200 pb-4">
            <h2 className="text-sm font-semibold text-slate-900">รายการสินค้า</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem] bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500 lg:grid">
                <p>รายการ</p>
                <p className="text-right">จำนวน</p>
                <p className="text-right">รวม</p>
              </div>
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-1.5 border-t border-slate-200 px-3 py-2.5 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_7rem_9rem] lg:items-center lg:gap-2"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-slate-900">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.productSku || "-"}</p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="text-[11px] text-slate-500 lg:hidden">จำนวน</p>
                    <p className="text-sm font-medium text-slate-700 tabular-nums">
                      {item.qty.toLocaleString("th-TH")} {item.unitCode}
                    </p>
                    <p className="text-[11px] text-slate-500">ฐาน {item.qtyBase.toLocaleString("th-TH")}</p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="text-[11px] text-slate-500 lg:hidden">รวมบรรทัด</p>
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">
                      {item.lineTotal.toLocaleString("th-TH")} {storeCurrencyDisplay}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="space-y-1.5 rounded-md bg-slate-50/70 px-0 py-2.5 text-sm">
                <p className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">ยอดสินค้า</span>
                  <span className="text-slate-900 tabular-nums">
                    {order.subtotal.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">ส่วนลด</span>
                  <span className="text-slate-900 tabular-nums">
                    {order.discount.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">VAT ({vatModeLabel(order.storeVatMode)})</span>
                  <span className="text-slate-900 tabular-nums">
                    {order.vatAmount.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">ค่าส่งที่เรียกเก็บ</span>
                  <span className="text-slate-900 tabular-nums">
                    {order.shippingFeeCharged.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </span>
                </p>
                <div className="border-t border-slate-200 pt-1.5">
                  <p className="flex items-center justify-between gap-4 text-base font-semibold text-slate-900">
                    <span>ยอดรวม</span>
                    <span className="tabular-nums">
                      {order.total.toLocaleString("th-TH")} {storeCurrencyDisplay}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <p>สกุลชำระที่เลือก: {paymentCurrencyDisplay}</p>
                <p>วิธีชำระ: {paymentMethodLabel[order.paymentMethod]}</p>
                <p>สถานะการชำระ: {paymentStatusLabel[order.paymentStatus]}</p>
              </div>
              {order.paymentAccountDisplayName ? (
                <p className="text-xs text-slate-500">
                  บัญชีรับเงิน: {order.paymentAccountDisplayName} • {order.paymentAccountBankName ?? "-"} •{" "}
                  {maskAccountValue(order.paymentAccountNumber)}
                </p>
              ) : null}
              {order.paymentMethod === "COD" ? (
                <div className="mt-2 border-l-2 border-slate-300 pl-2 text-xs text-slate-600">
                  <p>ยอด COD ที่เก็บได้: {codCollectedAmount.toLocaleString("th-TH")} {storeCurrencyDisplay}</p>
                  <p>ต้นทุนขนส่งรวม: {order.shippingCost.toLocaleString("th-TH")} {storeCurrencyDisplay}</p>
                  <p>ค่าตีกลับ COD: {order.codFee.toLocaleString("th-TH")} {storeCurrencyDisplay}</p>
                  {order.codReturnNote ? <p>หมายเหตุตีกลับ: {order.codReturnNote}</p> : null}
                  <p>ส่วนต่างค่าส่ง: {codShippingMargin.toLocaleString("th-TH")} {storeCurrencyDisplay}</p>
                  <p className={codNetOutcome >= 0 ? "text-emerald-700" : "text-rose-700"}>
                    ผลลัพธ์ COD สุทธิ: {codNetOutcome.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </p>
                </div>
              ) : null}
            </div>
          </article>

          {isLaoQrOrder ? (
            <article className="space-y-3 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">ชำระด้วย QR โอนเงิน</h2>
              {order.paymentAccountQrImageUrl ? (
                <div className="space-y-2 overflow-hidden border border-slate-200 bg-slate-50 p-2">
                  <Image
                    src={order.paymentAccountQrImageUrl}
                    alt="QR payment"
                    width={208}
                    height={208}
                    className="mx-auto h-52 w-52 rounded-lg object-contain"
                    unoptimized
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full text-xs"
                      onClick={openOrderQrImageFull}
                    >
                      ดูรูปเต็ม
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full text-xs"
                      onClick={() => {
                        void downloadOrderQrImage();
                      }}
                    >
                      ดาวน์โหลด QR
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ยังไม่พบรูป QR ของบัญชีรับเงินนี้ กรุณาอัปเดตที่ตั้งค่าร้าน
                </p>
              )}

              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <p>
                  ชื่อบัญชี:{" "}
                  <span className="font-medium text-slate-900">
                    {order.paymentAccountDisplayName || "-"}
                  </span>
                </p>
                <p>
                  ธนาคาร:{" "}
                  <span className="font-medium text-slate-900">
                    {order.paymentAccountBankName || "-"}
                  </span>
                </p>
                <p>
                  เลขบัญชี:{" "}
                  <span className="font-medium text-slate-900">
                    {order.paymentAccountNumber || "-"}
                  </span>
                </p>
              </div>

            </article>
          ) : null}

          {showShippingSection ? (
            <article className="space-y-3 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">
                {isOnlineOrder ? "การจัดส่ง" : "ข้อมูลจัดส่ง (ถ้ามี)"}
              </h2>
              <div className="border-l-2 border-slate-300 pl-2 text-xs text-slate-600">
                <p>ผู้ให้บริการ: {order.shippingProvider || "-"}</p>
                <p>สถานะป้าย: {shippingLabelStatusLabel[order.shippingLabelStatus]}</p>
                <p>เลขติดตามล่าสุด: {order.trackingNo || "-"}</p>
                <p>
                  ต้นทุนค่าส่ง: {order.shippingCost.toLocaleString("th-TH")} {storeCurrencyDisplay}
                </p>
                {shippingLabelUrl ? (
                  <a
                    href={shippingLabelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    เปิดป้ายจัดส่งล่าสุด
                  </a>
                ) : null}
              </div>

              {shippingLabelUrl ? (
                <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2">
                  <Image
                    src={shippingLabelUrl}
                    alt="ตัวอย่างป้ายจัดส่ง"
                    width={960}
                    height={720}
                    className="h-auto max-h-80 w-full rounded object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  ยังไม่มีรูปป้ายจัดส่งในออเดอร์นี้
                </p>
              )}

              <div className="grid grid-cols-1 gap-2">
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={openShippingLabelSourcePicker}
                    disabled={!canUpdate || loadingKey !== null}
                  >
                    {loadingKey === "upload-label-file" || loadingKey === "upload-label-camera"
                      ? "กำลังอัปโหลด..."
                      : "อัปโหลด/ถ่ายรูปป้าย"}
                  </Button>
                  {shippingLabelUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => setShowDeleteShippingLabelConfirm(true)}
                      disabled={!canUpdate || loadingKey !== null}
                    >
                      {loadingKey === "remove-shipping-label" ? "กำลังลบ..." : "ลบรูปป้าย"}
                    </Button>
                  ) : null}
                  <input
                    ref={shippingLabelFileInputRef}
                    type="file"
                    accept={RASTER_IMAGE_ACCEPT}
                    className="hidden"
                    disabled={!canUpdate || loadingKey !== null}
                    onChange={(event) => {
                      void handleShippingLabelFileChange(event, "file");
                    }}
                  />
                  <input
                    ref={shippingLabelCameraInputRef}
                    type="file"
                    accept={RASTER_IMAGE_ACCEPT}
                    capture="environment"
                    className="hidden"
                    disabled={!canUpdate || loadingKey !== null}
                    onChange={(event) => {
                      void handleShippingLabelFileChange(event, "camera");
                    }}
                  />
                </div>
                {shippingLabelUploadError ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {shippingLabelUploadError}
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  ระบบจะบันทึกรูปป้ายจัดส่งให้อัตโนมัติทันทีหลังเลือกรูปหรือถ่ายรูปเสร็จ
                  รองรับไฟล์ JPG, PNG หรือ WebP ไม่เกิน 6MB และจะถูกปรับเป็น WebP ก่อนอัปโหลด
                </p>
              </div>
            </article>
          ) : null}

          {showLaoQrMessaging ? (
            <article className="space-y-3 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">ข้อความสำหรับส่งลูกค้า</h2>

              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                ระบบยังไม่เชื่อม Facebook/WhatsApp API จึงต้องส่งข้อความเองผ่านปุ่มด้านล่าง
              </div>

              <textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                className="min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              />

              <div
                className={`grid grid-cols-1 gap-2 ${
                  messagingActionCount >= 3 ? "sm:grid-cols-3" : messagingActionCount === 2 ? "sm:grid-cols-2" : ""
                }`}
              >
                <Button type="button" className="h-9" onClick={copyMessage}>
                  คัดลอกข้อความ
                </Button>

                {showWhatsappMessagingAction ? (
                  <a
                    href={messaging.waDeepLink ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 items-center justify-center rounded-md border border-green-400 text-xs font-medium text-green-700"
                  >
                    เปิด WhatsApp
                  </a>
                ) : null}

                {showFacebookMessagingAction ? (
                  <a
                    href={messaging.facebookInboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 items-center justify-center rounded-md border border-blue-400 text-xs font-medium text-blue-700"
                  >
                    เปิด Facebook
                  </a>
                ) : null}
              </div>
            </article>
          ) : null}

          {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="space-y-3 border-y border-slate-200 py-3">
            <h2 className="text-sm font-semibold text-slate-900">การทำงานหลัก</h2>
            {isWalkInPaidComplete ? (
              <>
                <div className="space-y-1 text-xs text-slate-600">
                  <p>สถานะ: เสร็จสิ้น</p>
                  <p>ชำระเงิน: {paymentStatusLabel[order.paymentStatus]}</p>
                  <p>
                    ยอดรวม: {order.total.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </p>
                </div>
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                  ออเดอร์หน้าร้านนี้ปิดงานแล้ว สามารถพิมพ์ใบเสร็จได้ทันที
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full text-xs"
                  onClick={() => printViaWindow("receipt")}
                  disabled={receiptPrintLoading || labelPrintLoading}
                >
                  {receiptPrintLoading ? "กำลังเปิดพิมพ์..." : "พิมพ์ใบเสร็จ"}
                </Button>
                {canOrderCancel ? (
                  <Button
                    className="h-10 w-full bg-rose-600 text-white hover:bg-rose-700"
                    onClick={() => {
                      setShowCancelApprovalModal(true);
                      setErrorMessage(null);
                    }}
                    disabled={canMarkCodReturned || loadingKey !== null}
                  >
                    {loadingKey === "cancel" ? "กำลังบันทึก..." : "ยกเลิกออเดอร์"}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <div className="space-y-1 text-xs text-slate-600">
                  <p>สถานะ: {statusLabel[order.status]}</p>
                  <p>ชำระเงิน: {paymentStatusLabel[order.paymentStatus]}</p>
                  <p>
                    ยอดรวม: {order.total.toLocaleString("th-TH")} {storeCurrencyDisplay}
                  </p>
                </div>

                {isCodPendingAfterShipped ? (
                  <div className="space-y-2 rounded-md border border-blue-100 bg-blue-50/70 p-2">
                    <p className="text-xs font-medium text-blue-900">ปิดยอด COD</p>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={codSettlementAmount}
                      onChange={(event) => setCodSettlementAmount(event.target.value)}
                      className="h-9 w-full rounded-md border border-blue-200 bg-white px-2 text-sm outline-none ring-primary focus:ring-2"
                      disabled={confirmPaidDisabled}
                      placeholder="ยอดที่ขนส่งโอนจริง"
                    />
                    {canMarkCodReturned ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={codReturnFeeInput}
                          onChange={(event) => setCodReturnFeeInput(event.target.value)}
                          className="h-9 w-full rounded-md border border-blue-200 bg-white px-2 text-sm outline-none ring-primary focus:ring-2"
                          disabled={codReturnDisabled}
                          placeholder="ค่าตีกลับ"
                        />
                        <textarea
                          value={codReturnNoteInput}
                          onChange={(event) => setCodReturnNoteInput(event.target.value)}
                          className="min-h-16 w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm outline-none ring-primary focus:ring-2"
                          disabled={codReturnDisabled}
                          placeholder="หมายเหตุตีกลับ (ไม่บังคับ)"
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}

                {primaryAction ? (
                  <Button className="h-10 w-full" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
                    {loadingKey === primaryAction.key ? "กำลังบันทึก..." : primaryAction.label}
                  </Button>
                ) : (
                  <p className="rounded-md border border-dashed border-slate-200 p-2 text-xs text-slate-500">
                    {actionRailEmptyMessage}
                  </p>
                )}
                {canMarkPickupBeforePaid ? (
                  <Button
                    className="h-10 w-full border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    variant="outline"
                    onClick={() => {
                      setShowConfirmPickupBeforePaidModal(true);
                      setErrorMessage(null);
                    }}
                    disabled={pickupBeforePaidDisabled}
                  >
                    {loadingKey === "mark-picked-up-unpaid"
                      ? "กำลังบันทึก..."
                      : "ยืนยันรับสินค้า (ค้างจ่าย)"}
                  </Button>
                ) : null}
                {canOrderCancel ? (
                  <Button
                    className="h-10 w-full bg-rose-600 text-white hover:bg-rose-700"
                    onClick={() => {
                      setShowCancelApprovalModal(true);
                      setErrorMessage(null);
                    }}
                    disabled={canMarkCodReturned || loadingKey !== null}
                  >
                    {loadingKey === "cancel" ? "กำลังบันทึก..." : "ยกเลิกออเดอร์"}
                  </Button>
                ) : null}

                <div className={`grid gap-2 ${showShippingSection ? "grid-cols-2" : "grid-cols-1"}`}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 text-xs"
                    onClick={() => printViaWindow("receipt")}
                    disabled={receiptPrintLoading || labelPrintLoading}
                  >
                    {receiptPrintLoading ? "กำลังเปิดพิมพ์..." : "พิมพ์ใบเสร็จ"}
                  </Button>
                  {showShippingSection ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 text-xs"
                      onClick={() => printViaWindow("label")}
                      disabled={receiptPrintLoading || labelPrintLoading}
                    >
                      {labelPrintLoading ? "กำลังเปิดพิมพ์..." : "พิมพ์ป้าย"}
                    </Button>
                  ) : null}
                </div>

                {showExtraActionsHeader && extraActions.length > 0 ? (
                  <details className="rounded-md border border-slate-200 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700">
                      การทำงานเพิ่มเติม
                    </summary>
                    <div className="mt-2 space-y-2">
                      {extraActions.map((action) => (
                        <Button
                          key={action.key}
                          className={
                            action.tone === "warning"
                              ? "h-9 w-full bg-orange-600 text-white hover:bg-orange-700"
                              : "h-9 w-full"
                          }
                          variant={action.tone === "warning" ? undefined : "outline"}
                          onClick={() => {
                            void action.onClick();
                          }}
                          disabled={action.disabled}
                        >
                          {loadingKey === action.key ? "กำลังบันทึก..." : action.label}
                        </Button>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </div>
      <ManagerCancelApprovalModal
        isOpen={showCancelApprovalModal}
        orderNo={order.orderNo}
        mode={canSelfApproveCancel ? "SELF_SLIDE" : "MANAGER_PASSWORD"}
        isHighRisk={cancelIsHighRisk}
        busy={loadingKey === "cancel"}
        onClose={() => {
          if (loadingKey !== null) {
            return;
          }
          setShowCancelApprovalModal(false);
        }}
        onConfirm={submitCancelWithApproval}
      />
      {showConfirmPickupBeforePaidModal ? (
        <div className="fixed inset-0 z-[89]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55"
            aria-label="ปิดหน้าต่างยืนยันรับสินค้าแบบค้างจ่าย"
            onClick={() => {
              if (loadingKey !== null) {
                return;
              }
              setShowConfirmPickupBeforePaidModal(false);
            }}
            disabled={loadingKey !== null}
          />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-pickup-before-paid-title"
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            >
              <h3 id="confirm-pickup-before-paid-title" className="text-sm font-semibold text-slate-900">
                ยืนยันรับสินค้าแบบค้างจ่าย?
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                เมื่อยืนยันแล้วระบบจะตัดสต็อกทันที และออเดอร์จะอยู่สถานะรอรับชำระเพื่อให้ตามเก็บเงินภายหลัง
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={() => setShowConfirmPickupBeforePaidModal(false)}
                  disabled={loadingKey !== null}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="h-9 bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => {
                    void runMarkPickupBeforePaidAction();
                  }}
                  disabled={pickupBeforePaidDisabled}
                >
                  {loadingKey === "mark-picked-up-unpaid" ? "กำลังบันทึก..." : "ยืนยันรับสินค้า"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showConfirmPaidConfirmModal ? (
        <div className="fixed inset-0 z-[89]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55"
            aria-label="ปิดหน้าต่างยืนยันรับชำระ"
            onClick={() => {
              if (loadingKey !== null) {
                return;
              }
              setShowConfirmPaidConfirmModal(false);
            }}
            disabled={loadingKey !== null}
          />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-receive-payment-title"
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            >
              <h3 id="confirm-receive-payment-title" className="text-sm font-semibold text-slate-900">
                {confirmPaidConfirmTitle}
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                {isPickupReadyPrepaid
                  ? "เมื่อยืนยันแล้วระบบจะตัดสต็อกจากรายการจองและปิดงานรับสินค้าทันที"
                  : isCodPendingAfterShipped
                    ? "เมื่อยืนยันแล้วระบบจะบันทึกยอดโอนจริงจากขนส่งและปิดยอด COD ให้ทันที"
                  : isInStoreCreditSettlement
                    ? "เลือกวิธีรับเงินจริงก่อนบันทึก เพื่อให้ข้อมูลชำระตรงกับหน้าร้าน"
                    : isOnlineOrder && order.paymentMethod === "LAO_QR" && order.paymentStatus === "PENDING_PROOF"
                      ? "เมื่อยืนยันแล้วระบบจะถือว่าสลิปนี้ตรวจสอบผ่านและอัปเดตเป็นชำระแล้วทันที"
                      : "เมื่อยืนยันแล้วออเดอร์จะถูกอัปเดตเป็นสถานะชำระแล้วทันที"}
              </p>
              {isInStoreCreditSettlement ? (
                <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">รับเงินจริงด้วยวิธีใด</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`rounded-md border px-3 py-2 text-sm ${
                          confirmPaidPaymentMethod === "CASH"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() => setConfirmPaidPaymentMethod("CASH")}
                        disabled={loadingKey !== null}
                      >
                        เงินสด
                      </button>
                      <button
                        type="button"
                        className={`rounded-md border px-3 py-2 text-sm ${
                          confirmPaidPaymentMethod === "LAO_QR"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700"
                        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                        onClick={() => setConfirmPaidPaymentMethod("LAO_QR")}
                        disabled={loadingKey !== null || qrPaymentAccounts.length === 0}
                      >
                        QR โอน
                      </button>
                    </div>
                  </div>
                  {confirmPaidPaymentMethod === "LAO_QR" ? (
                    qrPaymentAccounts.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-700">เลือกบัญชีรับเงิน (QR)</p>
                        <div className="space-y-2">
                          {qrPaymentAccounts.map((account) => {
                            const isSelected = account.id === confirmPaidPaymentAccountId;
                            return (
                              <button
                                key={account.id}
                                type="button"
                                className={`w-full rounded-md border px-3 py-2 text-left ${
                                  isSelected
                                    ? "border-blue-300 bg-blue-50"
                                    : "border-slate-200 bg-white"
                                }`}
                                onClick={() => setConfirmPaidPaymentAccountId(account.id)}
                                disabled={loadingKey !== null}
                              >
                                <p className="text-sm font-medium text-slate-900">
                                  {account.displayName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {account.bankName || "-"} • {maskAccountValue(account.accountNumber)}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                        {selectedConfirmPaidQrAccount ? (
                          <div className="space-y-2">
                            <p className="text-[11px] text-slate-500">
                              บันทึกเป็น {selectedConfirmPaidQrAccount.displayName} •{" "}
                              {maskAccountValue(selectedConfirmPaidQrAccount.accountNumber)}
                            </p>
                            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                              {selectedConfirmPaidQrAccount.qrImageUrl ? (
                                <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2">
                                  <div className="absolute right-3 top-3 flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400"
                                      onClick={openConfirmPaidQrImageFull}
                                      disabled={loadingKey !== null}
                                      aria-label="เปิดรูป QR เต็ม"
                                      title="เปิดรูป QR เต็ม"
                                    >
                                      <Expand className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400"
                                      onClick={() => {
                                        void downloadConfirmPaidQrImage();
                                      }}
                                      disabled={loadingKey !== null}
                                      aria-label="ดาวน์โหลดรูป QR"
                                      title="ดาวน์โหลดรูป QR"
                                    >
                                      <ArrowDownToLine className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <Image
                                    src={selectedConfirmPaidQrAccount.qrImageUrl}
                                    alt={`QR ${selectedConfirmPaidQrAccount.displayName}`}
                                    width={240}
                                    height={240}
                                    className="mx-auto h-44 w-44 rounded object-contain"
                                    unoptimized
                                  />
                                </div>
                              ) : (
                                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                  บัญชีนี้ยังไม่มีรูป QR กรุณาใช้เลขบัญชีหรืออัปเดตรูปที่ตั้งค่าร้าน
                                </p>
                              )}
                              <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                                <p>
                                  ชื่อบัญชี:{" "}
                                  <span className="font-medium text-slate-900">
                                    {selectedConfirmPaidQrAccount.accountName}
                                  </span>
                                </p>
                                <p>
                                  ธนาคาร:{" "}
                                  <span className="font-medium text-slate-900">
                                    {selectedConfirmPaidQrBankDisplay}
                                  </span>
                                </p>
                                <p>
                                  เลขบัญชี:{" "}
                                  <span className="font-medium text-slate-900">
                                    {selectedConfirmPaidQrAccount.accountNumber || "-"}
                                  </span>
                                </p>
                              </div>
                              {selectedConfirmPaidQrAccount.accountNumber ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 w-full text-xs"
                                  onClick={() => {
                                    void copyConfirmPaidQrAccountNumber();
                                  }}
                                  disabled={loadingKey !== null}
                                >
                                  คัดลอกเลขบัญชี
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        ยังไม่มีบัญชี QR ที่เปิดใช้งานในร้านนี้ จึงยังรับชำระแบบ QR ไม่ได้
                      </p>
                    )
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={() => setShowConfirmPaidConfirmModal(false)}
                  disabled={loadingKey !== null}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="h-9"
                  onClick={() => {
                    void runConfirmPaidAction();
                  }}
                  disabled={confirmPaidDisabled}
                >
                  {loadingKey === "confirm-paid"
                    ? "กำลังบันทึก..."
                    : confirmPaidButtonLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showConfirmPaidQrImageViewer && selectedConfirmPaidQrAccount?.qrImageUrl ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 px-3 py-6 sm:px-6"
          onClick={() => setShowConfirmPaidQrImageViewer(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5 text-slate-100">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedConfirmPaidQrAccount.displayName}</p>
                <p className="truncate text-xs text-slate-400">ดู QR เต็มในหน้าเดิม</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={openConfirmPaidQrImageInNewTab}
                  aria-label="เปิดรูป QR ในแท็บใหม่"
                  title="เปิดรูป QR ในแท็บใหม่"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={() => {
                    void downloadConfirmPaidQrImage();
                  }}
                  aria-label="ดาวน์โหลดรูป QR"
                  title="ดาวน์โหลดรูป QR"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={() => setShowConfirmPaidQrImageViewer(false)}
                  aria-label="ปิดรูป QR"
                  title="ปิดรูป QR"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[calc(100dvh-9rem)] items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.14),_transparent_60%)] p-4 sm:p-6">
              <Image
                src={selectedConfirmPaidQrAccount.qrImageUrl}
                alt={`QR ${selectedConfirmPaidQrAccount.displayName}`}
                width={1200}
                height={1200}
                className="h-auto max-h-[calc(100dvh-13rem)] w-auto max-w-full rounded-lg object-contain"
                unoptimized
              />
            </div>
          </div>
        </div>
      ) : null}
      {showOrderQrImageViewer && order.paymentAccountQrImageUrl ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 px-3 py-6 sm:px-6"
          onClick={() => setShowOrderQrImageViewer(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5 text-slate-100">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{order.paymentAccountDisplayName || "QR payment"}</p>
                <p className="truncate text-xs text-slate-400">ดู QR เต็มในหน้าเดิม</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={openOrderQrImageInNewTab}
                  aria-label="เปิดรูป QR ในแท็บใหม่"
                  title="เปิดรูป QR ในแท็บใหม่"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={() => {
                    void downloadOrderQrImage();
                  }}
                  aria-label="ดาวน์โหลดรูป QR"
                  title="ดาวน์โหลดรูป QR"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={() => setShowOrderQrImageViewer(false)}
                  aria-label="ปิดรูป QR"
                  title="ปิดรูป QR"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[calc(100dvh-9rem)] items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.14),_transparent_60%)] p-4 sm:p-6">
              <Image
                src={order.paymentAccountQrImageUrl}
                alt={`QR ${order.paymentAccountDisplayName || "payment"}`}
                width={1200}
                height={1200}
                className="h-auto max-h-[calc(100dvh-13rem)] w-auto max-w-full rounded-lg object-contain"
                unoptimized
              />
            </div>
          </div>
        </div>
      ) : null}
      <SlideUpSheet
        isOpen={showShippingLabelSourcePicker}
        onClose={closeShippingLabelSourcePicker}
        title="เพิ่มรูปป้ายจัดส่ง"
        description="เลือกวิธีที่ต้องการ ถ้าเครื่องนี้เปิดกล้องไม่ได้ ให้ใช้เลือกรูปจากเครื่องแทน"
        panelMaxWidthClass="min-[1200px]:max-w-sm"
        disabled={loadingKey !== null}
        footer={
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl"
            onClick={closeShippingLabelSourcePicker}
            disabled={loadingKey !== null}
          >
            ปิด
          </Button>
        }
      >
        <div className="space-y-2 pb-1">
          <Button
            type="button"
            className="h-10 w-full rounded-xl"
            onClick={() => pickShippingLabelFromDevice("file")}
            disabled={loadingKey !== null}
          >
            เลือกรูปจากเครื่อง
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl"
            onClick={() => pickShippingLabelFromDevice("camera")}
            disabled={loadingKey !== null || !canOpenShippingLabelCamera}
          >
            ถ่ายรูปจากกล้อง
          </Button>
          {!canOpenShippingLabelCamera ? (
            <p className="text-[11px] text-slate-500">
              เครื่องหรือ browser นี้ไม่รองรับการเรียกกล้องโดยตรง
            </p>
          ) : null}
        </div>
      </SlideUpSheet>
      {showDeleteShippingLabelConfirm ? (
        <div className="fixed inset-0 z-[96]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55"
            aria-label="ปิดหน้าต่างยืนยันลบรูปป้ายจัดส่ง"
            onClick={() => {
              if (loadingKey !== null) {
                return;
              }
              setShowDeleteShippingLabelConfirm(false);
            }}
            disabled={loadingKey !== null}
          />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-shipping-label-title"
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            >
              <h3 id="delete-shipping-label-title" className="text-sm font-semibold text-slate-900">
                ลบรูปป้ายจัดส่ง?
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                ระบบจะลบรูปป้ายออกจากออเดอร์นี้ แต่จะไม่ลบข้อมูลขนส่งอื่น เช่น ผู้ให้บริการและเลขติดตาม
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={() => setShowDeleteShippingLabelConfirm(false)}
                  disabled={loadingKey !== null}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="h-9 bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() => {
                    void removeShippingLabelImage();
                  }}
                  disabled={loadingKey !== null}
                >
                  {loadingKey === "remove-shipping-label" ? "กำลังลบ..." : "ลบรูปป้าย"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
