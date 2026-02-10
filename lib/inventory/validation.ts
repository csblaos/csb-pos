import { z } from "zod";

export const stockMovementSchema = z
  .object({
    productId: z.string().min(1, "กรุณาเลือกสินค้า"),
    movementType: z.enum(["IN", "ADJUST", "RETURN"]),
    unitId: z.string().min(1, "กรุณาเลือกหน่วย"),
    qty: z.coerce
      .number({ message: "กรอกจำนวนให้ถูกต้อง" })
      .positive("จำนวนต้องมากกว่า 0"),
    adjustMode: z.enum(["INCREASE", "DECREASE"]).optional(),
    note: z.string().trim().max(240).optional().or(z.literal("")),
  })
  .superRefine((payload, ctx) => {
    if (payload.movementType === "ADJUST" && !payload.adjustMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjustMode"],
        message: "กรุณาเลือกประเภทการปรับสต็อก",
      });
    }
  });

export type StockMovementInput = z.output<typeof stockMovementSchema>;
