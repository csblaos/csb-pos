import "./load-local-env.mjs";

import { createClient } from "@libsql/client";
import { Sequelize } from "sequelize";

const sourceDatabaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const sourceAuthToken = process.env.TURSO_AUTH_TOKEN;
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

const source = createClient({
  url: sourceDatabaseUrl,
  authToken: sourceAuthToken,
});

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

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const toNullableBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }
  return null;
};

const countTargetRows = async (tableName) => {
  const [rows] = await target.query(`select count(*)::int as value from ${tableName}`);
  return Array.isArray(rows) ? Number(rows[0]?.value ?? 0) : 0;
};

const upsertRows = async ({ tableName, columns, conflictColumns, rows, tx }) => {
  if (rows.length === 0) {
    return;
  }

  const insertColumns = columns.map((column) => column.columnName).join(", ");
  const insertValues = columns.map((column) => `:${column.paramName}`).join(", ");
  const conflictTarget = `(${conflictColumns.join(", ")})`;
  const updateColumns = columns
    .filter((column) => !conflictColumns.includes(column.columnName))
    .map((column) => `${column.columnName} = excluded.${column.columnName}`)
    .join(",\n            ");

  const sql =
    updateColumns.length > 0
      ? `
          insert into ${tableName} (${insertColumns})
          values (${insertValues})
          on conflict ${conflictTarget} do update set
                  ${updateColumns}
        `
      : `
          insert into ${tableName} (${insertColumns})
          values (${insertValues})
          on conflict ${conflictTarget} do nothing
        `;

  for (const row of rows) {
    await target.query(sql, {
      transaction: tx,
      replacements: row,
    });
  }
};

const backfillStores = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      name,
      logo_name as "logoName",
      logo_url as "logoUrl",
      address,
      phone_number as "phoneNumber",
      store_type as "storeType",
      currency,
      supported_currencies as "supportedCurrencies",
      vat_enabled as "vatEnabled",
      vat_rate as "vatRate",
      vat_mode as "vatMode",
      out_stock_threshold as "outStockThreshold",
      low_stock_threshold as "lowStockThreshold",
      max_branches_override as "maxBranchesOverride",
      pdf_show_logo as "pdfShowLogo",
      pdf_show_signature as "pdfShowSignature",
      pdf_show_note as "pdfShowNote",
      pdf_header_color as "pdfHeaderColor",
      pdf_company_name as "pdfCompanyName",
      pdf_company_address as "pdfCompanyAddress",
      pdf_company_phone as "pdfCompanyPhone",
      created_at as "createdAt"
    from stores
    order by id asc
  `);

  await upsertRows({
    tableName: "stores",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      ...row,
      vatEnabled: toNullableBoolean(row.vatEnabled),
      pdfShowLogo: toNullableBoolean(row.pdfShowLogo),
      pdfShowSignature: toNullableBoolean(row.pdfShowSignature),
      pdfShowNote: toNullableBoolean(row.pdfShowNote),
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "name", paramName: "name" },
      { columnName: "logo_name", paramName: "logoName" },
      { columnName: "logo_url", paramName: "logoUrl" },
      { columnName: "address", paramName: "address" },
      { columnName: "phone_number", paramName: "phoneNumber" },
      { columnName: "store_type", paramName: "storeType" },
      { columnName: "currency", paramName: "currency" },
      { columnName: "supported_currencies", paramName: "supportedCurrencies" },
      { columnName: "vat_enabled", paramName: "vatEnabled" },
      { columnName: "vat_rate", paramName: "vatRate" },
      { columnName: "vat_mode", paramName: "vatMode" },
      { columnName: "out_stock_threshold", paramName: "outStockThreshold" },
      { columnName: "low_stock_threshold", paramName: "lowStockThreshold" },
      { columnName: "max_branches_override", paramName: "maxBranchesOverride" },
      { columnName: "pdf_show_logo", paramName: "pdfShowLogo" },
      { columnName: "pdf_show_signature", paramName: "pdfShowSignature" },
      { columnName: "pdf_show_note", paramName: "pdfShowNote" },
      { columnName: "pdf_header_color", paramName: "pdfHeaderColor" },
      { columnName: "pdf_company_name", paramName: "pdfCompanyName" },
      { columnName: "pdf_company_address", paramName: "pdfCompanyAddress" },
      { columnName: "pdf_company_phone", paramName: "pdfCompanyPhone" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillStorePaymentAccounts = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      display_name as "displayName",
      account_type as "accountType",
      bank_name as "bankName",
      account_name as "accountName",
      account_number as "accountNumber",
      qr_image_url as "qrImageUrl",
      promptpay_id as "promptpayId",
      is_default as "isDefault",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from store_payment_accounts
    order by id asc
  `);

  await upsertRows({
    tableName: "store_payment_accounts",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      ...row,
      isDefault: toNullableBoolean(row.isDefault) ?? false,
      isActive: toNullableBoolean(row.isActive) ?? true,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "display_name", paramName: "displayName" },
      { columnName: "account_type", paramName: "accountType" },
      { columnName: "bank_name", paramName: "bankName" },
      { columnName: "account_name", paramName: "accountName" },
      { columnName: "account_number", paramName: "accountNumber" },
      { columnName: "qr_image_url", paramName: "qrImageUrl" },
      { columnName: "promptpay_id", paramName: "promptpayId" },
      { columnName: "is_default", paramName: "isDefault" },
      { columnName: "is_active", paramName: "isActive" },
      { columnName: "created_at", paramName: "createdAt" },
      { columnName: "updated_at", paramName: "updatedAt" },
    ],
    tx,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    await target.transaction(async (tx) => {
      await backfillStores(tx);
      await backfillStorePaymentAccounts(tx);
    });

    const [storesCount, paymentAccountsCount] = await Promise.all([
      countTargetRows("stores"),
      countTargetRows("store_payment_accounts"),
    ]);

    console.info(
      `[pg:backfill:store-settings-read] done stores=${storesCount} store_payment_accounts=${paymentAccountsCount}`,
    );
  } catch (error) {
    console.error("[pg:backfill:store-settings-read] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
