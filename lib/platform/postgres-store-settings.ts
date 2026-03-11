import "server-only";

import {
  defaultStoreCurrency,
  defaultStoreVatMode,
  parseStoreCurrency,
  parseStoreVatMode,
  parseSupportedCurrencies,
} from "@/lib/finance/store-financial";
import { resolvePaymentQrImageUrl } from "@/lib/storage/r2";

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;

type PostgresStoreSettingsContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
};

type StoreProfileRow = {
  id: string;
  name: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER" | null;
  logoName: string | null;
  logoUrl: string | null;
  address: string | null;
  phoneNumber: string | null;
  outStockThreshold: number | string | null;
  lowStockThreshold: number | string | null;
};

type StoreSettingsHomeRow = {
  name: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER" | null;
  currency: string | null;
  address: string | null;
  phoneNumber: string | null;
};

type StoreChannelConnectionRow = {
  status: "DISCONNECTED" | "CONNECTED" | "ERROR" | null;
  pageName: string | null;
  phoneNumber: string | null;
};

type StoreFinancialRow = {
  currency: string | null;
  supportedCurrencies: string | null;
  vatEnabled: boolean | null;
  vatRate: number | string | null;
  vatMode: string | null;
};

type StorePdfConfigRow = {
  pdfShowLogo: boolean | null;
  pdfShowSignature: boolean | null;
  pdfShowNote: boolean | null;
  pdfHeaderColor: string | null;
  pdfCompanyName: string | null;
  pdfCompanyAddress: string | null;
  pdfCompanyPhone: string | null;
};

type StorePaymentAccountRow = {
  id: string;
  displayName: string;
  accountType: string | null;
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  promptpayId: string | null;
  isDefault: boolean | null;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
};

type StorePaymentAccountQrMetaRow = {
  id: string;
  displayName: string;
  qrImageUrl: string | null;
  promptpayId: string | null;
};

type StorePaymentAccountLookupRow = {
  id: string;
};

type StorePaymentAccountListOptions = {
  activeOnly?: boolean;
  qrOnly?: boolean;
};

const isPostgresStoreSettingsReadEnabled = () =>
  process.env.POSTGRES_STORE_SETTINGS_READ_ENABLED === "1";

const getPostgresStoreSettingsContext =
  async (): Promise<PostgresStoreSettingsContext | null> => {
    if (!isPostgresStoreSettingsReadEnabled()) {
      return null;
    }

    const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
      import("@/lib/db/query"),
      import("@/lib/db/sequelize"),
    ]);

    if (!isPostgresConfigured()) {
      return null;
    }

    return {
      queryMany,
      queryOne,
    };
  };

export const logStoreSettingsReadFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[store-settings.read.pg] fallback to turso for ${operation}: ${message}`);
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeThreshold = (value: number | string | null | undefined, fallback: number) => {
  const parsed = toNumber(value);
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeVatRate = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000
    ? parsed
    : 0;
};

const normalizePaymentAccountType = (value: unknown) => {
  if (value === "LAO_QR" || value === "PROMPTPAY") {
    return "LAO_QR" as const;
  }

  return "BANK" as const;
};

export async function getStoreProfileFromPostgres(storeId: string) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StoreProfileRow>(
    `
      select
        id,
        name,
        store_type as "storeType",
        logo_name as "logoName",
        logo_url as "logoUrl",
        address,
        phone_number as "phoneNumber",
        out_stock_threshold as "outStockThreshold",
        low_stock_threshold as "lowStockThreshold"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    storeType: row.storeType,
    logoName: row.logoName,
    logoUrl: row.logoUrl,
    address: row.address,
    phoneNumber: row.phoneNumber,
    outStockThreshold: normalizeThreshold(row.outStockThreshold, 0),
    lowStockThreshold: normalizeThreshold(row.lowStockThreshold, 10),
  };
}

export async function getStoreSettingsHomeSummaryFromPostgres(storeId: string) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StoreSettingsHomeRow>(
    `
      select
        name,
        store_type as "storeType",
        currency,
        address,
        phone_number as "phoneNumber"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  return row ?? null;
}

export async function getStoreChannelConnectionsFromPostgres(storeId: string) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const [fbConnection, waConnection] = await Promise.all([
    pg.queryOne<StoreChannelConnectionRow>(
      `
        select
          status,
          page_name as "pageName",
          null::text as "phoneNumber"
        from fb_connections
        where store_id = :storeId
        limit 1
      `,
      {
        replacements: { storeId },
      },
    ),
    pg.queryOne<StoreChannelConnectionRow>(
      `
        select
          status,
          null::text as "pageName",
          phone_number as "phoneNumber"
        from wa_connections
        where store_id = :storeId
        limit 1
      `,
      {
        replacements: { storeId },
      },
    ),
  ]);

  return {
    fbConnection: fbConnection ?? null,
    waConnection: waConnection ?? null,
  };
}

export async function getStoreFinancialConfigFromPostgres(storeId: string) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StoreFinancialRow>(
    `
      select
        currency,
        supported_currencies as "supportedCurrencies",
        vat_enabled as "vatEnabled",
        vat_rate as "vatRate",
        vat_mode as "vatMode"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  if (!row) {
    return null;
  }

  const baseCurrency = parseStoreCurrency(row.currency, defaultStoreCurrency);

  return {
    currency: baseCurrency,
    supportedCurrencies: parseSupportedCurrencies(row.supportedCurrencies, baseCurrency),
    vatEnabled: row.vatEnabled === true,
    vatRate: normalizeVatRate(row.vatRate),
    vatMode: parseStoreVatMode(row.vatMode, defaultStoreVatMode),
  };
}

export async function getStorePdfConfigFromPostgres(storeId: string) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StorePdfConfigRow>(
    `
      select
        pdf_show_logo as "pdfShowLogo",
        pdf_show_signature as "pdfShowSignature",
        pdf_show_note as "pdfShowNote",
        pdf_header_color as "pdfHeaderColor",
        pdf_company_name as "pdfCompanyName",
        pdf_company_address as "pdfCompanyAddress",
        pdf_company_phone as "pdfCompanyPhone"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  if (!row) {
    return null;
  }

  return {
    pdfShowLogo: row.pdfShowLogo === true,
    pdfShowSignature: row.pdfShowSignature === true,
    pdfShowNote: row.pdfShowNote === true,
    pdfHeaderColor: row.pdfHeaderColor ?? "#f1f5f9",
    pdfCompanyName: row.pdfCompanyName,
    pdfCompanyAddress: row.pdfCompanyAddress,
    pdfCompanyPhone: row.pdfCompanyPhone,
  };
}

export async function listStorePaymentAccountsFromPostgres(
  storeId: string,
  options: StorePaymentAccountListOptions = {},
) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const conditions = [`store_id = :storeId`];
  if (options.activeOnly) {
    conditions.push(`is_active = true`);
  }
  if (options.qrOnly) {
    conditions.push(`account_type = 'LAO_QR'`);
  }

  const rows = await pg.queryMany<StorePaymentAccountRow>(
    `
      select
        id,
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
      where ${conditions.join(" and ")}
      order by is_default desc, is_active desc, created_at asc
    `,
    {
      replacements: { storeId },
    },
  );

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    accountType: normalizePaymentAccountType(row.accountType),
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    qrImageUrl: resolvePaymentQrImageUrl(row.qrImageUrl ?? row.promptpayId ?? null),
    promptpayId: row.promptpayId,
    isDefault: row.isDefault === true,
    isActive: row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getStorePaymentAccountQrImageMetaFromPostgres(
  storeId: string,
  accountId: string,
) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StorePaymentAccountQrMetaRow>(
    `
      select
        id,
        display_name as "displayName",
        qr_image_url as "qrImageUrl",
        promptpay_id as "promptpayId"
      from store_payment_accounts
      where id = :accountId and store_id = :storeId
      limit 1
    `,
    {
      replacements: { storeId, accountId },
    },
  );

  if (!row) {
    return null;
  }

  return row;
}

export async function findActiveLaoQrPaymentAccountFromPostgres(
  storeId: string,
  accountId: string,
) {
  const pg = await getPostgresStoreSettingsContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StorePaymentAccountLookupRow>(
    `
      select id
      from store_payment_accounts
      where
        id = :accountId
        and store_id = :storeId
        and account_type = 'LAO_QR'
        and is_active = true
      limit 1
    `,
    {
      replacements: {
        storeId,
        accountId,
      },
    },
  );

  return row ?? null;
}
