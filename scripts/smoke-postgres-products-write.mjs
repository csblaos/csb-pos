import "./load-local-env.mjs";

import { Sequelize } from "sequelize";

const targetDatabaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!targetDatabaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sanitizeDatabaseUrl = (databaseUrl) => {
  const trimmed = databaseUrl.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslrootcert");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("uselibpqcompat");
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const sslMode = (process.env.POSTGRES_SSL_MODE ?? "require").trim().toLowerCase();
const shouldUseSsl = sslMode !== "disable" && sslMode !== "off" && sslMode !== "false";
const rejectUnauthorized =
  (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "0").trim() === "1";

const target = new Sequelize(sanitizeDatabaseUrl(targetDatabaseUrl), {
  dialect: "postgres",
  logging: false,
  dialectOptions: shouldUseSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});

const run = async () => {
  try {
    await target.authenticate();

    const [storeRows] = await target.query(`
      select id
      from stores
      order by created_at asc
      limit 1
    `);

    const storeId = Array.isArray(storeRows) ? storeRows[0]?.id : null;
    if (!storeId) {
      throw new Error("NO_STORE_FOUND");
    }

    const [unitRows] = await target.query(
      `
        select id
        from units
        where scope = 'SYSTEM' or (scope = 'STORE' and store_id = :storeId)
        order by case when scope = 'SYSTEM' then 0 else 1 end, code asc
        limit 1
      `,
      {
        replacements: { storeId },
      },
    );

    const baseUnitId = Array.isArray(unitRows) ? unitRows[0]?.id : null;
    if (!baseUnitId) {
      throw new Error("NO_UNIT_FOUND");
    }

    await target.transaction(async (tx) => {
      const nowSuffix = Date.now();
      const categoryId = `smoke-product-category-${nowSuffix}`;
      const conversionUnitId = `smoke-product-unit-${nowSuffix}`;
      const modelId = `smoke-product-model-${nowSuffix}`;
      const attributeId = `smoke-product-attr-${nowSuffix}`;
      const valueId = `smoke-product-value-${nowSuffix}`;
      const productId = `smoke-product-${nowSuffix}`;

      await target.query(
        `
          insert into product_categories (id, store_id, name, sort_order)
          values (:id, :storeId, :name, :sortOrder)
        `,
        {
          transaction: tx,
          replacements: {
            id: categoryId,
            storeId,
            name: `Smoke Product Category ${nowSuffix}`,
            sortOrder: 88,
          },
        },
      );

      await target.query(
        `
          insert into units (id, store_id, scope, code, name_th)
          values (:id, :storeId, 'STORE', :code, :nameTh)
        `,
        {
          transaction: tx,
          replacements: {
            id: conversionUnitId,
            storeId,
            code: `SPW${nowSuffix}`,
            nameTh: `Smoke Product Unit ${nowSuffix}`,
          },
        },
      );

      await target.query(
        `
          insert into product_models (id, store_id, name, category_id, active)
          values (:id, :storeId, :name, :categoryId, true)
        `,
        {
          transaction: tx,
          replacements: {
            id: modelId,
            storeId,
            name: `Smoke Model ${nowSuffix}`,
            categoryId,
          },
        },
      );

      await target.query(
        `
          insert into product_model_attributes (id, model_id, code, name, sort_order)
          values (:id, :modelId, 'color', 'Color', 0)
        `,
        {
          transaction: tx,
          replacements: {
            id: attributeId,
            modelId,
          },
        },
      );

      await target.query(
        `
          insert into product_model_attribute_values (id, attribute_id, code, name, sort_order)
          values (:id, :attributeId, 'red', 'Red', 0)
        `,
        {
          transaction: tx,
          replacements: {
            id: valueId,
            attributeId,
          },
        },
      );

      await target.query(
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
            0,
            :categoryId,
            :baseUnitId,
            1000,
            700,
            1,
            3,
            true
          )
        `,
        {
          transaction: tx,
          replacements: {
            id: productId,
            storeId,
            sku: `SMOKE-${nowSuffix}`,
            name: `Smoke Product ${nowSuffix}`,
            barcode: `885${nowSuffix}`,
            modelId,
            variantLabel: "Red",
            variantOptionsJson: JSON.stringify([
              {
                attributeCode: "color",
                attributeName: "Color",
                valueCode: "red",
                valueName: "Red",
              },
            ]),
            categoryId,
            baseUnitId,
          },
        },
      );

      await target.query(
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
            6,
            5400
          )
        `,
        {
          transaction: tx,
          replacements: {
            id: `smoke-product-conv-${nowSuffix}`,
            productId,
            unitId: conversionUnitId,
          },
        },
      );

      await target.query(
        `
          update products
          set
            name = :name,
            price_base = 1200,
            cost_base = 800,
            variant_label = 'Red XL',
            variant_sort_order = 1,
            image_url = 'products/demo.webp',
            active = false
          where id = :productId and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            productId,
            storeId,
            name: `Smoke Product Updated ${nowSuffix}`,
          },
        },
      );

      const [productRows] = await target.query(
        `
          select
            name,
            price_base as "priceBase",
            cost_base as "costBase",
            variant_label as "variantLabel",
            variant_sort_order as "variantSortOrder",
            image_url as "imageUrl",
            active
          from products
          where id = :productId
          limit 1
        `,
        {
          transaction: tx,
          replacements: { productId },
        },
      );

      if (
        !Array.isArray(productRows) ||
        productRows[0]?.name !== `Smoke Product Updated ${nowSuffix}` ||
        Number(productRows[0]?.priceBase ?? 0) !== 1200 ||
        Number(productRows[0]?.costBase ?? 0) !== 800 ||
        productRows[0]?.variantLabel !== "Red XL" ||
        Number(productRows[0]?.variantSortOrder ?? 0) !== 1 ||
        productRows[0]?.imageUrl !== "products/demo.webp" ||
        productRows[0]?.active !== false
      ) {
        throw new Error("PRODUCT_WRITE_FAILED");
      }

      throw new Error("ROLLBACK_INTENTIONAL");
    }).catch((error) => {
      if (error instanceof Error && error.message === "ROLLBACK_INTENTIONAL") {
        return;
      }

      throw error;
    });

    console.info("[pg:smoke:products-write] passed with rollback");
  } catch (error) {
    console.error("[pg:smoke:products-write] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
  }
};

await run();
