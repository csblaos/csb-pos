import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import { isPostgresConfigured, type PostgresTransaction } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import type { RequestContext } from "@/lib/http/request-context";
import type { ProductListItem } from "@/lib/products/service";
import type { ProductVariantOption } from "@/lib/products/variant-options";
import { getStoreProductByIdDirectFromPostgres } from "@/lib/platform/postgres-products-onboarding";

type NormalizedVariantPayload = {
  modelName: string;
  variantLabel: string;
  variantSortOrder: number;
  options: ProductVariantOption[];
};

type NormalizedProductPayload = {
  variant: NormalizedVariantPayload | null;
  sku: string;
  name: string;
  barcode: string | null;
  baseUnitId: string;
  priceBase: number;
  costBase: number;
  outStockThreshold: number | null;
  lowStockThreshold: number | null;
  categoryId: string | null;
  conversions: Array<{
    unitId: string;
    multiplierToBase: number;
    pricePerUnit?: number | null;
  }>;
};

type ProductWriteError =
  | "NOT_FOUND"
  | "CONFLICT_SKU"
  | "INVALID_UNIT"
  | "INVALID_CATEGORY"
  | "VARIANT_CONFLICT";

type ProductWriteResult =
  | { ok: true; product: ProductListItem | null }
  | { ok: false; error: ProductWriteError };

type ProductActionResult =
  | { ok: true; unchanged?: true }
  | { ok: false; error: "NOT_FOUND" };

type ProductCostWriteResult =
  | { ok: true; unchanged?: true }
  | { ok: false; error: "NOT_FOUND" };

type VariantColumns = {
  modelId: string | null;
  variantLabel: string | null;
  variantOptionsJson: string | null;
  variantSortOrder: number;
};

const getErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isModelNameUniqueError = (error: unknown) =>
  /product_models_store_name_unique|duplicate key value violates unique constraint "product_models_store_name_unique"/i.test(
    getErrorText(error),
  );

const isVariantCombinationUniqueError = (error: unknown) =>
  /products_model_variant_options_unique|duplicate key value violates unique constraint "products_model_variant_options_unique"/i.test(
    getErrorText(error),
  );

const asJsonText = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

export const isPostgresProductsWriteEnabled = () =>
  isPostgresConfigured();

export const logProductsWriteFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[products.write.pg] fallback to turso for ${operation}: ${message}`);
};

const appendArrayReplacements = (
  replacements: Record<string, unknown>,
  prefix: string,
  values: string[],
) => {
  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`;
    replacements[key] = value;
    return `:${key}`;
  });

  return placeholders.length > 0 ? placeholders.join(", ") : "null";
};

const ensureCategoryExists = async (
  tx: PostgresTransaction,
  storeId: string,
  categoryId: string | null,
) => {
  if (!categoryId) {
    return true;
  }

  const row = await queryOne<{ id: string }>(
    `
      select id
      from product_categories
      where id = :categoryId and store_id = :storeId
      limit 1
    `,
    {
      replacements: { categoryId, storeId },
      transaction: tx,
    },
  );

  return Boolean(row);
};

const ensureUnitsExist = async (
  tx: PostgresTransaction,
  storeId: string,
  unitIds: string[],
) => {
  if (unitIds.length === 0) {
    return true;
  }

  const replacements: Record<string, unknown> = { storeId };
  const placeholders = appendArrayReplacements(replacements, "unitId", unitIds);
  const row = await queryOne<{ total: number | string | null }>(
    `
      select count(*) as total
      from units
      where
        id in (${placeholders})
        and (
          scope = 'SYSTEM'
          or (scope = 'STORE' and store_id = :storeId)
        )
    `,
    {
      replacements,
      transaction: tx,
    },
  );

  return Number(row?.total ?? 0) === unitIds.length;
};

const ensureVariantModel = async (
  tx: PostgresTransaction,
  input: {
    storeId: string;
    categoryId: string | null;
    modelName: string;
  },
) => {
  const existing = await queryOne<{ id: string; categoryId: string | null }>(
    `
      select
        id,
        category_id as "categoryId"
      from product_models
      where store_id = :storeId and name = :modelName
      limit 1
    `,
    {
      replacements: input,
      transaction: tx,
    },
  );

  if (existing) {
    if (input.categoryId && !existing.categoryId) {
      await execute(
        `
          update product_models
          set category_id = :categoryId
          where id = :modelId
        `,
        {
          replacements: {
            categoryId: input.categoryId,
            modelId: existing.id,
          },
          transaction: tx,
        },
      );
    }

    return existing.id;
  }

  const modelId = randomUUID();
  try {
    await execute(
      `
        insert into product_models (
          id,
          store_id,
          name,
          category_id,
          active
        )
        values (
          :id,
          :storeId,
          :name,
          :categoryId,
          true
        )
      `,
      {
        replacements: {
          id: modelId,
          storeId: input.storeId,
          name: input.modelName,
          categoryId: input.categoryId,
        },
        transaction: tx,
      },
    );

    return modelId;
  } catch (error) {
    if (!isModelNameUniqueError(error)) {
      throw error;
    }

    const concurrent = await queryOne<{ id: string }>(
      `
        select id
        from product_models
        where store_id = :storeId and name = :modelName
        limit 1
      `,
      {
        replacements: input,
        transaction: tx,
      },
    );

    if (!concurrent) {
      throw error;
    }

    return concurrent.id;
  }
};

const ensureVariantDictionary = async (
  tx: PostgresTransaction,
  modelId: string,
  options: ProductVariantOption[],
) => {
  for (const [index, option] of options.entries()) {
    const existingAttribute = await queryOne<{ id: string; name: string }>(
      `
        select
          id,
          name
        from product_model_attributes
        where model_id = :modelId and code = :code
        limit 1
      `,
      {
        replacements: {
          modelId,
          code: option.attributeCode,
        },
        transaction: tx,
      },
    );

    const attributeId = existingAttribute?.id ?? randomUUID();

    if (!existingAttribute) {
      await execute(
        `
          insert into product_model_attributes (
            id,
            model_id,
            code,
            name,
            sort_order
          )
          values (
            :id,
            :modelId,
            :code,
            :name,
            :sortOrder
          )
        `,
        {
          replacements: {
            id: attributeId,
            modelId,
            code: option.attributeCode,
            name: option.attributeName,
            sortOrder: index,
          },
          transaction: tx,
        },
      );
    } else if (existingAttribute.name !== option.attributeName) {
      await execute(
        `
          update product_model_attributes
          set name = :name
          where id = :id
        `,
        {
          replacements: {
            id: attributeId,
            name: option.attributeName,
          },
          transaction: tx,
        },
      );
    }

    const existingValue = await queryOne<{ id: string; name: string }>(
      `
        select
          id,
          name
        from product_model_attribute_values
        where attribute_id = :attributeId and code = :code
        limit 1
      `,
      {
        replacements: {
          attributeId,
          code: option.valueCode,
        },
        transaction: tx,
      },
    );

    if (!existingValue) {
      await execute(
        `
          insert into product_model_attribute_values (
            id,
            attribute_id,
            code,
            name,
            sort_order
          )
          values (
            :id,
            :attributeId,
            :code,
            :name,
            0
          )
        `,
        {
          replacements: {
            id: randomUUID(),
            attributeId,
            code: option.valueCode,
            name: option.valueName,
          },
          transaction: tx,
        },
      );
    } else if (existingValue.name !== option.valueName) {
      await execute(
        `
          update product_model_attribute_values
          set name = :name
          where id = :id
        `,
        {
          replacements: {
            id: existingValue.id,
            name: option.valueName,
          },
          transaction: tx,
        },
      );
    }
  }
};

const buildVariantColumnsInPostgres = async (
  tx: PostgresTransaction,
  input: {
    storeId: string;
    categoryId: string | null;
    variant: NormalizedVariantPayload | null;
  },
): Promise<VariantColumns> => {
  if (!input.variant) {
    return {
      modelId: null,
      variantLabel: null,
      variantOptionsJson: null,
      variantSortOrder: 0,
    };
  }

  const modelId = await ensureVariantModel(tx, {
    storeId: input.storeId,
    categoryId: input.categoryId,
    modelName: input.variant.modelName,
  });

  if (input.variant.options.length > 0) {
    await ensureVariantDictionary(tx, modelId, input.variant.options);
  }

  return {
    modelId,
    variantLabel: input.variant.variantLabel,
    variantOptionsJson:
      input.variant.options.length > 0 ? JSON.stringify(input.variant.options) : null,
    variantSortOrder: input.variant.variantSortOrder,
  };
};

export const createProductInPostgres = async (input: {
  storeId: string;
  payload: NormalizedProductPayload;
}): Promise<ProductWriteResult> => {
  const productId = randomUUID();

  try {
    await runInTransaction(async (tx) => {
      const existingSku = await queryOne<{ id: string }>(
        `
          select id
          from products
          where store_id = :storeId and sku = :sku
          limit 1
        `,
        {
          replacements: {
            storeId: input.storeId,
            sku: input.payload.sku,
          },
          transaction: tx,
        },
      );

      if (existingSku) {
        throw new Error("CONFLICT_SKU");
      }

      const unitIds = [
        ...new Set([
          input.payload.baseUnitId,
          ...input.payload.conversions.map((item) => item.unitId),
        ]),
      ];

      const [categoryExists, unitsExist] = await Promise.all([
        ensureCategoryExists(tx, input.storeId, input.payload.categoryId),
        ensureUnitsExist(tx, input.storeId, unitIds),
      ]);

      if (!categoryExists) {
        throw new Error("INVALID_CATEGORY");
      }

      if (!unitsExist) {
        throw new Error("INVALID_UNIT");
      }

      const variantColumns = await buildVariantColumnsInPostgres(tx, {
        storeId: input.storeId,
        categoryId: input.payload.categoryId,
        variant: input.payload.variant,
      });

      await execute(
        `
          insert into products (
            id,
            store_id,
            sku,
            name,
            barcode,
            model_id,
            variant_label,
            variant_options_json,
            variant_sort_order,
            category_id,
            base_unit_id,
            price_base,
            cost_base,
            out_stock_threshold,
            low_stock_threshold,
            active
          )
          values (
            :id,
            :storeId,
            :sku,
            :name,
            :barcode,
            :modelId,
            :variantLabel,
            :variantOptionsJson,
            :variantSortOrder,
            :categoryId,
            :baseUnitId,
            :priceBase,
            :costBase,
            :outStockThreshold,
            :lowStockThreshold,
            true
          )
        `,
        {
          replacements: {
            id: productId,
            storeId: input.storeId,
            sku: input.payload.sku,
            name: input.payload.name,
            barcode: input.payload.barcode,
            modelId: variantColumns.modelId,
            variantLabel: variantColumns.variantLabel,
            variantOptionsJson: variantColumns.variantOptionsJson,
            variantSortOrder: variantColumns.variantSortOrder,
            categoryId: input.payload.categoryId,
            baseUnitId: input.payload.baseUnitId,
            priceBase: input.payload.priceBase,
            costBase: input.payload.costBase,
            outStockThreshold: input.payload.outStockThreshold,
            lowStockThreshold: input.payload.lowStockThreshold,
          },
          transaction: tx,
        },
      );

      for (const conversion of input.payload.conversions) {
        await execute(
          `
            insert into product_units (
              id,
              product_id,
              unit_id,
              multiplier_to_base,
              price_per_unit
            )
            values (
              :id,
              :productId,
              :unitId,
              :multiplierToBase,
              :pricePerUnit
            )
          `,
          {
            replacements: {
              id: randomUUID(),
              productId,
              unitId: conversion.unitId,
              multiplierToBase: conversion.multiplierToBase,
              pricePerUnit: conversion.pricePerUnit ?? null,
            },
            transaction: tx,
          },
        );
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "CONFLICT_SKU" ||
        error.message === "INVALID_UNIT" ||
        error.message === "INVALID_CATEGORY"
      ) {
        return { ok: false, error: error.message as ProductWriteError };
      }
    }

    if (isVariantCombinationUniqueError(error)) {
      return { ok: false, error: "VARIANT_CONFLICT" };
    }

    throw error;
  }

  const product = await getStoreProductByIdDirectFromPostgres(input.storeId, productId);
  return { ok: true, product };
};

export const updateProductInPostgres = async (input: {
  storeId: string;
  productId: string;
  payload: NormalizedProductPayload;
}): Promise<ProductWriteResult> => {
  try {
    await runInTransaction(async (tx) => {
      const targetProduct = await queryOne<{ id: string }>(
        `
          select id
          from products
          where id = :productId and store_id = :storeId
          limit 1
        `,
        {
          replacements: {
            productId: input.productId,
            storeId: input.storeId,
          },
          transaction: tx,
        },
      );

      if (!targetProduct) {
        throw new Error("NOT_FOUND");
      }

      const existingSku = await queryOne<{ id: string }>(
        `
          select id
          from products
          where store_id = :storeId and sku = :sku
          limit 1
        `,
        {
          replacements: {
            storeId: input.storeId,
            sku: input.payload.sku,
          },
          transaction: tx,
        },
      );

      if (existingSku && existingSku.id !== input.productId) {
        throw new Error("CONFLICT_SKU");
      }

      const unitIds = [
        ...new Set([
          input.payload.baseUnitId,
          ...input.payload.conversions.map((item) => item.unitId),
        ]),
      ];

      const [categoryExists, unitsExist] = await Promise.all([
        ensureCategoryExists(tx, input.storeId, input.payload.categoryId),
        ensureUnitsExist(tx, input.storeId, unitIds),
      ]);

      if (!categoryExists) {
        throw new Error("INVALID_CATEGORY");
      }

      if (!unitsExist) {
        throw new Error("INVALID_UNIT");
      }

      const variantColumns = await buildVariantColumnsInPostgres(tx, {
        storeId: input.storeId,
        categoryId: input.payload.categoryId,
        variant: input.payload.variant,
      });

      await execute(
        `
          update products
          set
            sku = :sku,
            name = :name,
            barcode = :barcode,
            model_id = :modelId,
            variant_label = :variantLabel,
            variant_options_json = :variantOptionsJson,
            variant_sort_order = :variantSortOrder,
            category_id = :categoryId,
            base_unit_id = :baseUnitId,
            price_base = :priceBase,
            cost_base = :costBase,
            out_stock_threshold = :outStockThreshold,
            low_stock_threshold = :lowStockThreshold
          where id = :productId and store_id = :storeId
        `,
        {
          replacements: {
            productId: input.productId,
            storeId: input.storeId,
            sku: input.payload.sku,
            name: input.payload.name,
            barcode: input.payload.barcode,
            modelId: variantColumns.modelId,
            variantLabel: variantColumns.variantLabel,
            variantOptionsJson: variantColumns.variantOptionsJson,
            variantSortOrder: variantColumns.variantSortOrder,
            categoryId: input.payload.categoryId,
            baseUnitId: input.payload.baseUnitId,
            priceBase: input.payload.priceBase,
            costBase: input.payload.costBase,
            outStockThreshold: input.payload.outStockThreshold,
            lowStockThreshold: input.payload.lowStockThreshold,
          },
          transaction: tx,
        },
      );

      await execute(
        `
          delete from product_units
          where product_id = :productId
        `,
        {
          replacements: { productId: input.productId },
          transaction: tx,
        },
      );

      for (const conversion of input.payload.conversions) {
        await execute(
          `
            insert into product_units (
              id,
              product_id,
              unit_id,
              multiplier_to_base,
              price_per_unit
            )
            values (
              :id,
              :productId,
              :unitId,
              :multiplierToBase,
              :pricePerUnit
            )
          `,
          {
            replacements: {
              id: randomUUID(),
              productId: input.productId,
              unitId: conversion.unitId,
              multiplierToBase: conversion.multiplierToBase,
              pricePerUnit: conversion.pricePerUnit ?? null,
            },
            transaction: tx,
          },
        );
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "NOT_FOUND" ||
        error.message === "CONFLICT_SKU" ||
        error.message === "INVALID_UNIT" ||
        error.message === "INVALID_CATEGORY"
      ) {
        return { ok: false, error: error.message as ProductWriteError };
      }
    }

    if (isVariantCombinationUniqueError(error)) {
      return { ok: false, error: "VARIANT_CONFLICT" };
    }

    throw error;
  }

  const product = await getStoreProductByIdDirectFromPostgres(input.storeId, input.productId);
  return { ok: true, product };
};

export const setProductActiveInPostgres = async (input: {
  storeId: string;
  productId: string;
  active: boolean;
}): Promise<ProductActionResult> => {
  const targetProduct = await queryOne<{ id: string }>(
    `
      select id
      from products
      where id = :productId and store_id = :storeId
      limit 1
    `,
    {
      replacements: input,
    },
  );

  if (!targetProduct) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await execute(
    `
      update products
      set active = :active
      where id = :productId and store_id = :storeId
    `,
    {
      replacements: input,
    },
  );

  return { ok: true };
};

export const updateProductImageInPostgres = async (input: {
  storeId: string;
  productId: string;
  imageUrl: string | null;
}): Promise<ProductActionResult> => {
  const targetProduct = await queryOne<{ id: string }>(
    `
      select id
      from products
      where id = :productId and store_id = :storeId
      limit 1
    `,
    {
      replacements: input,
    },
  );

  if (!targetProduct) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await execute(
    `
      update products
      set image_url = :imageUrl
      where id = :productId and store_id = :storeId
    `,
    {
      replacements: input,
    },
  );

  return { ok: true };
};

export const removeProductImageInPostgres = async (input: {
  storeId: string;
  productId: string;
}) =>
  updateProductImageInPostgres({
    ...input,
    imageUrl: null,
  });

const buildAuditInsertValues = (input: {
  storeId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
  before?: unknown;
  after?: unknown;
  requestContext?: RequestContext | null;
}) => ({
  id: randomUUID(),
  scope: "STORE",
  storeId: input.storeId,
  actorUserId: input.actorUserId,
  actorName: input.actorName ?? null,
  actorRole: input.actorRole ?? null,
  action: input.action,
  entityType: input.entityType,
  entityId: input.entityId,
  result: "SUCCESS",
  reasonCode: null,
  ipAddress: input.requestContext?.ipAddress ?? null,
  userAgent: input.requestContext?.userAgent ?? null,
  requestId: input.requestContext?.requestId ?? null,
  metadata: asJsonText(input.metadata),
  before: asJsonText(input.before),
  after: asJsonText(input.after),
  occurredAt: new Date().toISOString(),
});

export const updateProductCostInPostgres = async (input: {
  storeId: string;
  productId: string;
  nextCostBase: number;
  reason: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  requestContext?: RequestContext | null;
}): Promise<ProductCostWriteResult> => {
  const targetProduct = await queryOne<{
    id: string;
    costBase: number | string | null;
    name: string;
  }>(
    `
      select
        id,
        cost_base as "costBase",
        name
      from products
      where id = :productId and store_id = :storeId
      limit 1
    `,
    {
      replacements: {
        productId: input.productId,
        storeId: input.storeId,
      },
    },
  );

  if (!targetProduct) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const previousCostBase = Number(targetProduct.costBase ?? 0);
  if (previousCostBase === input.nextCostBase) {
    return { ok: true, unchanged: true };
  }

  await runInTransaction(async (tx) => {
    await execute(
      `
        update products
        set cost_base = :nextCostBase
        where id = :productId and store_id = :storeId
      `,
      {
        replacements: {
          productId: input.productId,
          storeId: input.storeId,
          nextCostBase: input.nextCostBase,
        },
        transaction: tx,
      },
    );

    const audit = buildAuditInsertValues({
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "product.cost.manual_update",
      entityType: "product",
      entityId: input.productId,
      metadata: {
        source: "MANUAL",
        productName: targetProduct.name,
        reason: input.reason,
        previousCostBase,
        nextCostBase: input.nextCostBase,
      },
      before: { costBase: previousCostBase },
      after: { costBase: input.nextCostBase },
      requestContext: input.requestContext,
    });

    await execute(
      `
        insert into audit_events (
          id,
          scope,
          store_id,
          actor_user_id,
          actor_name,
          actor_role,
          action,
          entity_type,
          entity_id,
          result,
          reason_code,
          ip_address,
          user_agent,
          request_id,
          metadata,
          before,
          after,
          occurred_at
        )
        values (
          :id,
          :scope,
          :storeId,
          :actorUserId,
          :actorName,
          :actorRole,
          :action,
          :entityType,
          :entityId,
          :result,
          :reasonCode,
          :ipAddress,
          :userAgent,
          :requestId,
          cast(:metadata as jsonb),
          cast(:before as jsonb),
          cast(:after as jsonb),
          :occurredAt
        )
      `,
      {
        replacements: audit,
        transaction: tx,
      },
    );
  });

  return { ok: true };
};
