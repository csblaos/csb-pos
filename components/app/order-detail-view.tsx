"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { currencyLabel, vatModeLabel } from "@/lib/finance/store-financial";
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
  canCancel: boolean;
};

const statusLabel: Record<OrderDetail["status"], string> = {
  DRAFT: "ร่าง",
  PENDING_PAYMENT: "รอชำระ",
  PAID: "ชำระแล้ว",
  PACKED: "แพ็กแล้ว",
  SHIPPED: "จัดส่งแล้ว",
  CANCELLED: "ยกเลิก",
};

const channelLabel: Record<OrderDetail["channel"], string> = {
  WALK_IN: "Walk-in",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
};

export function OrderDetailView({
  order,
  messaging,
  canUpdate,
  canMarkPaid,
  canPack,
  canShip,
  canCancel,
}: OrderDetailViewProps) {
  const router = useRouter();

  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [shippingCarrier, setShippingCarrier] = useState(order.shippingCarrier ?? "");
  const [trackingNo, setTrackingNo] = useState(order.trackingNo ?? "");
  const [shippingCost, setShippingCost] = useState(String(order.shippingCost));
  const [paymentSlipUrl, setPaymentSlipUrl] = useState(order.paymentSlipUrl ?? "");
  const [messageText, setMessageText] = useState(messaging.template);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canConfirmPaid = canMarkPaid && order.status === "PENDING_PAYMENT";
  const canSubmitSlip =
    canUpdate && order.status === "PENDING_PAYMENT" && order.paymentMethod === "LAO_QR";
  const canMarkPacked = canPack && order.status === "PAID";
  const canMarkShipped = canShip && order.status === "PACKED";
  const canOrderCancel =
    canCancel &&
    (order.status === "DRAFT" ||
      order.status === "PENDING_PAYMENT" ||
      order.status === "PAID" ||
      order.status === "PACKED" ||
      order.status === "SHIPPED");

  const shippingCostNumber = useMemo(() => Number(shippingCost || "0"), [shippingCost]);

  const runPatchAction = async (payload: Record<string, unknown>, key: string, successText: string) => {
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
      setErrorMessage(data?.message ?? "บันทึกไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setSuccessMessage(successText);
    setLoadingKey(null);
    router.refresh();
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

  return (
    <section className="space-y-4">
      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{order.orderNo}</p>
            <h1 className="text-xl font-semibold">รายละเอียดออเดอร์</h1>
            <p className="text-xs text-muted-foreground">
              ช่องทาง {channelLabel[order.channel]} • สถานะ {statusLabel[order.status]}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/orders/${order.id}/print/receipt`}
              target="_blank"
              className="rounded-md border px-2 py-1 text-xs font-medium text-slate-700"
            >
              ใบเสร็จ 80mm
            </Link>
            <Link
              href={`/orders/${order.id}/print/label`}
              target="_blank"
              className="rounded-md border px-2 py-1 text-xs font-medium text-slate-700"
            >
              ป้าย A6
            </Link>
          </div>
        </div>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">ข้อมูลลูกค้า</h2>
        <p className="text-sm">{order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป"}</p>
        <p className="text-xs text-muted-foreground">โทร: {order.customerPhone || order.contactPhone || "-"}</p>
        <p className="text-xs text-muted-foreground">ที่อยู่: {order.customerAddress || "-"}</p>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">รายการสินค้า</h2>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{item.productName}</p>
              <p className="text-xs text-muted-foreground">
                {item.productSku} • {item.qty.toLocaleString("th-TH")} {item.unitCode} ({item.qtyBase.toLocaleString("th-TH")} หน่วยฐาน)
              </p>
              <p className="mt-1">
                {item.lineTotal.toLocaleString("th-TH")} {order.storeCurrency}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p>ยอดสินค้า: {order.subtotal.toLocaleString("th-TH")} {order.storeCurrency}</p>
          <p>ส่วนลด: {order.discount.toLocaleString("th-TH")} {order.storeCurrency}</p>
          <p>
            VAT ({vatModeLabel(order.storeVatMode)}): {order.vatAmount.toLocaleString("th-TH")}{" "}
            {order.storeCurrency}
          </p>
          <p>ค่าส่งที่เรียกเก็บ: {order.shippingFeeCharged.toLocaleString("th-TH")} {order.storeCurrency}</p>
          <p className="font-semibold">ยอดรวม: {order.total.toLocaleString("th-TH")} {order.storeCurrency}</p>
          <p className="text-xs text-slate-500">
            สกุลชำระที่เลือก: {currencyLabel(order.paymentCurrency)}
          </p>
          <p className="text-xs text-slate-500">
            วิธีชำระ: {order.paymentMethod === "LAO_QR" ? "QR โอนเงิน" : "เงินสด"}
          </p>
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
        </div>
      </article>

      {order.paymentMethod === "LAO_QR" ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">ชำระด้วย QR โอนเงิน</h2>
          {order.paymentAccountQrImageUrl ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
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
              className="h-10 w-full"
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

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">การจัดส่ง</h2>

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
          className="h-10 w-full"
          onClick={() =>
            runPatchAction(
              {
                action: "update_shipping",
                shippingCarrier,
                trackingNo,
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
      </article>

      {order.paymentMethod === "LAO_QR" ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">การส่งข้อความ</h2>

          <Button className="h-10 w-full" onClick={sendQr} disabled={loadingKey !== null}>
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

      <article className="grid grid-cols-2 gap-2 rounded-xl border bg-white p-4 shadow-sm">
        <Button
          className="h-10"
          onClick={() => runPatchAction({ action: "confirm_paid" }, "confirm-paid", "ยืนยันชำระแล้ว")}
          disabled={!canConfirmPaid || loadingKey !== null}
        >
          {loadingKey === "confirm-paid" ? "กำลังบันทึก..." : "ยืนยันรับชำระ"}
        </Button>

        <Button
          className="h-10"
          onClick={() => runPatchAction({ action: "mark_packed" }, "mark-packed", "อัปเดตเป็นแพ็กแล้ว")}
          disabled={!canMarkPacked || loadingKey !== null}
        >
          {loadingKey === "mark-packed" ? "กำลังบันทึก..." : "Mark Packed"}
        </Button>

        <Button
          className="h-10"
          onClick={() => runPatchAction({ action: "mark_shipped" }, "mark-shipped", "อัปเดตเป็นจัดส่งแล้ว")}
          disabled={!canMarkShipped || loadingKey !== null}
        >
          {loadingKey === "mark-shipped" ? "กำลังบันทึก..." : "Mark Shipped"}
        </Button>

        <Button
          className="h-10 bg-rose-600 text-white hover:bg-rose-700"
          onClick={() => runPatchAction({ action: "cancel" }, "cancel", "ยกเลิกออเดอร์แล้ว")}
          disabled={!canOrderCancel || loadingKey !== null}
        >
          {loadingKey === "cancel" ? "กำลังบันทึก..." : "Cancel"}
        </Button>
      </article>

      <article className="rounded-xl border bg-white p-4 shadow-sm">
        <Button
          className="h-10 w-full"
          onClick={() => runPatchAction({ action: "submit_for_payment" }, "submit", "จองสต็อกและส่งไปรอชำระแล้ว")}
          disabled={order.status !== "DRAFT" || loadingKey !== null || !canUpdate}
        >
          {loadingKey === "submit" ? "กำลังบันทึก..." : "ส่งเป็นรอชำระ (จองสต็อก)"}
        </Button>
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
