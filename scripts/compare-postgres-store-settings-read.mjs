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

const normalizeScalar = (value) => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return Number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
  return value ?? null;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }
  return normalizeScalar(value);
};

const asComparableJson = (value) => JSON.stringify(normalizeValue(value));

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const fetchTargetRows = async (sql) => {
  const [rows] = await target.query(sql);
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
};

const compareRows = async ({ label, sourceSql, targetSql }) => {
  const [sourceRows, targetRows] = await Promise.all([
    fetchSourceRows(sourceSql),
    fetchTargetRows(targetSql),
  ]);

  if (asComparableJson(sourceRows) !== asComparableJson(targetRows)) {
    throw new Error(`parity mismatch ${label}`);
  }

  return sourceRows.length;
};

const run = async () => {
  try {
    await target.authenticate();

    const storeCount = await compareRows({
      label: "stores.settings.read",
      sourceSql: `
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
      `,
      targetSql: `
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
      `,
    });

    const paymentAccountCount = await compareRows({
      label: "store_payment_accounts.read",
      sourceSql: `
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
      `,
      targetSql: `
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
      `,
    });

    console.info(
      `[pg:compare:store-settings-read] parity ok stores=${storeCount} store_payment_accounts=${paymentAccountCount}`,
    );
  } catch (error) {
    console.error("[pg:compare:store-settings-read] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
