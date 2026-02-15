import { z } from "zod";

export const orderChannelSchema = z.enum(["WALK_IN", "FACEBOOK", "WHATSAPP"]);
export const orderPaymentCurrencySchema = z.enum(["LAK", "THB", "USD"]);
export const orderPaymentMethodSchema = z.enum(["CASH", "LAO_QR"]);

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
    items: z.array(createOrderItemSchema).min(1, "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ").max(100),
  })
  .superRefine((payload, ctx) => {
    if (payload.channel !== "WALK_IN" && !payload.contactId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactId"],
        message: "กรุณาเลือกลูกค้าจากช่องทางที่เลือก",
      });
    }

    if (payload.paymentMethod === "LAO_QR" && !payload.paymentAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentAccountId"],
        message: "กรุณาเลือกบัญชี QR สำหรับออเดอร์นี้",
      });
    }
  });

export const updateOrderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit_for_payment") }),
  z.object({ action: z.literal("confirm_paid") }),
  z.object({
    action: z.literal("submit_payment_slip"),
    paymentSlipUrl: z.string().trim().url("ลิงก์สลิปไม่ถูกต้อง"),
  }),
  z.object({ action: z.literal("mark_packed") }),
  z.object({ action: z.literal("mark_shipped") }),
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("update_shipping"),
    shippingCarrier: z.string().trim().max(120).optional().or(z.literal("")),
    trackingNo: z.string().trim().max(120).optional().or(z.literal("")),
    shippingCost: z.coerce
      .number({ message: "กรอกต้นทุนค่าส่งให้ถูกต้อง" })
      .int("ต้นทุนค่าส่งต้องเป็นจำนวนเต็ม")
      .min(0, "ต้นทุนค่าส่งต้องไม่ติดลบ"),
  }),
]);

export type CreateOrderInput = z.output<typeof createOrderSchema>;
export type CreateOrderFormInput = z.input<typeof createOrderSchema>;
export type UpdateOrderInput = z.output<typeof updateOrderSchema>;
