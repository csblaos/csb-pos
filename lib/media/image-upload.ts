export const RASTER_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const RASTER_IMAGE_ACCEPT = RASTER_IMAGE_MIME_TYPES.join(",");

export function isRasterImageContentType(contentType: string | null | undefined) {
  const normalized = contentType?.trim().toLowerCase() ?? "";
  return RASTER_IMAGE_MIME_TYPES.includes(
    normalized as (typeof RASTER_IMAGE_MIME_TYPES)[number],
  );
}

export function getRasterImageTypeLabel() {
  return "JPG, PNG หรือ WebP";
}
