import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { systemConfig } from "@/lib/db/schema";

const GLOBAL_CONFIG_ID = "global";
const DEFAULT_SESSION_LIMIT = 1;
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
