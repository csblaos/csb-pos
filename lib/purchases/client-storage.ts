"use client";

const PURCHASE_STORAGE_NAMESPACE = "csb.stock.purchase";

const WORKSPACE_SEGMENT = "workspace";
const SAVED_PRESETS_SEGMENT = "saved-presets";

const LEGACY_WORKSPACE_KEY = `${PURCHASE_STORAGE_NAMESPACE}.${WORKSPACE_SEGMENT}`;
const LEGACY_SAVED_PRESETS_KEY = `${PURCHASE_STORAGE_NAMESPACE}.${SAVED_PRESETS_SEGMENT}`;

const SCOPED_WORKSPACE_PREFIX = `${LEGACY_WORKSPACE_KEY}:`;
const SCOPED_SAVED_PRESETS_PREFIX = `${LEGACY_SAVED_PRESETS_KEY}:`;

type PurchaseStorageScope = {
  storeId: string;
  userId: string;
};

function normalizeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

function scopedSuffix(scope: PurchaseStorageScope): string {
  return `${normalizeSegment(scope.storeId)}:${normalizeSegment(scope.userId)}`;
}

export function getPurchaseWorkspaceStorageKey(scope: PurchaseStorageScope): string {
  return `${SCOPED_WORKSPACE_PREFIX}${scopedSuffix(scope)}`;
}

export function getPurchaseSavedPresetsStorageKey(scope: PurchaseStorageScope): string {
  return `${SCOPED_SAVED_PRESETS_PREFIX}${scopedSuffix(scope)}`;
}

export function getLegacyPurchaseWorkspaceStorageKey(): string {
  return LEGACY_WORKSPACE_KEY;
}

export function getLegacyPurchaseSavedPresetsStorageKey(): string {
  return LEGACY_SAVED_PRESETS_KEY;
}

export function clearPurchaseLocalStorage() {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) {
      continue;
    }
    const isLegacyKey = key === LEGACY_WORKSPACE_KEY || key === LEGACY_SAVED_PRESETS_KEY;
    const isScopedKey =
      key.startsWith(SCOPED_WORKSPACE_PREFIX) || key.startsWith(SCOPED_SAVED_PRESETS_PREFIX);
    if (isLegacyKey || isScopedKey) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
}
