import { z } from "zod";

const optionalNonNegativeInt = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0, "ต้องไม่ติดลบ").optional(),
);

export const productConversionSchema = z.object({
  unitId: z.string().min(1, "กรุณาเลือกหน่วย"),
  multiplierToBase: z.coerce
    .number({ message: "กรอกตัวคูณให้ถูกต้อง" })
    .int("ตัวคูณต้องเป็นจำนวนเต็ม")
    .min(2, "ตัวคูณต้องมากกว่า 1"),
});

export const productUpsertSchema = z
  .object({
    sku: z.string().trim().min(1, "กรุณากรอก SKU").max(60, "SKU ยาวเกินไป"),
    name: z.string().trim().min(1, "กรุณากรอกชื่อสินค้า").max(180),
    barcode: z.string().trim().max(64).optional().or(z.literal("")),
    baseUnitId: z.string().min(1, "กรุณาเลือกหน่วยหลัก"),
    priceBase: z.coerce
      .number({ message: "กรอกราคาขายให้ถูกต้อง" })
      .int("ราคาขายต้องเป็นจำนวนเต็ม")
      .min(0, "ราคาขายต้องไม่ติดลบ"),
    costBase: z.coerce
      .number({ message: "กรอกต้นทุนให้ถูกต้อง" })
      .int("ต้นทุนต้องเป็นจำนวนเต็ม")
      .min(0, "ต้นทุนต้องไม่ติดลบ")
      .default(0),
    outStockThreshold: optionalNonNegativeInt,
    lowStockThreshold: optionalNonNegativeInt,
    categoryId: z.string().trim().optional().or(z.literal("")),
    conversions: z.array(productConversionSchema).max(20).default([]),
  })
  .superRefine((data, ctx) => {
    if (
      data.outStockThreshold !== undefined &&
      data.lowStockThreshold !== undefined &&
      data.lowStockThreshold < data.outStockThreshold
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lowStockThreshold"],
        message: "ค่าสต็อกต่ำต้องมากกว่าหรือเท่ากับค่าสต็อกหมด",
      });
    }

    const unitIds = new Set<string>();

    data.conversions.forEach((conversion, index) => {
      if (conversion.unitId === data.baseUnitId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["conversions", index, "unitId"],
          message: "หน่วยแปลงต้องไม่ซ้ำกับหน่วยหลัก",
        });
      }

      if (unitIds.has(conversion.unitId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["conversions", index, "unitId"],
          message: "หน่วยนี้ถูกเพิ่มแล้ว",
        });
      }

      unitIds.add(conversion.unitId);
    });
  });

export const createUnitSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "กรุณากรอกรหัสหน่วย")
    .max(20, "รหัสหน่วยยาวเกินไป")
    .regex(/^[A-Za-z0-9_\-]+$/, "รหัสหน่วยใช้ได้เฉพาะ A-Z, 0-9, _ และ -"),
  nameTh: z.string().trim().min(1, "กรุณากรอกชื่อหน่วย").max(80),
});

export const updateProductSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    data: productUpsertSchema,
  }),
  z.object({
    action: z.literal("set_active"),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("update_cost"),
    costBase: z.coerce
      .number({ message: "กรอกต้นทุนให้ถูกต้อง" })
      .int("ต้นทุนต้องเป็นจำนวนเต็ม")
      .min(0, "ต้นทุนต้องไม่ติดลบ"),
  }),
  z.object({
    action: z.literal("remove_image"),
  }),
]);

export type ProductUpsertInput = z.output<typeof productUpsertSchema>;
export type ProductUpsertFormInput = z.input<typeof productUpsertSchema>;
export type ProductConversionInput = z.output<typeof productConversionSchema>;
export type CreateUnitInput = z.output<typeof createUnitSchema>;
export type CreateUnitFormInput = z.input<typeof createUnitSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;

export const normalizeProductPayload = (payload: ProductUpsertInput) => ({
  sku: payload.sku.trim(),
  name: payload.name.trim(),
  barcode: payload.barcode?.trim() ? payload.barcode.trim() : null,
  baseUnitId: payload.baseUnitId,
  priceBase: payload.priceBase,
  costBase: payload.costBase,
  outStockThreshold:
    payload.outStockThreshold !== undefined ? payload.outStockThreshold : null,
  lowStockThreshold:
    payload.lowStockThreshold !== undefined ? payload.lowStockThreshold : null,
  categoryId: payload.categoryId?.trim() ? payload.categoryId.trim() : null,
  conversions: payload.conversions,
});

export const normalizeUnitPayload = (payload: CreateUnitInput) => ({
  code: payload.code.trim().toUpperCase(),
  nameTh: payload.nameTh.trim(),
});
