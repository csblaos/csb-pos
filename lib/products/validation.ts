import { z } from "zod";
import {
  canonicalizeVariantOptions,
  normalizeVariantCode,
} from "@/lib/products/variant-options";

const optionalNonNegativeInt = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0, "ต้องไม่ติดลบ").optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().max(max, `ความยาวต้องไม่เกิน ${max} ตัวอักษร`),
  );

export const productConversionSchema = z.object({
  unitId: z.string().min(1, "กรุณาเลือกหน่วย"),
  multiplierToBase: z.coerce
    .number({ message: "กรอกตัวคูณให้ถูกต้อง" })
    .int("ตัวคูณต้องเป็นจำนวนเต็ม")
    .min(2, "ตัวคูณต้องมากกว่า 1"),
});

const productVariantOptionSchema = z.object({
  attributeCode: optionalText(40),
  attributeName: optionalText(80),
  valueCode: optionalText(40),
  valueName: optionalText(120),
});

const productVariantSchema = z
  .object({
    enabled: z.boolean().default(false),
    modelName: optionalText(180),
    variantLabel: optionalText(180),
    variantSortOrder: z.coerce
      .number({ message: "ลำดับการแสดงต้องเป็นตัวเลข" })
      .int("ลำดับการแสดงต้องเป็นจำนวนเต็ม")
      .min(0, "ลำดับการแสดงต้องไม่ติดลบ")
      .max(9999, "ลำดับการแสดงมากเกินไป")
      .default(0),
    options: z.array(productVariantOptionSchema).max(12).default([]),
  })
  .superRefine((variant, ctx) => {
    if (!variant.enabled) return;

    if (!variant.modelName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modelName"],
        message: "กรุณากรอกชื่อสินค้าแม่ (Model)",
      });
    }

    if (!variant.variantLabel.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variantLabel"],
        message: "กรุณากรอกชื่อ Variant",
      });
    }

    const usedAttributeCodes = new Set<string>();

    variant.options.forEach((option, index) => {
      const attributeCode = option.attributeCode.trim();
      const attributeName = option.attributeName.trim();
      const valueCode = option.valueCode.trim();
      const valueName = option.valueName.trim();

      const isBlankRow =
        !attributeCode && !attributeName && !valueCode && !valueName;
      if (isBlankRow) return;

      if (!attributeName || !valueName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options", index],
          message: "แถวตัวเลือกต้องกรอกชื่อคุณสมบัติและค่าตัวเลือกให้ครบ",
        });
        return;
      }

      const normalizedAttributeCode = normalizeVariantCode(
        attributeCode,
        attributeName,
      );
      if (usedAttributeCodes.has(normalizedAttributeCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options", index, "attributeCode"],
          message: "ห้ามใช้รหัสคุณสมบัติซ้ำใน Variant เดียวกัน",
        });
        return;
      }

      usedAttributeCodes.add(normalizedAttributeCode);
    });
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
    variant: productVariantSchema.default({
      enabled: false,
      modelName: "",
      variantLabel: "",
      variantSortOrder: 0,
      options: [],
    }),
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
  variant: payload.variant.enabled
    ? {
        modelName: payload.variant.modelName.trim(),
        variantLabel: payload.variant.variantLabel.trim(),
        variantSortOrder: payload.variant.variantSortOrder ?? 0,
        options: canonicalizeVariantOptions(
          payload.variant.options.flatMap((option) => {
            const attributeName = option.attributeName.trim();
            const valueName = option.valueName.trim();
            if (!attributeName || !valueName) return [];

            return [
              {
                attributeCode: option.attributeCode.trim(),
                attributeName,
                valueCode: option.valueCode.trim(),
                valueName,
              },
            ];
          }),
        ),
      }
    : null,
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
