import { z } from "zod";

export const orderChannelSchema = z.enum(["WALK_IN", "FACEBOOK", "WHATSAPP"]);
export const orderPaymentCurrencySchema = z.enum(["LAK", "THB", "USD"]);
export const orderPaymentMethodSchema = z.enum([
  "CASH",
  "LAO_QR",
  "ON_CREDIT",
  "COD",
  "BANK_TRANSFER",
]);
export const orderCheckoutFlowSchema = z.enum([
  "WALK_IN_NOW",
  "PICKUP_LATER",
  "ONLINE_DELIVERY",
]);

export const createOrderItemSchema = z.object({
  productId: z.string().min(1, "กรุณาเลือกสินค้า"),
  unitId: z.string().min(1, "กรุณาเลือกหน่วย"),
  qty: z.coerce
    .number({ message: "กรอกจำนวนให้ถูกต้อง" })
    .int("จำนวนต้องเป็นจำนวนเต็ม")
    .positive("จำนวนต้องมากกว่า 0"),
});

export const createOrderSchema = z
  .object({
    channel: orderChannelSchema,
    contactId: z.string().optional().or(z.literal("")),
    customerName: z.string().trim().max(120).optional().or(z.literal("")),
    customerPhone: z.string().trim().max(30).optional().or(z.literal("")),
    customerAddress: z.string().trim().max(500).optional().or(z.literal("")),
    shippingProvider: z.string().trim().max(120).optional().or(z.literal("")),
    shippingCarrier: z.string().trim().max(160).optional().or(z.literal("")),
    discount: z.coerce
      .number({ message: "กรอกส่วนลดให้ถูกต้อง" })
      .int("ส่วนลดต้องเป็นจำนวนเต็ม")
      .min(0, "ส่วนลดต้องไม่ติดลบ"),
    shippingFeeCharged: z.coerce
      .number({ message: "กรอกค่าส่งที่เรียกเก็บให้ถูกต้อง" })
      .int("ค่าส่งที่เรียกเก็บต้องเป็นจำนวนเต็ม")
      .min(0, "ค่าส่งที่เรียกเก็บต้องไม่ติดลบ"),
    shippingCost: z.coerce
      .number({ message: "กรอกต้นทุนค่าส่งให้ถูกต้อง" })
      .int("ต้นทุนค่าส่งต้องเป็นจำนวนเต็ม")
      .min(0, "ต้นทุนค่าส่งต้องไม่ติดลบ"),
    paymentCurrency: orderPaymentCurrencySchema.optional(),
    paymentMethod: orderPaymentMethodSchema.optional(),
    paymentAccountId: z.string().trim().optional().or(z.literal("")),
    checkoutFlow: orderCheckoutFlowSchema.optional(),
    items: z.array(createOrderItemSchema).min(1, "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ").max(100),
  })
  .superRefine((payload, ctx) => {
    if (
      (payload.paymentMethod === "LAO_QR" || payload.paymentMethod === "BANK_TRANSFER") &&
      !payload.paymentAccountId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentAccountId"],
        message:
          payload.paymentMethod === "LAO_QR"
            ? "กรุณาเลือกบัญชี QR สำหรับออเดอร์นี้"
            : "กรุณาเลือกบัญชีโอนเงินสำหรับออเดอร์นี้",
        });
    }

    if (payload.checkoutFlow === "ONLINE_DELIVERY" && payload.channel === "WALK_IN") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["channel"],
        message: "ออเดอร์จัดส่งต้องเลือกช่องทางออนไลน์",
      });
    }

    if (payload.paymentMethod === "COD" && payload.checkoutFlow !== "ONLINE_DELIVERY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentMethod"],
        message: "COD ใช้ได้เฉพาะออเดอร์สั่งออนไลน์/จัดส่ง",
      });
    }

    if (
      (payload.checkoutFlow === "WALK_IN_NOW" || payload.checkoutFlow === "PICKUP_LATER") &&
      payload.channel !== "WALK_IN"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["channel"],
        message: "ออเดอร์หน้าร้าน/รับที่ร้านต้องใช้ช่องทาง Walk-in",
      });
    }
  });

export const updateOrderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit_for_payment") }),
  z.object({
    action: z.literal("confirm_paid"),
    codAmount: z.coerce
      .number({ message: "ยอด COD ต้องเป็นตัวเลข" })
      .int("ยอด COD ต้องเป็นจำนวนเต็ม")
      .min(0, "ยอด COD ต้องไม่ติดลบ")
      .optional(),
  }),
  z.object({ action: z.literal("mark_picked_up_unpaid") }),
  z.object({
    action: z.literal("submit_payment_slip"),
    paymentSlipUrl: z.string().trim().url("ลิงก์สลิปไม่ถูกต้อง"),
  }),
  z.object({ action: z.literal("mark_packed") }),
  z.object({ action: z.literal("mark_shipped") }),
  z.object({
    action: z.literal("mark_cod_returned"),
    codFee: z.coerce
      .number({ message: "ค่าตีกลับต้องเป็นตัวเลข" })
      .int("ค่าตีกลับต้องเป็นจำนวนเต็ม")
      .min(0, "ค่าตีกลับต้องไม่ติดลบ")
      .optional(),
    codReturnNote: z.string().trim().max(500, "หมายเหตุยาวเกินไป").optional().or(z.literal("")),
  }),
  z.object({
    action: z.literal("cancel"),
    approvalMode: z.enum(["MANAGER_PASSWORD", "SELF_SLIDE"]).default("MANAGER_PASSWORD"),
    approvalEmail: z.string().trim().email("อีเมลผู้อนุมัติไม่ถูกต้อง").optional(),
    approvalPassword: z
      .string()
      .trim()
      .min(8, "รหัสผ่านผู้อนุมัติต้องมีอย่างน้อย 8 ตัวอักษร")
      .max(128, "รหัสผ่านผู้อนุมัติยาวเกินไป")
      .optional(),
    confirmBySlide: z.literal(true).optional(),
    cancelReason: z
      .string()
      .trim()
      .min(1, "กรุณาระบุเหตุผลการยกเลิก")
      .max(300, "เหตุผลการยกเลิกยาวเกินไป"),
  }).superRefine((value, ctx) => {
    if (value.approvalMode === "MANAGER_PASSWORD") {
      if (!value.approvalEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approvalEmail"],
          message: "กรุณากรอกอีเมลผู้อนุมัติ",
        });
      }
      if (!value.approvalPassword || value.approvalPassword.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approvalPassword"],
          message: "รหัสผ่านผู้อนุมัติต้องมีอย่างน้อย 8 ตัวอักษร",
        });
      }
      return;
    }

    if (value.confirmBySlide !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmBySlide"],
        message: "กรุณายืนยันการยกเลิกด้วยสไลด์",
      });
    }
  }),
  z.object({
    action: z.literal("update_shipping"),
    shippingCarrier: z.string().trim().max(120).optional().or(z.literal("")),
    trackingNo: z.string().trim().max(120).optional().or(z.literal("")),
    shippingLabelUrl: z
      .string()
      .trim()
      .max(2000, "ลิงก์ป้ายจัดส่งยาวเกินไป")
      .optional()
      .or(z.literal(""))
      .refine(
        (value) =>
          value === undefined ||
          value === "" ||
          /^https?:\/\//i.test(value) ||
          value.startsWith("/"),
        "ลิงก์ป้ายจัดส่งไม่ถูกต้อง",
      ),
    shippingCost: z.coerce
      .number({ message: "กรอกต้นทุนค่าส่งให้ถูกต้อง" })
      .int("ต้นทุนค่าส่งต้องเป็นจำนวนเต็ม")
      .min(0, "ต้นทุนค่าส่งต้องไม่ติดลบ"),
  }),
]);

export type CreateOrderInput = z.output<typeof createOrderSchema>;
export type CreateOrderFormInput = z.input<typeof createOrderSchema>;
export type UpdateOrderInput = z.output<typeof updateOrderSchema>;
