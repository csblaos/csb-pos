import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { systemConfig } from "@/lib/db/schema";

const GLOBAL_CONFIG_ID = "global";
const DEFAULT_SESSION_LIMIT = 1;
const DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE = 5;
const DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR = true;
const DEFAULT_STORE_LOGO_MAX_SIZE_MB = 5;
const DEFAULT_STORE_LOGO_AUTO_RESIZE = true;
const DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH = 1280;

const toPositiveIntOrNull = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
};

const toIntInRangeOrNull = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < min || value > max) {
    return null;
  }
  return value;
};

export type GlobalSessionPolicy = {
  defaultSessionLimit: number;
};

export type GlobalStoreLogoPolicy = {
  maxSizeMb: number;
  autoResize: boolean;
  resizeMaxWidth: number;
};

export type GlobalPaymentPolicy = {
  maxAccountsPerStore: number;
  requireSlipForLaoQr: boolean;
};

export async function getGlobalSessionPolicy(): Promise<GlobalSessionPolicy> {
  const [row] = await db
    .select({
      defaultSessionLimit: systemConfig.defaultSessionLimit,
    })
    .from(systemConfig)
    .where(eq(systemConfig.id, GLOBAL_CONFIG_ID))
    .limit(1);

  return {
    defaultSessionLimit: toPositiveIntOrNull(row?.defaultSessionLimit) ?? DEFAULT_SESSION_LIMIT,
  };
}

export async function getGlobalStoreLogoPolicy(): Promise<GlobalStoreLogoPolicy> {
  try {
    const [row] = await db
      .select({
        maxSizeMb: systemConfig.storeLogoMaxSizeMb,
        autoResize: systemConfig.storeLogoAutoResize,
        resizeMaxWidth: systemConfig.storeLogoResizeMaxWidth,
      })
      .from(systemConfig)
      .where(eq(systemConfig.id, GLOBAL_CONFIG_ID))
      .limit(1);

    return {
      maxSizeMb:
        toIntInRangeOrNull(row?.maxSizeMb, 1, 20) ?? DEFAULT_STORE_LOGO_MAX_SIZE_MB,
      autoResize:
        typeof row?.autoResize === "boolean"
          ? row.autoResize
          : DEFAULT_STORE_LOGO_AUTO_RESIZE,
      resizeMaxWidth:
        toIntInRangeOrNull(row?.resizeMaxWidth, 256, 4096) ??
        DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH,
    };
  } catch {
    // fallback for environments that have not applied latest migration yet
    return {
      maxSizeMb: DEFAULT_STORE_LOGO_MAX_SIZE_MB,
      autoResize: DEFAULT_STORE_LOGO_AUTO_RESIZE,
      resizeMaxWidth: DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH,
    };
  }
}

export async function getGlobalPaymentPolicy(): Promise<GlobalPaymentPolicy> {
  try {
    const [row] = await db
      .select({
        maxAccountsPerStore: systemConfig.paymentMaxAccountsPerStore,
        requireSlipForLaoQr: systemConfig.paymentRequireSlipForLaoQr,
      })
      .from(systemConfig)
      .where(eq(systemConfig.id, GLOBAL_CONFIG_ID))
      .limit(1);

    return {
      maxAccountsPerStore:
        toIntInRangeOrNull(row?.maxAccountsPerStore, 1, 20) ??
        DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE,
      requireSlipForLaoQr:
        typeof row?.requireSlipForLaoQr === "boolean"
          ? row.requireSlipForLaoQr
          : DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR,
    };
  } catch {
    return {
      maxAccountsPerStore: DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE,
      requireSlipForLaoQr: DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR,
    };
  }
}

export async function upsertGlobalSessionPolicy(input: GlobalSessionPolicy) {
  const defaultSessionLimit = toPositiveIntOrNull(input.defaultSessionLimit) ?? DEFAULT_SESSION_LIMIT;

  await db
    .insert(systemConfig)
    .values({
      id: GLOBAL_CONFIG_ID,
      defaultCanCreateBranches: true,
      defaultMaxBranchesPerStore: 1,
      defaultSessionLimit,
      updatedAt: sql`(CURRENT_TIMESTAMP)`,
    })
    .onConflictDoUpdate({
      target: systemConfig.id,
      set: {
        defaultSessionLimit,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    });
}

export async function upsertGlobalStoreLogoPolicy(input: GlobalStoreLogoPolicy) {
  const maxSizeMb =
    toIntInRangeOrNull(input.maxSizeMb, 1, 20) ?? DEFAULT_STORE_LOGO_MAX_SIZE_MB;
  const autoResize =
    typeof input.autoResize === "boolean"
      ? input.autoResize
      : DEFAULT_STORE_LOGO_AUTO_RESIZE;
  const resizeMaxWidth =
    toIntInRangeOrNull(input.resizeMaxWidth, 256, 4096) ??
    DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH;

  await db
    .insert(systemConfig)
    .values({
      id: GLOBAL_CONFIG_ID,
      defaultCanCreateBranches: true,
      defaultMaxBranchesPerStore: 1,
      defaultSessionLimit: 1,
      storeLogoMaxSizeMb: maxSizeMb,
      storeLogoAutoResize: autoResize,
      storeLogoResizeMaxWidth: resizeMaxWidth,
      updatedAt: sql`(CURRENT_TIMESTAMP)`,
    })
    .onConflictDoUpdate({
      target: systemConfig.id,
      set: {
        storeLogoMaxSizeMb: maxSizeMb,
        storeLogoAutoResize: autoResize,
        storeLogoResizeMaxWidth: resizeMaxWidth,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    });
}

export async function upsertGlobalPaymentPolicy(input: GlobalPaymentPolicy) {
  const maxAccountsPerStore =
    toIntInRangeOrNull(input.maxAccountsPerStore, 1, 20) ??
    DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE;
  const requireSlipForLaoQr =
    typeof input.requireSlipForLaoQr === "boolean"
      ? input.requireSlipForLaoQr
      : DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR;

  await db
    .insert(systemConfig)
    .values({
      id: GLOBAL_CONFIG_ID,
      defaultCanCreateBranches: true,
      defaultMaxBranchesPerStore: 1,
      defaultSessionLimit: 1,
      paymentMaxAccountsPerStore: maxAccountsPerStore,
      paymentRequireSlipForLaoQr: requireSlipForLaoQr,
      updatedAt: sql`(CURRENT_TIMESTAMP)`,
    })
    .onConflictDoUpdate({
      target: systemConfig.id,
      set: {
        paymentMaxAccountsPerStore: maxAccountsPerStore,
        paymentRequireSlipForLaoQr: requireSlipForLaoQr,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    });
}
