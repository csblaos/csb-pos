export const LAOS_BANK_OTHER_OPTION_CODE = "OTHER" as const;

export const laosBankCatalog = [
  { code: "BCEL", name: "Banque pour le Commerce Exterieur Lao Public (BCEL)" },
  { code: "LDB", name: "Lao Development Bank Co., Ltd" },
  { code: "APB", name: "Agricultural Promotion Bank Co., Ltd" },
  { code: "JDB", name: "Joint Development Bank" },
  { code: "PSV", name: "Phongsavanh Bank Ltd" },
  { code: "LVB", name: "Lao-Viet Bank Co., Ltd" },
  { code: "LCB", name: "Lao China Bank Co., Ltd" },
  { code: "BFL", name: "Banque Franco-Lao Ltd" },
  { code: "ACLEDA", name: "ACLEDA Bank Lao Ltd" },
  { code: "RHB", name: "RHB Bank Lao Sole Co., Ltd" },
  { code: "KBank", name: "Kasikornbank Lao" },
  { code: "BBL", name: "Bangkok Bank Public Co., Ltd - Vientiane Branch" },
  { code: "BAY", name: "Bank of Ayudhya (Krungsri) - Vientiane Branch" },
  { code: "ICBC", name: "Industrial & Commercial Bank of China - Vientiane Branch" },
  { code: "BOC", name: "Bank of China Limited - Vientiane Branch" },
  { code: "Maybank", name: "Malayan Banking Berhad (Maybank) - Lao Branch" },
  { code: "PublicBank", name: "Public Bank Berhad - Vientiane Branch" },
  { code: "FCB", name: "First Commercial Bank - Vientiane Branch" },
  { code: "STB", name: "Saigon Thuong Tin Commercial Joint Stock Bank (Sacombank) Lao" },
  {
    code: "VietinBank",
    name: "Vietnam Joint Stock Commercial Bank for Industry and Trade - Lao Branch",
  },
  { code: "BIDV", name: "Bank for Investment and Development of Vietnam - Lao Branch" },
  { code: "SHB", name: "Saigon Hanoi Commercial Joint Stock Bank - Lao Branch" },
] as const;

export type LaosBankCatalogItem = (typeof laosBankCatalog)[number];

const laosBankCodeMap = new Map(
  laosBankCatalog.map((bank) => [bank.code.toLowerCase(), bank] as const),
);

const laosBankNameMap = new Map(
  laosBankCatalog.map((bank) => [bank.name.trim().toLowerCase(), bank] as const),
);

export function findLaosBankByCode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return laosBankCodeMap.get(normalized) ?? null;
}

export function findLaosBankByName(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return laosBankNameMap.get(normalized) ?? null;
}

export function normalizeLaosBankStorageValue(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const byCode = findLaosBankByCode(normalized);
  if (byCode) {
    return byCode.code;
  }

  const byName = findLaosBankByName(normalized);
  if (byName) {
    return byName.code;
  }

  return normalized;
}

export function resolveLaosBankDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return "-";
  }

  const byCode = findLaosBankByCode(normalized);
  if (byCode) {
    return byCode.name;
  }

  const byName = findLaosBankByName(normalized);
  if (byName) {
    return byName.name;
  }

  return normalized;
}
