export type ProductVariantOption = {
  attributeCode: string;
  attributeName: string;
  valueCode: string;
  valueName: string;
};

const normalizeText = (value: string) => value.trim();

export const normalizeVariantCode = (value: string, fallback = "") => {
  const source = normalizeText(value) || normalizeText(fallback);
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return normalized || "option";
};

export const canonicalizeVariantOptions = (
  options: ProductVariantOption[],
): ProductVariantOption[] => {
  const byAttribute = new Map<string, ProductVariantOption>();

  for (const option of options) {
    const attributeName = normalizeText(option.attributeName);
    const valueName = normalizeText(option.valueName);
    if (!attributeName || !valueName) continue;

    const attributeCode = normalizeVariantCode(option.attributeCode, attributeName);
    const valueCode = normalizeVariantCode(option.valueCode, valueName);

    byAttribute.set(attributeCode, {
      attributeCode,
      attributeName,
      valueCode,
      valueName,
    });
  }

  return [...byAttribute.values()].sort((a, b) =>
    a.attributeCode.localeCompare(b.attributeCode, "en"),
  );
};

export const serializeVariantOptions = (options: ProductVariantOption[]): string | null => {
  const normalized = canonicalizeVariantOptions(options);
  if (normalized.length === 0) return null;
  return JSON.stringify(normalized);
};

export const parseVariantOptions = (raw: string | null | undefined): ProductVariantOption[] => {
  if (!raw) return [];

  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [];

    return canonicalizeVariantOptions(
      decoded.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;

        return [
          {
            attributeCode:
              typeof row.attributeCode === "string" ? row.attributeCode : "",
            attributeName:
              typeof row.attributeName === "string" ? row.attributeName : "",
            valueCode: typeof row.valueCode === "string" ? row.valueCode : "",
            valueName: typeof row.valueName === "string" ? row.valueName : "",
          },
        ];
      }),
    );
  } catch {
    return [];
  }
};
