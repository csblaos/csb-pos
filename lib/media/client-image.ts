import {
  getRasterImageTypeLabel,
  isRasterImageContentType,
} from "@/lib/media/image-upload";

type CompressImageOptions = {
  maxWidth: number;
  quality: number;
  fileNameBase?: string;
};

function sanitizeFileNameBase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blobToImageElement(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };
    image.src = objectUrl;
  });
}

async function loadImageSource(blob: Blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
          context.drawImage(bitmap, 0, 0, width, height);
        },
        cleanup: () => bitmap.close(),
      };
    } catch {
      // fall back to HTMLImageElement below
    }
  }

  const image = await blobToImageElement(blob);
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
      context.drawImage(image, 0, 0, width, height);
    },
    cleanup: () => undefined,
  };
}

export function validateRasterImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return { ok: false as const, message: "รองรับเฉพาะไฟล์รูปภาพ" };
  }

  if (!isRasterImageContentType(file.type)) {
    return {
      ok: false as const,
      message: `รองรับเฉพาะไฟล์ ${getRasterImageTypeLabel()}`,
    };
  }

  return { ok: true as const };
}

export async function compressRasterImageFile(file: File, options: CompressImageOptions) {
  const validation = validateRasterImageFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const source = await loadImageSource(file);

  try {
    const scale = Math.min(1, options.maxWidth / Math.max(source.width, 1));
    const targetWidth = Math.max(1, Math.round(source.width * scale));
    const targetHeight = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
    }

    source.draw(context, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", options.quality);
    });

    if (!blob) {
      throw new Error("IMAGE_COMPRESS_FAILED");
    }

    const fileNameBase =
      sanitizeFileNameBase(options.fileNameBase ?? file.name.replace(/\.[^.]+$/, "")) || "image";

    return new File([blob], `${fileNameBase}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    source.cleanup();
  }
}
