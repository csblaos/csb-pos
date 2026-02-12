import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string | null;
  keyPrefix: string;
};

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_RESIZE_MAX_WIDTH = 1280;
const WEBP_QUALITY = 82;

type StoreLogoUploadPolicy = {
  maxSizeBytes: number;
  autoResize: boolean;
  resizeMaxWidth: number;
};

const extensionByContentType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function loadR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? "";
  const publicBaseUrlRaw = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
  const keyPrefix = process.env.R2_STORE_LOGO_PREFIX?.trim() || "store-logos";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrlRaw ? trimTrailingSlash(publicBaseUrlRaw) : null,
    keyPrefix,
  };
}

function createClient(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function contentTypeToExtension(contentType: string) {
  return extensionByContentType[contentType] ?? "bin";
}

function sanitizeUploadPolicy(input?: Partial<StoreLogoUploadPolicy>): StoreLogoUploadPolicy {
  const maxSizeBytes =
    typeof input?.maxSizeBytes === "number" && input.maxSizeBytes > 0
      ? Math.floor(input.maxSizeBytes)
      : MAX_LOGO_SIZE_BYTES;
  const autoResize = input?.autoResize !== undefined ? Boolean(input.autoResize) : true;
  const resizeMaxWidth =
    typeof input?.resizeMaxWidth === "number" &&
    Number.isInteger(input.resizeMaxWidth) &&
    input.resizeMaxWidth >= 256 &&
    input.resizeMaxWidth <= 4096
      ? input.resizeMaxWidth
      : DEFAULT_RESIZE_MAX_WIDTH;

  return {
    maxSizeBytes,
    autoResize,
    resizeMaxWidth,
  };
}

function buildObjectUrl(config: R2Config, objectKey: string) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${objectKey}`;
  }

  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${objectKey}`;
}

function normalizePathname(pathname: string) {
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

function extractObjectKeyFromUrl(config: R2Config, logoUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(logoUrl);
  } catch {
    return null;
  }

  const normalizedPath = normalizePathname(parsed.pathname);
  if (!normalizedPath) {
    return null;
  }

  if (config.publicBaseUrl) {
    try {
      const publicBase = new URL(config.publicBaseUrl);
      const normalizedBasePath = normalizePathname(publicBase.pathname);
      const normalizedPublicPath = normalizedPath;

      if (parsed.origin === publicBase.origin) {
        if (normalizedBasePath) {
          if (normalizedPublicPath.startsWith(`${normalizedBasePath}/`)) {
            const objectKey = normalizedPublicPath.slice(normalizedBasePath.length + 1);
            return objectKey.length > 0 ? objectKey : null;
          }
        } else {
          return normalizedPublicPath;
        }
      }
    } catch {
      return null;
    }
  }

  const r2Origin = `https://${config.accountId}.r2.cloudflarestorage.com`;
  if (parsed.origin === r2Origin) {
    const bucketPrefix = `${config.bucket}/`;
    if (normalizedPath.startsWith(bucketPrefix)) {
      const objectKey = normalizedPath.slice(bucketPrefix.length);
      return objectKey.length > 0 ? objectKey : null;
    }
  }

  if (normalizedPath.startsWith(`${config.keyPrefix}/`)) {
    return normalizedPath;
  }

  return null;
}

export function isR2Configured() {
  return loadR2Config() !== null;
}

export async function uploadStoreLogoToR2(params: {
  storeId: string;
  logoName: string;
  file: File;
  policy?: Partial<StoreLogoUploadPolicy>;
}) {
  const config = loadR2Config();
  if (!config) {
    throw new Error("R2_NOT_CONFIGURED");
  }

  const uploadPolicy = sanitizeUploadPolicy(params.policy);

  if (!params.file.type.startsWith("image/")) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  if (params.file.size > uploadPolicy.maxSizeBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  let extension = contentTypeToExtension(params.file.type);
  let contentType = params.file.type || "application/octet-stream";
  let body: Uint8Array = new Uint8Array(await params.file.arrayBuffer());

  if (uploadPolicy.autoResize && params.file.type !== "image/svg+xml") {
    try {
      const resized = await sharp(body)
        .rotate()
        .resize({
          width: uploadPolicy.resizeMaxWidth,
          withoutEnlargement: true,
          fit: "inside",
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      body = resized;
      extension = "webp";
      contentType = "image/webp";
    } catch {
      // fallback to original file when resize fails
    }
  }

  if (body.byteLength > uploadPolicy.maxSizeBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const objectKey = `${config.keyPrefix}/${params.storeId}/${randomUUID()}.${extension}`;

  const client = createClient(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      Metadata: {
        logoName: params.logoName,
      },
    }),
  );

  return {
    objectKey,
    url: buildObjectUrl(config, objectKey),
  };
}

export async function deleteStoreLogoFromR2(params: { logoUrl: string }) {
  const config = loadR2Config();
  if (!config) {
    return false;
  }

  const objectKey = extractObjectKeyFromUrl(config, params.logoUrl);
  if (!objectKey) {
    return false;
  }

  const client = createClient(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
  );

  return true;
}
