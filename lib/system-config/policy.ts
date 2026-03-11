import "server-only";
import {
  getGlobalPaymentPolicyFromPostgres,
  getGlobalSessionPolicyFromPostgres,
  getGlobalStoreLogoPolicyFromPostgres,
} from "@/lib/platform/postgres-auth-rbac";
import {
  upsertGlobalPaymentPolicyInPostgres,
  upsertGlobalSessionPolicyInPostgres,
  upsertGlobalStoreLogoPolicyInPostgres,
} from "@/lib/platform/postgres-settings-admin-write";

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
  const postgresPolicy = await getGlobalSessionPolicyFromPostgres();
  if (postgresPolicy) {
    return postgresPolicy;
  }
  return {
    defaultSessionLimit: DEFAULT_SESSION_LIMIT,
  };
}

export async function getGlobalStoreLogoPolicy(): Promise<GlobalStoreLogoPolicy> {
  const postgresPolicy = await getGlobalStoreLogoPolicyFromPostgres();
  if (postgresPolicy) {
    return postgresPolicy;
  }
  return {
    maxSizeMb: DEFAULT_STORE_LOGO_MAX_SIZE_MB,
    autoResize: DEFAULT_STORE_LOGO_AUTO_RESIZE,
    resizeMaxWidth: DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH,
  };
}

export async function getGlobalPaymentPolicy(): Promise<GlobalPaymentPolicy> {
  const postgresPolicy = await getGlobalPaymentPolicyFromPostgres();
  if (postgresPolicy) {
    return postgresPolicy;
  }
  return {
    maxAccountsPerStore: DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE,
    requireSlipForLaoQr: DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR,
  };
}

export async function upsertGlobalSessionPolicy(input: GlobalSessionPolicy) {
  const defaultSessionLimit = toPositiveIntOrNull(input.defaultSessionLimit) ?? DEFAULT_SESSION_LIMIT;

  const postgresPolicy = await upsertGlobalSessionPolicyInPostgres({
    defaultSessionLimit,
  });
  if (postgresPolicy) {
    return;
  }
  throw new Error("POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED is required for session policy update");
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

  const postgresPolicy = await upsertGlobalStoreLogoPolicyInPostgres({
    maxSizeMb,
    autoResize,
    resizeMaxWidth,
  });
  if (postgresPolicy) {
    return;
  }
  throw new Error("POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED is required for store logo policy update");
}

export async function upsertGlobalPaymentPolicy(input: GlobalPaymentPolicy) {
  const maxAccountsPerStore =
    toIntInRangeOrNull(input.maxAccountsPerStore, 1, 20) ??
    DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE;
  const requireSlipForLaoQr =
    typeof input.requireSlipForLaoQr === "boolean"
      ? input.requireSlipForLaoQr
      : DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR;

  const postgresPolicy = await upsertGlobalPaymentPolicyInPostgres({
    maxAccountsPerStore,
    requireSlipForLaoQr,
  });
  if (postgresPolicy) {
    return;
  }
  throw new Error("POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED is required for payment policy update");
}
