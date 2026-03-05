"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  ManagerCancelApprovalModal,
  type ManagerCancelApprovalPayload,
  type ManagerCancelApprovalResult,
} from "@/components/app/manager-cancel-approval-modal";
import { Button } from "@/components/ui/button";
import {
  currencyLabel,
  currencySymbol,
  parseStoreCurrency,
  vatModeLabel,
} from "@/lib/finance/store-financial";
import type { OrderDetail } from "@/lib/orders/queries";
import { maskAccountValue } from "@/lib/payments/store-payment";

type MessagingInfo = {
  within24h: boolean;
  template: string;
  waDeepLink: string | null;
  facebookInboxUrl: string;
};

type OrderDetailViewProps = {
  order: OrderDetail;
  messaging: MessagingInfo;
  canUpdate: boolean;
  canMarkPaid: boolean;
  canPack: boolean;
  canShip: boolean;
  canCodReturn: boolean;
  canCancel: boolean;
  canSelfApproveCancel: boolean;
};

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

export function OrderDetailView({
  order,
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
  const [shippingCarrier, setShippingCarrier] = useState(order.shippingCarrier ?? "");
  const [trackingNo, setTrackingNo] = useState(order.trackingNo ?? "");
  const [shippingLabelUrl, setShippingLabelUrl] = useState(order.shippingLabelUrl ?? "");
  const [shippingCost, setShippingCost] = useState(String(order.shippingCost));
  const [codSettlementAmount, setCodSettlementAmount] = useState(
    String(order.codAmount > 0 ? order.codAmount : order.total),
  );
  const [codReturnFeeInput, setCodReturnFeeInput] = useState("");
  const [codReturnNoteInput, setCodReturnNoteInput] = useState(order.codReturnNote ?? "");
  const [paymentSlipUrl, setPaymentSlipUrl] = useState(order.paymentSlipUrl ?? "");
  const [messageText, setMessageText] = useState(messaging.template);
  const [shippingTemplateOverride, setShippingTemplateOverride] = useState<string | null>(null);
  const [receiptPrintLoading, setReceiptPrintLoading] = useState(false);
  const [labelPrintLoading, setLabelPrintLoading] = useState(false);
  const [showConfirmPaidConfirmModal, setShowConfirmPaidConfirmModal] = useState(false);
  const [showConfirmPickupBeforePaidModal, setShowConfirmPickupBeforePaidModal] = useState(false);
  const [showCancelApprovalModal, setShowCancelApprovalModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
  const canSubmitSlip =
    canUpdate &&
    (order.status === "PENDING_PAYMENT" ||
      order.status === "READY_FOR_PICKUP" ||
      order.status === "PICKED_UP_PENDING_PAYMENT") &&
    order.paymentMethod === "LAO_QR" &&
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
  const canCreateShippingLabel =
    !isWalkInPaidComplete && canShip && (order.status === "PACKED" || order.status === "SHIPPED");
  const canSendShippingUpdate =
    !isWalkInPaidComplete &&
    canShip &&
    (order.status === "PACKED" || order.status === "SHIPPED") &&
    (Boolean(trackingNo.trim()) || Boolean(shippingLabelUrl.trim()));
  const showExtraActions = !(
    (isWalkInOrder && (order.status === "CANCELLED" || order.status === "PENDING_PAYMENT")) ||
    order.status === "READY_FOR_PICKUP" ||
    order.status === "PICKED_UP_PENDING_PAYMENT"
  );
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
  const showLaoQrMessaging = order.paymentMethod === "LAO_QR" && isOnlineOrder;
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

  const shippingCostNumber = useMemo(() => Number(shippingCost || "0"), [shippingCost]);
  const codSettlementAmountNumber = useMemo(
    () => Number(codSettlementAmount || "0"),
    [codSettlementAmount],
  );
  const codReturnFeeNumber = useMemo(() => Number(codReturnFeeInput || "0"), [codReturnFeeInput]);
  const shippingMessageTemplate = useMemo(() => {
    const customerLabel = (order.customerName || order.contactDisplayName || "ลูกค้า").trim();
    const carrierLabel = shippingCarrier.trim() || "ขนส่ง";
    const trackingLabel = trackingNo.trim() || "-";
    const labelLink = shippingLabelUrl.trim();

    return [
      `เรียน ${customerLabel}`,
      `ออเดอร์ ${order.orderNo} ได้จัดส่งแล้ว`,
      `ขนส่ง: ${carrierLabel}`,
      `เลขพัสดุ: ${trackingLabel}`,
      labelLink ? `ลิงก์ป้าย/บิลจัดส่ง: ${labelLink}` : null,
      "ขอบคุณที่ใช้บริการค่ะ",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }, [
    order.contactDisplayName,
    order.customerName,
    order.orderNo,
    shippingCarrier,
    shippingLabelUrl,
    trackingNo,
  ]);
  const shippingMessageText = shippingTemplateOverride ?? shippingMessageTemplate;
  const shippingWaDeepLink = useMemo(() => {
    const phone = (order.customerPhone || order.contactPhone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      return null;
    }
    return `https://wa.me/${phone}?text=${encodeURIComponent(shippingMessageText)}`;
  }, [order.contactPhone, order.customerPhone, shippingMessageText]);

  const runPatchAction = async (
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
  };

  const sendQr = async () => {
    setLoadingKey("send-qr");
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch(`/api/orders/${order.id}/send-qr`, {
      method: "POST",
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          mode?: string;
          template?: string;
          waDeepLink?: string | null;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "ส่งข้อความไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (data?.mode === "AUTO") {
      setSuccessMessage("ส่งอัตโนมัติแล้ว (โหมดจำลอง)");
    } else {
      setErrorMessage(data?.message ?? "ต้องส่งแบบแมนนวล");
      if (data?.template) {
        setMessageText(data.template);
      }
    }

    setLoadingKey(null);
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setSuccessMessage("คัดลอกข้อความแล้ว");
    } catch {
      setErrorMessage("คัดลอกข้อความไม่สำเร็จ");
    }
  };

  const copyShippingMessage = async () => {
    try {
      await navigator.clipboard.writeText(shippingMessageText);
      setSuccessMessage("คัดลอกข้อความจัดส่งแล้ว");
    } catch {
      setErrorMessage("คัดลอกข้อความจัดส่งไม่สำเร็จ");
    }
  };

  const createShippingLabel = async () => {
    setLoadingKey("create-label");
    setErrorMessage(null);
    setSuccessMessage(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `label-${order.id}-${Date.now()}`;

    const response = await fetch(`/api/orders/${order.id}/shipments/label`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        provider: shippingCarrier || order.shippingProvider || "MANUAL",
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          reused?: boolean;
          shipment?: {
            trackingNo?: string;
            labelUrl?: string;
          };
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "สร้างป้ายจัดส่งไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (data?.shipment?.trackingNo) {
      setTrackingNo(data.shipment.trackingNo);
    }
    if (data?.shipment?.labelUrl) {
      setShippingLabelUrl(data.shipment.labelUrl);
    }
    setShippingTemplateOverride(null);
    setSuccessMessage(data?.reused ? "พบป้ายจัดส่งเดิมและนำกลับมาใช้งานแล้ว" : "สร้างป้ายจัดส่งสำเร็จ");
    setLoadingKey(null);
    router.refresh();
  };

  const sendShippingUpdate = async () => {
    setLoadingKey("send-shipping");
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch(`/api/orders/${order.id}/send-shipping`, {
      method: "POST",
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          mode?: string;
          template?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "ส่งข้อมูลจัดส่งไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (data?.mode === "AUTO") {
      setSuccessMessage("ส่งข้อมูลจัดส่งอัตโนมัติแล้ว (โหมดจำลอง)");
    } else {
      setErrorMessage(data?.message ?? "ต้องส่งข้อมูลจัดส่งแบบแมนนวล");
      setShippingTemplateOverride(data?.template ?? shippingMessageTemplate);
    }
    setLoadingKey(null);
  };

  const uploadShippingLabelImage = async (file: File, source: "file" | "camera") => {
    setLoadingKey(source === "camera" ? "upload-label-camera" : "upload-label-file");
    setErrorMessage(null);
    setSuccessMessage(null);

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
        setErrorMessage(data?.message ?? "อัปโหลดรูปบิล/ป้ายจัดส่งไม่สำเร็จ");
        return;
      }

      if (!data?.labelUrl) {
        setErrorMessage("ไม่พบลิงก์รูปที่อัปโหลด");
        return;
      }

      setShippingLabelUrl(data.labelUrl);
      setShippingTemplateOverride(null);
      setSuccessMessage(
        source === "camera"
          ? "อัปโหลดรูปจากกล้องแล้ว กรุณากดบันทึกข้อมูลจัดส่ง"
          : "อัปโหลดรูปจากเครื่องแล้ว กรุณากดบันทึกข้อมูลจัดส่ง",
      );
    } catch {
      setErrorMessage("อัปโหลดรูปบิล/ป้ายจัดส่งไม่สำเร็จ");
    } finally {
      setLoadingKey(null);
    }
  };

  const handleShippingLabelFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
    source: "file" | "camera",
  ) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    await uploadShippingLabelImage(file, source);
  };

  const printViaIframe = useCallback(
    (path: string, kind: "receipt" | "label") => {
      if (typeof window === "undefined") {
        return;
      }

      setErrorMessage(null);
      if (kind === "receipt") {
        setReceiptPrintLoading(true);
      } else {
        setLabelPrintLoading(true);
      }

      document
        .querySelectorAll<HTMLIFrameElement>('iframe[data-order-print-frame="true"]')
        .forEach((existingFrame) => existingFrame.remove());

      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.dataset.orderPrintFrame = "true";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";

      const cleanup = () => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
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

      iframe.addEventListener(
        "load",
        () => {
          const frameWindow = iframe.contentWindow;
          if (!frameWindow) {
            setErrorMessage(kind === "receipt" ? "ไม่สามารถพิมพ์ใบเสร็จได้" : "ไม่สามารถพิมพ์ป้ายจัดส่งได้");
            settleLoading();
            cleanup();
            return;
          }

          // ปล่อยให้หน้าพิมพ์ใน iframe เรียก window.print() เองผ่าน autoprint เพื่อลดปัญหาหน้าแรกข้อมูลยังไม่ครบ
          try {
            frameWindow.addEventListener(
              "afterprint",
              () => {
                settleLoading();
                cleanup();
              },
              { once: true },
            );
          } catch {
            // ignore
          }

          window.setTimeout(() => {
            settleLoading();
          }, 1200);

          window.setTimeout(() => {
            try {
              cleanup();
            } catch {
              // ignore
            }
          }, 20000);
        },
        { once: true },
      );

      iframe.addEventListener(
        "error",
        () => {
          setErrorMessage(kind === "receipt" ? "ไม่สามารถพิมพ์ใบเสร็จได้" : "ไม่สามารถพิมพ์ป้ายจัดส่งได้");
          settleLoading();
          cleanup();
        },
        { once: true },
      );

      document.body.appendChild(iframe);
      const separator = path.includes("?") ? "&" : "?";
      iframe.src = `${path}${separator}autoprint=1`;
    },
    [],
  );

  const confirmPaidButtonLabel = isCodPendingAfterShipped
    ? "ยืนยันรับเงินปลายทาง (COD)"
    : isPickupReadyPrepaid
      ? "ยืนยันรับสินค้า"
      : "ยืนยันรับชำระ";
  const confirmPaidSuccessText = isCodPendingAfterShipped
    ? "ปิดยอด COD แล้ว"
    : isPickupReadyPrepaid
      ? "ยืนยันรับสินค้าแล้ว"
      : "ยืนยันชำระแล้ว";
  const confirmPaidDisabled =
    !canConfirmPaid ||
    loadingKey !== null ||
    (isCodPendingAfterShipped &&
      (!Number.isFinite(codSettlementAmountNumber) || codSettlementAmountNumber < 0));
  const shouldConfirmReceivePaymentAction = !isCodPendingAfterShipped && !isPickupReadyPrepaid;
  const shouldConfirmPickupReceiveAction = isPickupReadyPrepaid;
  const runConfirmPaidAction = async () => {
    const result = await runPatchAction(
      {
        action: "confirm_paid",
        codAmount:
          isCodPendingAfterShipped && Number.isFinite(codSettlementAmountNumber)
            ? Math.max(0, Math.trunc(codSettlementAmountNumber))
            : undefined,
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

  const timelineSteps = useMemo(() => {
    if (isOnlineOrder) {
      const labels = ["สร้างออเดอร์", "ยืนยันชำระ", "แพ็กสินค้า", "จัดส่ง", "ปิดงาน"];
      let currentStep = 0;
      if (order.status === "PENDING_PAYMENT" || order.status === "READY_FOR_PICKUP") {
        currentStep = 1;
      } else if (order.status === "PAID" || order.status === "PACKED") {
        currentStep = 2;
      } else if (order.status === "SHIPPED") {
        currentStep =
          order.paymentMethod === "COD" && order.paymentStatus === "COD_PENDING_SETTLEMENT"
            ? 4
            : 3;
      }
      if (order.paymentStatus === "COD_SETTLED" || order.status === "COD_RETURNED") {
        currentStep = 4;
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
              setShowConfirmPaidConfirmModal(true);
              setErrorMessage(null);
              return;
            }
            return runConfirmPaidAction();
          },
          disabled: confirmPaidDisabled,
        }
      : canMarkPacked
        ? {
            key: "mark-packed",
            label: "ยืนยันแพ็กแล้ว",
            onClick: () =>
              runPatchAction({ action: "mark_packed" }, "mark-packed", "อัปเดตเป็นแพ็กแล้ว"),
            disabled: loadingKey !== null,
          }
        : canMarkShipped
          ? {
              key: "mark-shipped",
              label: "ยืนยันจัดส่งแล้ว",
              onClick: () =>
                runPatchAction({ action: "mark_shipped" }, "mark-shipped", "อัปเดตเป็นจัดส่งแล้ว"),
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
              {order.paymentMethod === "LAO_QR" ? (
                <p className="text-xs text-slate-500">
                  สถานะสลิป: {order.paymentSlipUrl ? "แนบแล้ว (รอตรวจสอบ)" : "ยังไม่แนบ"}
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

          {order.paymentMethod === "LAO_QR" ? (
            <article className="space-y-3 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">ชำระด้วย QR โอนเงิน</h2>
              {order.paymentAccountQrImageUrl ? (
                <div className="overflow-hidden border border-slate-200 bg-slate-50 p-2">
                  <Image
                    src={order.paymentAccountQrImageUrl}
                    alt="QR payment"
                    width={208}
                    height={208}
                    className="mx-auto h-52 w-52 rounded-lg object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ยังไม่พบรูป QR ของบัญชีรับเงินนี้ กรุณาอัปเดตที่ตั้งค่าร้าน
                </p>
              )}

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="payment-slip-url">
                  ลิงก์สลิปการโอน (สำหรับรอตรวจสอบ)
                </label>
                <input
                  id="payment-slip-url"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  value={paymentSlipUrl}
                  onChange={(event) => setPaymentSlipUrl(event.target.value)}
                  disabled={!canSubmitSlip || loadingKey !== null}
                  placeholder="https://..."
                />
                <Button
                  className="h-10 w-full sm:w-auto"
                  onClick={() =>
                    runPatchAction(
                      { action: "submit_payment_slip", paymentSlipUrl },
                      "submit-slip",
                      "แนบสลิปแล้ว รอตรวจสอบการชำระ",
                    )
                  }
                  disabled={!canSubmitSlip || loadingKey !== null}
                >
                  {loadingKey === "submit-slip" ? "กำลังบันทึก..." : "แนบสลิป / ส่งรอตรวจสอบ"}
                </Button>
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
                {order.shippingLabelUrl ? (
                  <a
                    href={order.shippingLabelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    เปิดป้ายจัดส่งล่าสุด
                  </a>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <input
                  value={shippingCarrier}
                  onChange={(event) => setShippingCarrier(event.target.value)}
                  placeholder="ขนส่ง (เช่น J&T, Flash)"
                  className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={!canUpdate || loadingKey !== null}
                />
                <input
                  value={trackingNo}
                  onChange={(event) => setTrackingNo(event.target.value)}
                  placeholder="เลขพัสดุ"
                  className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={!canUpdate || loadingKey !== null}
                />
                <input
                  value={shippingLabelUrl}
                  onChange={(event) => {
                    setShippingLabelUrl(event.target.value);
                    setShippingTemplateOverride(null);
                  }}
                  placeholder="ลิงก์รูปบิล/ป้ายจัดส่ง (https://...)"
                  className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={!canUpdate || loadingKey !== null}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => shippingLabelFileInputRef.current?.click()}
                    disabled={!canUpdate || loadingKey !== null}
                  >
                    {loadingKey === "upload-label-file" ? "กำลังอัปโหลด..." : "อัปโหลดรูปจากเครื่อง"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => shippingLabelCameraInputRef.current?.click()}
                    disabled={!canUpdate || loadingKey !== null}
                  >
                    {loadingKey === "upload-label-camera" ? "กำลังอัปโหลด..." : "ถ่ายรูปจากกล้อง"}
                  </Button>
                  <input
                    ref={shippingLabelFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!canUpdate || loadingKey !== null}
                    onChange={(event) => {
                      void handleShippingLabelFileChange(event, "file");
                    }}
                  />
                  <input
                    ref={shippingLabelCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={!canUpdate || loadingKey !== null}
                    onChange={(event) => {
                      void handleShippingLabelFileChange(event, "camera");
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  อัปโหลดเสร็จแล้วให้กด “บันทึกข้อมูลจัดส่ง” เพื่อยืนยันลงออเดอร์
                </p>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={shippingCost}
                  onChange={(event) => setShippingCost(event.target.value)}
                  placeholder="ต้นทุนค่าส่ง"
                  className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={!canUpdate || loadingKey !== null}
                />
              </div>

              <Button
                className="h-10 w-full sm:w-auto"
                onClick={() =>
                  runPatchAction(
                    {
                      action: "update_shipping",
                      shippingCarrier,
                      trackingNo,
                      shippingLabelUrl,
                      shippingCost: Number.isFinite(shippingCostNumber) ? shippingCostNumber : 0,
                    },
                    "update-shipping",
                    "บันทึกข้อมูลการจัดส่งแล้ว",
                  )
                }
                disabled={!canUpdate || loadingKey !== null}
              >
                {loadingKey === "update-shipping" ? "กำลังบันทึก..." : "บันทึกข้อมูลจัดส่ง"}
              </Button>

              <Button
                className="h-10 w-full sm:w-auto"
                onClick={createShippingLabel}
                disabled={!canCreateShippingLabel || loadingKey !== null}
              >
                {loadingKey === "create-label" ? "กำลังสร้างป้าย..." : "สร้าง Shipping Label"}
              </Button>

              <div className="space-y-2 border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-700">ข้อความแจ้งจัดส่ง (Manual fallback)</p>
                <textarea
                  className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
                  value={shippingMessageText}
                  onChange={(event) => setShippingTemplateOverride(event.target.value)}
                  disabled={loadingKey !== null}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" className="h-9" onClick={copyShippingMessage}>
                    คัดลอกข้อความ
                  </Button>
                  <a
                    href={shippingWaDeepLink ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex h-9 items-center justify-center rounded-md border text-xs font-medium ${
                      shippingWaDeepLink
                        ? "border-green-400 text-green-700"
                        : "pointer-events-none border-slate-200 text-slate-400"
                    }`}
                  >
                    เปิด WhatsApp
                  </a>
                  <a
                    href={messaging.facebookInboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 items-center justify-center rounded-md border border-blue-400 text-xs font-medium text-blue-700"
                  >
                    เปิด Facebook
                  </a>
                </div>
              </div>

              <Button
                className="h-10 w-full sm:w-auto"
                onClick={sendShippingUpdate}
                disabled={!canSendShippingUpdate || loadingKey !== null}
              >
                {loadingKey === "send-shipping" ? "กำลังส่ง..." : "ส่งข้อมูลจัดส่งให้ลูกค้า"}
              </Button>
            </article>
          ) : null}

          {showLaoQrMessaging ? (
            <article className="space-y-3 border-b border-slate-200 pb-4">
              <h2 className="text-sm font-semibold text-slate-900">การส่งข้อความ</h2>

              <Button className="h-10 w-full sm:w-auto" onClick={sendQr} disabled={loadingKey !== null}>
                {loadingKey === "send-qr"
                  ? "กำลังส่ง..."
                  : messaging.within24h
                    ? "Send QR (ส่งอัตโนมัติ)"
                    : "Send QR"}
              </Button>

              {!messaging.within24h ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  ลูกค้าเกิน 24 ชั่วโมง ต้องส่งแบบแมนนวล
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">
                  ลูกค้าอยู่ในช่วง 24 ชั่วโมง สามารถส่งอัตโนมัติได้
                </div>
              )}

              {!messaging.within24h ? (
                <>
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    className="min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" className="h-9" onClick={copyMessage}>
                      คัดลอกข้อความ
                    </Button>

                    <a
                      href={messaging.waDeepLink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex h-9 items-center justify-center rounded-md border text-xs font-medium ${
                        messaging.waDeepLink
                          ? "border-green-400 text-green-700"
                          : "pointer-events-none border-slate-200 text-slate-400"
                      }`}
                    >
                      เปิด WhatsApp
                    </a>

                    <a
                      href={messaging.facebookInboxUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 items-center justify-center rounded-md border border-blue-400 text-xs font-medium text-blue-700"
                    >
                      เปิด Facebook
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  ระบบจะใช้ข้อความอัตโนมัติพร้อมเลขออเดอร์และยอดชำระ
                </p>
              )}
            </article>
          ) : null}

          {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="space-y-3 border-y border-slate-200 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Action</h2>
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
                  onClick={() => printViaIframe(`/orders/${order.id}/print/receipt`, "receipt")}
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
                    ไม่มี action ถัดไปในสถานะนี้
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
                    onClick={() => printViaIframe(`/orders/${order.id}/print/receipt`, "receipt")}
                    disabled={receiptPrintLoading || labelPrintLoading}
                  >
                    {receiptPrintLoading ? "กำลังเปิดพิมพ์..." : "พิมพ์ใบเสร็จ"}
                  </Button>
                  {showShippingSection ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 text-xs"
                      onClick={() => printViaIframe(`/orders/${order.id}/print/label`, "label")}
                      disabled={receiptPrintLoading || labelPrintLoading}
                    >
                      {labelPrintLoading ? "กำลังเปิดพิมพ์..." : "พิมพ์ป้าย"}
                    </Button>
                  ) : null}
                </div>

                {showExtraActions ? (
                  <details className="rounded-md border border-slate-200 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700">
                      การทำงานเพิ่มเติม
                    </summary>
                    <div className="mt-2 space-y-2">
                      <Button
                        className="h-9 w-full"
                        variant="outline"
                        onClick={() =>
                          runPatchAction({ action: "mark_packed" }, "mark-packed", "อัปเดตเป็นแพ็กแล้ว")
                        }
                        disabled={!canMarkPacked || loadingKey !== null}
                      >
                        {loadingKey === "mark-packed" ? "กำลังบันทึก..." : "ยืนยันแพ็กแล้ว"}
                      </Button>
                      <Button
                        className="h-9 w-full"
                        variant="outline"
                        onClick={() =>
                          runPatchAction({ action: "mark_shipped" }, "mark-shipped", "อัปเดตเป็นจัดส่งแล้ว")
                        }
                        disabled={!canMarkShipped || loadingKey !== null}
                      >
                        {loadingKey === "mark-shipped" ? "กำลังบันทึก..." : "ยืนยันจัดส่งแล้ว"}
                      </Button>
                      <Button
                        className="h-9 w-full bg-orange-600 text-white hover:bg-orange-700"
                        onClick={() =>
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
                          )
                        }
                        disabled={codReturnDisabled}
                      >
                        {loadingKey === "mark-cod-returned" ? "กำลังบันทึก..." : "ตีกลับเข้าร้าน (COD)"}
                      </Button>
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
                {isPickupReadyPrepaid ? "ยืนยันรับสินค้าแล้ว?" : "ยืนยันรับชำระ?"}
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                {isPickupReadyPrepaid
                  ? "เมื่อยืนยันแล้วระบบจะตัดสต็อกจากรายการจองและปิดงานรับสินค้าทันที"
                  : "เมื่อยืนยันแล้วออเดอร์จะถูกอัปเดตเป็นสถานะชำระแล้วทันที"}
              </p>
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
                    : isPickupReadyPrepaid
                      ? "ยืนยันรับสินค้า"
                      : "ยืนยันรับชำระ"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
