import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { formatLaosAddress, getDistrictById, getProvinceById } from "@/lib/location/laos-address";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { deleteStoreLogoFromR2, isR2Configured, uploadStoreLogoToR2 } from "@/lib/storage/r2";
import { getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";

const phoneNumberPattern = /^[0-9+\-\s()]+$/;

const updateStoreJsonSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.union([z.string(), z.null()]).optional(),
    phoneNumber: z.union([z.string(), z.null()]).optional(),
  })
  .refine(
    (payload) =>
      payload.name !== undefined || payload.address !== undefined || payload.phoneNumber !== undefined,
    {
      message: "ไม่มีข้อมูลสำหรับอัปเดต",
      path: ["address"],
    },
  );

const updateStoreMultipartSchema = z.object({
  name: z.string().trim().min(2).max(120),
  provinceId: z.coerce.number().int().positive(),
  districtId: z.coerce.number().int().positive(),
  village: z.string().trim().min(1).max(120),
  addressDetail: z.string().trim().max(160).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  logoName: z.string().trim().min(1).max(120).optional(),
});

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    size?: unknown;
    type?: unknown;
    arrayBuffer?: unknown;
  };

  return (
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function buildVillageDetail(village: string, addressDetail: string) {
  const normalizedVillage = village.trim();
  const normalizedAddressDetail = addressDetail.trim();
  if (!normalizedAddressDetail) {
    return normalizedVillage;
  }

  return `${normalizedVillage} | ${normalizedAddressDetail}`;
}

function validatePhoneNumber(phoneNumber: string | null) {
  if (!phoneNumber) {
    return null;
  }

  if (
    phoneNumber.length < 6 ||
    phoneNumber.length > 20 ||
    !phoneNumberPattern.test(phoneNumber)
  ) {
    return "รูปแบบเบอร์โทรไม่ถูกต้อง";
  }

  return null;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function appendWarningMessage(current: string | null, next: string) {
  if (!current) {
    return next;
  }

  return `${current} ${next}`;
}

async function patchByMultipartForm(storeId: string, request: Request) {
  const formData = await request.formData();
  const payload = updateStoreMultipartSchema.safeParse({
    name: getFormString(formData, "name"),
    provinceId: getFormString(formData, "provinceId"),
    districtId: getFormString(formData, "districtId"),
    village: getFormString(formData, "village"),
    addressDetail: getFormString(formData, "addressDetail"),
    phoneNumber: getFormString(formData, "phoneNumber"),
    logoName: getFormString(formData, "logoName"),
  });

  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const province = getProvinceById(payload.data.provinceId);
  if (!province) {
    return NextResponse.json({ message: "Province ไม่ถูกต้อง" }, { status: 400 });
  }

  const district = getDistrictById(payload.data.districtId);
  if (!district || district.provinceId !== payload.data.provinceId) {
    return NextResponse.json({ message: "District ไม่ถูกต้องสำหรับ Province ที่เลือก" }, { status: 400 });
  }

  const normalizedPhoneNumber = normalizeOptionalText(payload.data.phoneNumber);
  const phoneError = validatePhoneNumber(normalizedPhoneNumber);
  if (phoneError) {
    return NextResponse.json({ message: phoneError }, { status: 400 });
  }

  const formattedAddress = formatLaosAddress({
    provinceId: payload.data.provinceId,
    districtId: payload.data.districtId,
    detail: buildVillageDetail(payload.data.village, payload.data.addressDetail ?? ""),
  });

  if (!formattedAddress || formattedAddress.length > 300) {
    return NextResponse.json({ message: "ข้อมูลที่อยู่ร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const [targetStore] = await db
    .select({
      id: stores.id,
      logoName: stores.logoName,
      logoUrl: stores.logoUrl,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (!targetStore) {
    return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
  }

  let nextLogoName = targetStore.logoName;
  let nextLogoUrl = targetStore.logoUrl;
  let warningMessage: string | null = null;
  let configuredLogoMaxSizeMb = 5;
  const logoFileValue = formData.get("logoFile");
  const logoFile = isFileLike(logoFileValue) && logoFileValue.size > 0 ? logoFileValue : null;

  if (logoFile) {
    if (!isR2Configured()) {
      warningMessage = "ยังไม่ได้ตั้งค่า Cloudflare R2 ระบบจึงยังไม่อัปเดตโลโก้";
    } else {
      try {
        const storeLogoPolicy = await getGlobalStoreLogoPolicy();
        configuredLogoMaxSizeMb = storeLogoPolicy.maxSizeMb;
        const upload = await uploadStoreLogoToR2({
          storeId,
          logoName: payload.data.logoName ?? payload.data.name,
          file: logoFile,
          policy: {
            maxSizeBytes: storeLogoPolicy.maxSizeMb * 1024 * 1024,
            autoResize: storeLogoPolicy.autoResize,
            resizeMaxWidth: storeLogoPolicy.resizeMaxWidth,
          },
        });

        nextLogoName = payload.data.logoName ?? payload.data.name;
        nextLogoUrl = upload.url;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "UNSUPPORTED_FILE_TYPE") {
            return NextResponse.json(
              { message: "รองรับเฉพาะไฟล์รูปภาพสำหรับโลโก้ร้าน" },
              { status: 400 },
            );
          }

          if (error.message === "FILE_TOO_LARGE") {
            return NextResponse.json(
              {
                message: `ไฟล์โลโก้ใหญ่เกินกำหนด (ไม่เกิน ${configuredLogoMaxSizeMb}MB)`,
              },
              { status: 400 },
            );
          }
        }

        return NextResponse.json({ message: "อัปโหลดโลโก้ไม่สำเร็จ" }, { status: 500 });
      }
    }
  }

  await db
    .update(stores)
    .set({
      name: payload.data.name,
      address: formattedAddress,
      phoneNumber: normalizedPhoneNumber,
      logoName: nextLogoName,
      logoUrl: nextLogoUrl,
    })
    .where(eq(stores.id, storeId));

  if (logoFile && targetStore.logoUrl && nextLogoUrl && targetStore.logoUrl !== nextLogoUrl) {
    try {
      await deleteStoreLogoFromR2({ logoUrl: targetStore.logoUrl });
    } catch {
      warningMessage = appendWarningMessage(
        warningMessage,
        "ลบโลโก้เก่าใน Cloudflare R2 ไม่สำเร็จ กรุณาลบไฟล์เก่าด้วยตนเอง",
      );
    }
  }

  return NextResponse.json({
    ok: true,
    warning: warningMessage,
    store: {
      name: payload.data.name,
      address: formattedAddress,
      phoneNumber: normalizedPhoneNumber,
      logoName: nextLogoName,
      logoUrl: nextLogoUrl,
    },
  });
}

async function patchByJsonBody(storeId: string, request: Request) {
  const payload = updateStoreJsonSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const updateValues: Partial<typeof stores.$inferInsert> = {};

  if (payload.data.name !== undefined) {
    updateValues.name = payload.data.name.trim();
  }

  if (payload.data.address !== undefined) {
    const normalizedAddress = payload.data.address?.trim() ?? "";
    if (normalizedAddress.length > 300) {
      return NextResponse.json({ message: "ที่อยู่ร้านต้องไม่เกิน 300 ตัวอักษร" }, { status: 400 });
    }
    updateValues.address = normalizedAddress.length > 0 ? normalizedAddress : null;
  }

  if (payload.data.phoneNumber !== undefined) {
    const normalizedPhoneNumber = normalizeOptionalText(payload.data.phoneNumber);
    const phoneError = validatePhoneNumber(normalizedPhoneNumber);
    if (phoneError) {
      return NextResponse.json({ message: phoneError }, { status: 400 });
    }
    updateValues.phoneNumber = normalizedPhoneNumber;
  }

  const [targetStore] = await db
    .select({
      id: stores.id,
      name: stores.name,
      address: stores.address,
      phoneNumber: stores.phoneNumber,
      logoName: stores.logoName,
      logoUrl: stores.logoUrl,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (!targetStore) {
    return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
  }

  await db.update(stores).set(updateValues).where(eq(stores.id, storeId));

  return NextResponse.json({
    ok: true,
    store: {
      name: updateValues.name ?? targetStore.name,
      address: updateValues.address ?? targetStore.address,
      phoneNumber: updateValues.phoneNumber ?? targetStore.phoneNumber,
      logoName: targetStore.logoName,
      logoUrl: targetStore.logoUrl,
    },
  });
}

export async function GET() {
  try {
    const { storeId } = await enforcePermission("settings.view");

    const [store] = await db
      .select({
        id: stores.id,
        name: stores.name,
        logoName: stores.logoName,
        logoUrl: stores.logoUrl,
        address: stores.address,
        phoneNumber: stores.phoneNumber,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!store) {
      return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      store,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { storeId } = await enforcePermission("settings.update");
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return patchByMultipartForm(storeId, request);
    }

    return patchByJsonBody(storeId, request);
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
