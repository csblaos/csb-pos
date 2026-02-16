import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  supplierName: z.string().trim().max(100).optional().or(z.literal("")),
  supplierContact: z.string().trim().max(100).optional().or(z.literal("")),
  purchaseCurrency: z.enum(["LAK", "THB", "USD"]),
  exchangeRate: z.coerce
    .number({ message: "กรุณากรอกอัตราแลกเปลี่ยน" })
    .positive("อัตราแลกเปลี่ยนต้องมากกว่า 0"),
  shippingCost: z.coerce.number().int().min(0).default(0),
  otherCost: z.coerce.number().int().min(0).default(0),
  otherCostNote: z.string().trim().max(240).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  expectedAt: z.string().trim().optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "กรุณาเลือกสินค้า"),
        qtyOrdered: z.coerce
          .number({ message: "กรอกจำนวนให้ถูกต้อง" })
          .int("จำนวนต้องเป็นจำนวนเต็ม")
          .positive("จำนวนต้องมากกว่า 0"),
        unitCostPurchase: z.coerce
          .number({ message: "กรอกราคาให้ถูกต้อง" })
          .int("ราคาต้องเป็นจำนวนเต็ม")
          .min(0, "ราคาต้องไม่ติดลบ"),
      }),
    )
    .min(1, "ต้องมีอย่างน้อย 1 รายการสินค้า"),
  /** shortcut: skip ORDERED and go directly to RECEIVED */
  receiveImmediately: z.boolean().default(false),
});

export type CreatePurchaseOrderInput = z.output<typeof createPurchaseOrderSchema>;

export const updatePOStatusSchema = z.object({
  status: z.enum(["ORDERED", "SHIPPED", "RECEIVED", "CANCELLED"]),
  trackingInfo: z.string().trim().max(240).optional().or(z.literal("")),
  /** Only used when status=RECEIVED  — actual received qty per item */
  receivedItems: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qtyReceived: z.coerce.number().int().min(0),
      }),
    )
    .optional(),
});

export type UpdatePOStatusInput = z.output<typeof updatePOStatusSchema>;
