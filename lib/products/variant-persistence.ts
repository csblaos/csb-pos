import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  productModelAttributes,
  productModelAttributeValues,
  productModels,
} from "@/lib/db/schema";
import {
  canonicalizeVariantOptions,
  type ProductVariantOption,
} from "@/lib/products/variant-options";

type VariantDbClient = Pick<typeof db, "select" | "insert" | "update">;

export type NormalizedVariantPayload = {
  modelName: string;
  variantLabel: string;
  variantSortOrder: number;
  options: ProductVariantOption[];
};

export type VariantColumns = {
  modelId: string | null;
  variantLabel: string | null;
  variantOptionsJson: string | null;
  variantSortOrder: number;
};

const getErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isModelNameUniqueError = (error: unknown) =>
  /product_models_store_name_unique|UNIQUE constraint failed: product_models\.store_id, product_models\.name/i.test(
    getErrorText(error),
  );

export const isVariantCombinationUniqueError = (error: unknown) =>
  /products_model_variant_options_unique|UNIQUE constraint failed: products\.model_id, products\.variant_options_json/i.test(
    getErrorText(error),
  );

async function ensureVariantModel(
  client: VariantDbClient,
  {
    storeId,
    categoryId,
    modelName,
  }: {
    storeId: string;
    categoryId: string | null;
    modelName: string;
  },
) {
  const [existing] = await client
    .select({
      id: productModels.id,
      categoryId: productModels.categoryId,
    })
    .from(productModels)
    .where(and(eq(productModels.storeId, storeId), eq(productModels.name, modelName)))
    .limit(1);

  if (existing) {
    if (categoryId && !existing.categoryId) {
      await client
        .update(productModels)
        .set({ categoryId })
        .where(eq(productModels.id, existing.id));
    }
    return existing.id;
  }

  const modelId = randomUUID();
  try {
    await client.insert(productModels).values({
      id: modelId,
      storeId,
      name: modelName,
      categoryId,
      active: true,
    });
    return modelId;
  } catch (error) {
    if (!isModelNameUniqueError(error)) {
      throw error;
    }

    const [concurrent] = await client
      .select({ id: productModels.id })
      .from(productModels)
      .where(and(eq(productModels.storeId, storeId), eq(productModels.name, modelName)))
      .limit(1);

    if (!concurrent) {
      throw error;
    }

    return concurrent.id;
  }
}

async function ensureVariantDictionary(
  client: VariantDbClient,
  modelId: string,
  options: ProductVariantOption[],
) {
  for (const [index, option] of options.entries()) {
    const [existingAttribute] = await client
      .select({
        id: productModelAttributes.id,
        name: productModelAttributes.name,
      })
      .from(productModelAttributes)
      .where(
        and(
          eq(productModelAttributes.modelId, modelId),
          eq(productModelAttributes.code, option.attributeCode),
        ),
      )
      .limit(1);

    const attributeId = existingAttribute?.id ?? randomUUID();
    if (!existingAttribute) {
      await client.insert(productModelAttributes).values({
        id: attributeId,
        modelId,
        code: option.attributeCode,
        name: option.attributeName,
        sortOrder: index,
      });
    } else if (existingAttribute.name !== option.attributeName) {
      await client
        .update(productModelAttributes)
        .set({ name: option.attributeName })
        .where(eq(productModelAttributes.id, attributeId));
    }

    const [existingValue] = await client
      .select({
        id: productModelAttributeValues.id,
        name: productModelAttributeValues.name,
      })
      .from(productModelAttributeValues)
      .where(
        and(
          eq(productModelAttributeValues.attributeId, attributeId),
          eq(productModelAttributeValues.code, option.valueCode),
        ),
      )
      .limit(1);

    if (!existingValue) {
      await client.insert(productModelAttributeValues).values({
        id: randomUUID(),
        attributeId,
        code: option.valueCode,
        name: option.valueName,
        sortOrder: 0,
      });
    } else if (existingValue.name !== option.valueName) {
      await client
        .update(productModelAttributeValues)
        .set({ name: option.valueName })
        .where(eq(productModelAttributeValues.id, existingValue.id));
    }
  }
}

export async function buildVariantColumns(
  client: VariantDbClient,
  {
    storeId,
    categoryId,
    variant,
  }: {
    storeId: string;
    categoryId: string | null;
    variant: NormalizedVariantPayload | null;
  },
): Promise<VariantColumns> {
  if (!variant) {
    return {
      modelId: null,
      variantLabel: null,
      variantOptionsJson: null,
      variantSortOrder: 0,
    };
  }

  const options = canonicalizeVariantOptions(variant.options);
  const modelId = await ensureVariantModel(client, {
    storeId,
    categoryId,
    modelName: variant.modelName,
  });

  if (options.length > 0) {
    await ensureVariantDictionary(client, modelId, options);
  }

  return {
    modelId,
    variantLabel: variant.variantLabel,
    variantOptionsJson: options.length > 0 ? JSON.stringify(options) : null,
    variantSortOrder: variant.variantSortOrder,
  };
}
