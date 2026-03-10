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

    await target.transaction(async (tx) => {
      const nowSuffix = Date.now();
      const categoryId = `smoke-category-${nowSuffix}`;
      const unitId = `smoke-unit-${nowSuffix}`;
      const fbId = `smoke-fb-${nowSuffix}`;
      const waId = `smoke-wa-${nowSuffix}`;

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
            name: `Smoke Category ${nowSuffix}`,
            sortOrder: 99,
          },
        },
      );

      await target.query(
        `
          update product_categories
          set name = :name, sort_order = :sortOrder
          where id = :id and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            id: categoryId,
            storeId,
            name: `Smoke Category Updated ${nowSuffix}`,
            sortOrder: 7,
          },
        },
      );

      const [categoryRows] = await target.query(
        `
          select name, sort_order as "sortOrder"
          from product_categories
          where id = :id
          limit 1
        `,
        {
          transaction: tx,
          replacements: { id: categoryId },
        },
      );

      if (!Array.isArray(categoryRows) || categoryRows[0]?.name !== `Smoke Category Updated ${nowSuffix}`) {
        throw new Error("CATEGORY_WRITE_FAILED");
      }

      await target.query(
        `
          insert into units (id, store_id, scope, code, name_th)
          values (:id, :storeId, 'STORE', :code, :nameTh)
        `,
        {
          transaction: tx,
          replacements: {
            id: unitId,
            storeId,
            code: `SMK${nowSuffix}`,
            nameTh: `Smoke Unit ${nowSuffix}`,
          },
        },
      );

      await target.query(
        `
          update units
          set code = :code, name_th = :nameTh
          where id = :id and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            id: unitId,
            storeId,
            code: `SMKU${nowSuffix}`,
            nameTh: `Smoke Unit Updated ${nowSuffix}`,
          },
        },
      );

      const [unitRows] = await target.query(
        `
          select code, name_th as "nameTh"
          from units
          where id = :id
          limit 1
        `,
        {
          transaction: tx,
          replacements: { id: unitId },
        },
      );

      if (!Array.isArray(unitRows) || unitRows[0]?.code !== `SMKU${nowSuffix}`) {
        throw new Error("UNIT_WRITE_FAILED");
      }

      await target.query(
        `
          insert into fb_connections (id, store_id, status, page_name, page_id, connected_at)
          values (:id, :storeId, 'CONNECTED', 'Demo Facebook Page', 'fb_demo_page', now()::text)
          on conflict (id) do nothing
        `,
        {
          transaction: tx,
          replacements: { id: fbId, storeId },
        },
      );

      await target.query(
        `
          insert into wa_connections (id, store_id, status, phone_number, connected_at)
          values (:id, :storeId, 'CONNECTED', '+8562099999999', now()::text)
          on conflict (id) do nothing
        `,
        {
          transaction: tx,
          replacements: { id: waId, storeId },
        },
      );

      const [channelRows] = await target.query(
        `
          select
            coalesce((select status from fb_connections where store_id = :storeId order by connected_at desc nulls last limit 1), 'DISCONNECTED') as facebook,
            coalesce((select status from wa_connections where store_id = :storeId order by connected_at desc nulls last limit 1), 'DISCONNECTED') as whatsapp
        `,
        {
          transaction: tx,
          replacements: { storeId },
        },
      );

      if (
        !Array.isArray(channelRows) ||
        channelRows[0]?.facebook !== "CONNECTED" ||
        channelRows[0]?.whatsapp !== "CONNECTED"
      ) {
        throw new Error("CHANNEL_WRITE_FAILED");
      }

      throw new Error("ROLLBACK_INTENTIONAL");
    }).catch((error) => {
      if (error instanceof Error && error.message === "ROLLBACK_INTENTIONAL") {
        return;
      }

      throw error;
    });

    console.info("[pg:smoke:products-units-onboarding-write] passed with rollback");
  } catch (error) {
    console.error("[pg:smoke:products-units-onboarding-write] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
  }
};

await run();
