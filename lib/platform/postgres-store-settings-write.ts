import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import { isPostgresConfigured, type PostgresTransaction } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import type { StoreCurrency, StoreVatMode } from "@/lib/finance/store-financial";
import { listStorePaymentAccountsFromPostgres } from "@/lib/platform/postgres-store-settings";

type StoreSettingsWriteResult =
  | { ok: true; store: Record<string, unknown> }
  | { ok: false; error: "NOT_FOUND" };

type PaymentAccountWriteResult =
  | {
      ok: true;
      accounts: Awaited<ReturnType<typeof listStorePaymentAccountsFromPostgres>> extends infer T
        ? Exclude<T, undefined>
        : never;
      created?: PaymentAccountSnapshot;
      before?: PaymentAccountSnapshot;
      after?: PaymentAccountSnapshot;
      deleted?: { id: string; qrImageUrl: string | null };
    }
  | { ok: false; error: "NOT_FOUND" | "CONFLICT_LIMIT" | "INVALID_DEFAULT_INACTIVE" };

type PaymentAccountRow = {
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

type PaymentAccountSnapshot = {
  id: string;
  displayName: string;
  accountType: "BANK" | "LAO_QR";
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
};

const normalizePaymentAccountType = (value: unknown): "BANK" | "LAO_QR" =>
  value === "LAO_QR" || value === "PROMPTPAY" ? "LAO_QR" : "BANK";

const toBoolean = (value: boolean | null | undefined, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const loadPaymentAccount = async (
  tx: PostgresTransaction,
  storeId: string,
  accountId: string,
) =>
  queryOne<PaymentAccountRow>(
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
      where id = :accountId and store_id = :storeId
      limit 1
    `,
    {
      replacements: { storeId, accountId },
      transaction: tx,
    },
  );

const mapPaymentAccountSnapshot = (row: PaymentAccountRow): PaymentAccountSnapshot => ({
  id: row.id,
  displayName: row.displayName,
  accountType: normalizePaymentAccountType(row.accountType),
  bankName: row.bankName,
  accountName: row.accountName,
  accountNumber: row.accountNumber,
  qrImageUrl: row.qrImageUrl ?? row.promptpayId ?? null,
  isDefault: toBoolean(row.isDefault, false),
  isActive: toBoolean(row.isActive, true),
});

const ensureDefaultActiveAccount = async (tx: PostgresTransaction, storeId: string) => {
  const existingDefault = await queryOne<{ id: string }>(
    `
      select id
      from store_payment_accounts
      where store_id = :storeId and is_active = true and is_default = true
      limit 1
    `,
    {
      replacements: { storeId },
      transaction: tx,
    },
  );

  if (existingDefault) {
    return;
  }

  const fallback = await queryOne<{ id: string }>(
    `
      select id
      from store_payment_accounts
      where store_id = :storeId and is_active = true
      order by created_at asc
      limit 1
    `,
    {
      replacements: { storeId },
      transaction: tx,
    },
  );

  if (!fallback) {
    return;
  }

  await execute(
    `
      update store_payment_accounts
      set
        is_default = true,
        updated_at = current_timestamp
      where id = :accountId
    `,
    {
      replacements: { accountId: fallback.id },
      transaction: tx,
    },
  );
};

export const isPostgresStoreSettingsWriteEnabled = () =>
  process.env.POSTGRES_STORE_SETTINGS_WRITE_ENABLED === "1" && isPostgresConfigured();

export const isPostgresStorePaymentAccountsWriteEnabled = () =>
  process.env.POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED === "1" && isPostgresConfigured();

export const logStoreSettingsWriteFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[store-settings.write.pg] fallback to turso for ${operation}: ${message}`);
};

export const updateStoreJsonSettingsInPostgres = async (input: {
  storeId: string;
  name?: string;
  address?: string | null;
  phoneNumber?: string | null;
  currency?: StoreCurrency;
  supportedCurrencies?: string;
  vatEnabled?: boolean;
  vatRate?: number;
  vatMode?: StoreVatMode;
  outStockThreshold?: number;
  lowStockThreshold?: number;
}) : Promise<StoreSettingsWriteResult> => {
  return runInTransaction(async (tx) => {
    const target = await queryOne<{ id: string; logoName: string | null; logoUrl: string | null }>(
      `
        select
          id,
          logo_name as "logoName",
          logo_url as "logoUrl"
        from stores
        where id = :storeId
        limit 1
      `,
      {
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    if (!target) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    const assignments: string[] = [];
    const replacements: Record<string, unknown> = { storeId: input.storeId };

    const setIfDefined = (column: string, key: string, value: unknown) => {
      if (value === undefined) {
        return;
      }
      assignments.push(`${column} = :${key}`);
      replacements[key] = value;
    };

    setIfDefined("name", "name", input.name);
    setIfDefined("address", "address", input.address);
    setIfDefined("phone_number", "phoneNumber", input.phoneNumber);
    setIfDefined("currency", "currency", input.currency);
    setIfDefined("supported_currencies", "supportedCurrencies", input.supportedCurrencies);
    setIfDefined("vat_enabled", "vatEnabled", input.vatEnabled);
    setIfDefined("vat_rate", "vatRate", input.vatRate);
    setIfDefined("vat_mode", "vatMode", input.vatMode);
    setIfDefined("out_stock_threshold", "outStockThreshold", input.outStockThreshold);
    setIfDefined("low_stock_threshold", "lowStockThreshold", input.lowStockThreshold);

    if (assignments.length > 0) {
      await execute(
        `
          update stores
          set ${assignments.join(", ")}
          where id = :storeId
        `,
        {
          replacements,
          transaction: tx,
        },
      );
    }

    const store = await queryOne<Record<string, unknown>>(
      `
        select
          id,
          name,
          logo_name as "logoName",
          logo_url as "logoUrl",
          address,
          phone_number as "phoneNumber",
          currency,
          supported_currencies as "supportedCurrencies",
          vat_enabled as "vatEnabled",
          vat_rate as "vatRate",
          vat_mode as "vatMode",
          out_stock_threshold as "outStockThreshold",
          low_stock_threshold as "lowStockThreshold"
        from stores
        where id = :storeId
        limit 1
      `,
      {
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    return {
      ok: true,
      store: {
        ...store,
        logoName: (store?.logoName as string | null | undefined) ?? target.logoName,
        logoUrl: (store?.logoUrl as string | null | undefined) ?? target.logoUrl,
      },
    } as const;
  });
};

export const updateStoreMultipartProfileInPostgres = async (input: {
  storeId: string;
  name: string;
  address: string;
  phoneNumber: string | null;
  logoName: string | null;
  logoUrl: string | null;
}) : Promise<StoreSettingsWriteResult> => {
  return runInTransaction(async (tx) => {
    const target = await queryOne<{ id: string }>(
      `
        select id
        from stores
        where id = :storeId
        limit 1
      `,
      {
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    if (!target) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    await execute(
      `
        update stores
        set
          name = :name,
          address = :address,
          phone_number = :phoneNumber,
          logo_name = :logoName,
          logo_url = :logoUrl
        where id = :storeId
      `,
      {
        replacements: {
          storeId: input.storeId,
          name: input.name,
          address: input.address,
          phoneNumber: input.phoneNumber,
          logoName: input.logoName,
          logoUrl: input.logoUrl,
        },
        transaction: tx,
      },
    );

    const store = await queryOne<Record<string, unknown>>(
      `
        select
          id,
          name,
          logo_name as "logoName",
          logo_url as "logoUrl",
          address,
          phone_number as "phoneNumber",
          currency,
          supported_currencies as "supportedCurrencies",
          vat_enabled as "vatEnabled",
          vat_rate as "vatRate",
          vat_mode as "vatMode",
          out_stock_threshold as "outStockThreshold",
          low_stock_threshold as "lowStockThreshold",
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
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    return { ok: true, store: store ?? {} } as const;
  });
};

export const updateStorePdfConfigInPostgres = async (input: {
  storeId: string;
  updates: Record<string, unknown>;
}) : Promise<StoreSettingsWriteResult> => {
  return runInTransaction(async (tx) => {
    const existing = await queryOne<{ id: string }>(
      `
        select id
        from stores
        where id = :storeId
        limit 1
      `,
      {
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    if (!existing) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    const columnMap: Record<string, string> = {
      pdfShowLogo: "pdf_show_logo",
      pdfShowSignature: "pdf_show_signature",
      pdfShowNote: "pdf_show_note",
      pdfHeaderColor: "pdf_header_color",
      pdfCompanyName: "pdf_company_name",
      pdfCompanyAddress: "pdf_company_address",
      pdfCompanyPhone: "pdf_company_phone",
    };

    const assignments: string[] = [];
    const replacements: Record<string, unknown> = { storeId: input.storeId };
    for (const [key, value] of Object.entries(input.updates)) {
      const column = columnMap[key];
      if (!column) continue;
      assignments.push(`${column} = :${key}`);
      replacements[key] = value;
    }

    if (assignments.length > 0) {
      await execute(
        `
          update stores
          set ${assignments.join(", ")}
          where id = :storeId
        `,
        {
          replacements,
          transaction: tx,
        },
      );
    }

    const store = await queryOne<Record<string, unknown>>(
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
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    return { ok: true, store: store ?? {} } as const;
  });
};

export const createStorePaymentAccountInPostgres = async (input: {
  storeId: string;
  displayName: string;
  accountType: "BANK" | "LAO_QR";
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
  maxAccountsPerStore: number;
}) : Promise<PaymentAccountWriteResult> => {
  return runInTransaction(async (tx) => {
    const countRow = await queryOne<{ value: number | string | null }>(
      `
        select count(*) as value
        from store_payment_accounts
        where store_id = :storeId
      `,
      {
        replacements: { storeId: input.storeId },
        transaction: tx,
      },
    );

    const currentCount = Number(countRow?.value ?? 0);
    if (currentCount >= input.maxAccountsPerStore) {
      return { ok: false, error: "CONFLICT_LIMIT" } as const;
    }

    let nextIsDefault = input.isDefault;
    if (currentCount === 0 && input.isActive) {
      nextIsDefault = true;
    }
    if (nextIsDefault && !input.isActive) {
      return { ok: false, error: "INVALID_DEFAULT_INACTIVE" } as const;
    }

    if (nextIsDefault) {
      await execute(
        `
          update store_payment_accounts
          set
            is_default = false,
            updated_at = current_timestamp
          where store_id = :storeId
        `,
        {
          replacements: { storeId: input.storeId },
          transaction: tx,
        },
      );
    }

    const accountId = randomUUID();
    await execute(
      `
        insert into store_payment_accounts (
          id,
          store_id,
          display_name,
          account_type,
          bank_name,
          account_name,
          account_number,
          qr_image_url,
          promptpay_id,
          is_default,
          is_active,
          updated_at
        )
        values (
          :id,
          :storeId,
          :displayName,
          :accountType,
          :bankName,
          :accountName,
          :accountNumber,
          :qrImageUrl,
          null,
          :isDefault,
          :isActive,
          current_timestamp
        )
      `,
      {
        replacements: {
          id: accountId,
          storeId: input.storeId,
          displayName: input.displayName,
          accountType: input.accountType,
          bankName: input.bankName,
          accountName: input.accountName,
          accountNumber: input.accountNumber,
          qrImageUrl: input.qrImageUrl,
          isDefault: nextIsDefault,
          isActive: input.isActive,
        },
        transaction: tx,
      },
    );

    await ensureDefaultActiveAccount(tx, input.storeId);
    const created = await loadPaymentAccount(tx, input.storeId, accountId);
    const accounts = (await listStorePaymentAccountsFromPostgres(input.storeId)) ?? [];

    return {
      ok: true,
      accounts,
      created: created ? mapPaymentAccountSnapshot(created) : undefined,
    } as const;
  });
};

export const updateStorePaymentAccountInPostgres = async (input: {
  storeId: string;
  accountId: string;
  displayName: string;
  accountType: "BANK" | "LAO_QR";
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
}) : Promise<PaymentAccountWriteResult> => {
  return runInTransaction(async (tx) => {
    const target = await loadPaymentAccount(tx, input.storeId, input.accountId);
    if (!target) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    if (input.isDefault && !input.isActive) {
      return { ok: false, error: "INVALID_DEFAULT_INACTIVE" } as const;
    }

    if (input.isDefault) {
      await execute(
        `
          update store_payment_accounts
          set
            is_default = false,
            updated_at = current_timestamp
          where store_id = :storeId
        `,
        {
          replacements: { storeId: input.storeId },
          transaction: tx,
        },
      );
    }

    await execute(
      `
        update store_payment_accounts
        set
          display_name = :displayName,
          account_type = :accountType,
          bank_name = :bankName,
          account_name = :accountName,
          account_number = :accountNumber,
          qr_image_url = :qrImageUrl,
          promptpay_id = null,
          is_default = :isDefault,
          is_active = :isActive,
          updated_at = current_timestamp
        where id = :accountId
      `,
      {
        replacements: {
          accountId: input.accountId,
          displayName: input.displayName,
          accountType: input.accountType,
          bankName: input.bankName,
          accountName: input.accountName,
          accountNumber: input.accountNumber,
          qrImageUrl: input.qrImageUrl,
          isDefault: input.isDefault,
          isActive: input.isActive,
        },
        transaction: tx,
      },
    );

    await ensureDefaultActiveAccount(tx, input.storeId);
    const updated = await loadPaymentAccount(tx, input.storeId, input.accountId);
    const accounts = (await listStorePaymentAccountsFromPostgres(input.storeId)) ?? [];

    return {
      ok: true,
      accounts,
      before: mapPaymentAccountSnapshot(target),
      after: updated ? mapPaymentAccountSnapshot(updated) : undefined,
    } as const;
  });
};

export const deleteStorePaymentAccountInPostgres = async (input: {
  storeId: string;
  accountId: string;
}) : Promise<PaymentAccountWriteResult> => {
  return runInTransaction(async (tx) => {
    const target = await loadPaymentAccount(tx, input.storeId, input.accountId);
    if (!target) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    await execute(
      `
        delete from store_payment_accounts
        where id = :accountId
      `,
      {
        replacements: { accountId: input.accountId },
        transaction: tx,
      },
    );

    await ensureDefaultActiveAccount(tx, input.storeId);
    const accounts = (await listStorePaymentAccountsFromPostgres(input.storeId)) ?? [];

    return {
      ok: true,
      accounts,
      deleted: {
        id: target.id,
        qrImageUrl: target.qrImageUrl ?? target.promptpayId ?? null,
      },
    } as const;
  });
};
