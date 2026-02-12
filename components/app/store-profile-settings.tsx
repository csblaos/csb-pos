"use client";

import {
  CheckCircle2,
  CircleAlert,
  ImagePlus,
  Loader2,
  Lock,
  MapPin,
  Phone,
  Store,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import {
  formatLaosAddress,
  getDistrictsByProvinceId,
  laosProvinces,
  parseLaosAddress,
} from "@/lib/location/laos-address";

const ADDRESS_DETAIL_SEPARATOR = " | ";
const phoneNumberPattern = /^[0-9+\-\s()]+$/;

type StoreProfileSettingsProps = {
  storeId: string;
  storeName: string;
  initialLogoName: string | null;
  initialLogoUrl: string | null;
  initialAddress: string | null;
  initialPhoneNumber: string | null;
  canUpdate: boolean;
};

type AddressFields = {
  provinceId: number | null;
  districtId: number | null;
  village: string;
  addressDetail: string;
};

function splitVillageAndDetail(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return {
      village: "",
      addressDetail: "",
    };
  }

  const [villagePart, ...detailParts] = normalized.split(ADDRESS_DETAIL_SEPARATOR);
  if (detailParts.length === 0) {
    return {
      village: normalized,
      addressDetail: "",
    };
  }

  return {
    village: villagePart.trim(),
    addressDetail: detailParts.join(ADDRESS_DETAIL_SEPARATOR).trim(),
  };
}

function mergeVillageAndDetail(village: string, addressDetail: string) {
  const normalizedVillage = village.trim();
  const normalizedAddressDetail = addressDetail.trim();

  if (!normalizedAddressDetail) {
    return normalizedVillage;
  }

  return `${normalizedVillage}${ADDRESS_DETAIL_SEPARATOR}${normalizedAddressDetail}`;
}

function createAddressFieldsFromAddress(address: string | null): AddressFields {
  const parsed = parseLaosAddress(address);
  const villageAndDetail = splitVillageAndDetail(parsed.detail);

  return {
    provinceId: parsed.provinceId,
    districtId: parsed.districtId,
    village: villageAndDetail.village,
    addressDetail: villageAndDetail.addressDetail,
  };
}

function CardStatusBadge({ dirty }: { dirty: boolean }) {
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <CircleAlert className="h-3.5 w-3.5" />
        ยังไม่บันทึก
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />
      บันทึกแล้ว
    </span>
  );
}

export function StoreProfileSettings({
  storeId,
  storeName,
  initialLogoName,
  initialLogoUrl,
  initialAddress,
  initialPhoneNumber,
  canUpdate,
}: StoreProfileSettingsProps) {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const initialAddressFields = useMemo(
    () => createAddressFieldsFromAddress(initialAddress),
    [initialAddress],
  );

  const [storeNameValue, setStoreNameValue] = useState(storeName);
  const [provinceId, setProvinceId] = useState<number | null>(initialAddressFields.provinceId);
  const [districtId, setDistrictId] = useState<number | null>(initialAddressFields.districtId);
  const [village, setVillage] = useState(initialAddressFields.village);
  const [addressDetail, setAddressDetail] = useState(initialAddressFields.addressDetail);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber ?? "");

  const [savedStoreName, setSavedStoreName] = useState(storeName);
  const [savedProvinceId, setSavedProvinceId] = useState<number | null>(initialAddressFields.provinceId);
  const [savedDistrictId, setSavedDistrictId] = useState<number | null>(initialAddressFields.districtId);
  const [savedVillage, setSavedVillage] = useState(initialAddressFields.village);
  const [savedAddressDetail, setSavedAddressDetail] = useState(initialAddressFields.addressDetail);
  const [savedPhoneNumber, setSavedPhoneNumber] = useState(initialPhoneNumber ?? "");
  const [savedLogoName, setSavedLogoName] = useState<string | null>(initialLogoName);
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(initialLogoUrl);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSlowLoading, setShowSlowLoading] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [logoFile]);

  useEffect(() => {
    const nextAddressFields = createAddressFieldsFromAddress(initialAddress);

    setStoreNameValue(storeName);
    setProvinceId(nextAddressFields.provinceId);
    setDistrictId(nextAddressFields.districtId);
    setVillage(nextAddressFields.village);
    setAddressDetail(nextAddressFields.addressDetail);
    setPhoneNumber(initialPhoneNumber ?? "");

    setSavedStoreName(storeName);
    setSavedProvinceId(nextAddressFields.provinceId);
    setSavedDistrictId(nextAddressFields.districtId);
    setSavedVillage(nextAddressFields.village);
    setSavedAddressDetail(nextAddressFields.addressDetail);
    setSavedPhoneNumber(initialPhoneNumber ?? "");
    setSavedLogoName(initialLogoName);
    setSavedLogoUrl(initialLogoUrl);

    setLogoFile(null);
    setLogoPreviewUrl(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    setErrorMessage(null);
    setIsConfirmOpen(false);
    setShowSlowLoading(false);
    setIsSaving(false);
  }, [storeId, storeName, initialLogoName, initialLogoUrl, initialAddress, initialPhoneNumber]);

  const districtOptions = useMemo(() => getDistrictsByProvinceId(provinceId), [provinceId]);
  const renderedLogoUrl = logoPreviewUrl ?? savedLogoUrl;
  const renderedLogoName = logoFile?.name ?? savedLogoName;

  const normalizedStoreName = storeNameValue.trim();
  const normalizedVillage = village.trim();
  const normalizedAddressDetail = addressDetail.trim();
  const normalizedPhoneNumber = phoneNumber.trim();

  const storeCardDirty =
    normalizedStoreName !== savedStoreName.trim() || logoFile !== null;
  const addressCardDirty =
    provinceId !== savedProvinceId ||
    districtId !== savedDistrictId ||
    normalizedVillage !== savedVillage.trim() ||
    normalizedAddressDetail !== savedAddressDetail.trim();
  const contactCardDirty = normalizedPhoneNumber !== savedPhoneNumber.trim();
  const hasAnyChanges = storeCardDirty || addressCardDirty || contactCardDirty;

  const addressPreview = useMemo(() => {
    if (!provinceId || !districtId || !normalizedVillage) {
      return "กรอก Province / District / Village ให้ครบ";
    }

    const formattedAddress = formatLaosAddress({
      provinceId,
      districtId,
      detail: mergeVillageAndDetail(normalizedVillage, normalizedAddressDetail),
    });

    return formattedAddress || "กรอก Province / District / Village ให้ครบ";
  }, [provinceId, districtId, normalizedVillage, normalizedAddressDetail]);

  const validateInput = () => {
    if (normalizedStoreName.length < 2 || normalizedStoreName.length > 120) {
      return {
        ok: false as const,
        message: "ชื่อร้านต้องมี 2-120 ตัวอักษร",
      };
    }

    const selectedProvinceId = provinceId;
    if (!selectedProvinceId) {
      return {
        ok: false as const,
        message: "กรุณาเลือก Province",
      };
    }

    const selectedDistrictId = districtId;
    if (!selectedDistrictId) {
      return {
        ok: false as const,
        message: "กรุณาเลือก District",
      };
    }

    if (!normalizedVillage) {
      return {
        ok: false as const,
        message: "กรุณากรอก Village",
      };
    }

    if (normalizedAddressDetail.length > 160) {
      return {
        ok: false as const,
        message: "รายละเอียดเพิ่มเติมต้องไม่เกิน 160 ตัวอักษร",
      };
    }

    if (
      normalizedPhoneNumber.length > 0 &&
      (!phoneNumberPattern.test(normalizedPhoneNumber) ||
        normalizedPhoneNumber.length < 6 ||
        normalizedPhoneNumber.length > 20)
    ) {
      return {
        ok: false as const,
        message: "รูปแบบเบอร์โทรไม่ถูกต้อง",
      };
    }

    const formattedAddress = formatLaosAddress({
      provinceId: selectedProvinceId,
      districtId: selectedDistrictId,
      detail: mergeVillageAndDetail(normalizedVillage, normalizedAddressDetail),
    });

    if (!formattedAddress || formattedAddress.length > 300) {
      return {
        ok: false as const,
        message: "ข้อมูลที่อยู่ร้านไม่ถูกต้อง",
      };
    }

    return {
      ok: true as const,
      normalizedStoreName,
      normalizedVillage,
      normalizedAddressDetail,
      normalizedPhoneNumber,
      selectedProvinceId,
      selectedDistrictId,
      formattedAddress,
    };
  };

  const handleOpenConfirm = () => {
    setSuccessMessage(null);
    setWarningMessage(null);
    setErrorMessage(null);

    if (!hasAnyChanges) {
      setSuccessMessage("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
      return;
    }

    const validation = validateInput();
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setIsConfirmOpen(true);
  };

  const saveProfile = async () => {
    const validation = validateInput();
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setSuccessMessage(null);
    setWarningMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    const slowLoadingTimer = window.setTimeout(() => {
      setShowSlowLoading(true);
    }, 350);

    try {
      const formData = new FormData();
      formData.set("name", validation.normalizedStoreName);
      formData.set("provinceId", String(validation.selectedProvinceId));
      formData.set("districtId", String(validation.selectedDistrictId));
      formData.set("village", validation.normalizedVillage);
      formData.set("addressDetail", validation.normalizedAddressDetail);
      formData.set("phoneNumber", validation.normalizedPhoneNumber);
      if (logoFile) {
        formData.set("logoFile", logoFile);
        formData.set("logoName", logoFile.name.slice(0, 120) || validation.normalizedStoreName);
      }

      const response = await authFetch("/api/settings/store", {
        method: "PATCH",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
            warning?: string | null;
            store?: {
              name?: string;
              logoName?: string | null;
              logoUrl?: string | null;
              address?: string | null;
              phoneNumber?: string | null;
            };
          }
        | null;

      if (!response.ok) {
        setErrorMessage(data?.message ?? "บันทึกข้อมูลร้านไม่สำเร็จ");
        return;
      }

      const nextStoreName = data?.store?.name?.trim() || validation.normalizedStoreName;
      const nextAddress = data?.store?.address ?? validation.formattedAddress;
      const nextPhoneNumber = data?.store?.phoneNumber ?? validation.normalizedPhoneNumber;
      const nextLogoName = data?.store?.logoName ?? savedLogoName;
      const nextLogoUrl = data?.store?.logoUrl ?? savedLogoUrl;
      const nextAddressFields = createAddressFieldsFromAddress(nextAddress);

      setStoreNameValue(nextStoreName);
      setProvinceId(nextAddressFields.provinceId);
      setDistrictId(nextAddressFields.districtId);
      setVillage(nextAddressFields.village);
      setAddressDetail(nextAddressFields.addressDetail);
      setPhoneNumber(nextPhoneNumber ?? "");

      setSavedStoreName(nextStoreName);
      setSavedProvinceId(nextAddressFields.provinceId);
      setSavedDistrictId(nextAddressFields.districtId);
      setSavedVillage(nextAddressFields.village);
      setSavedAddressDetail(nextAddressFields.addressDetail);
      setSavedPhoneNumber(nextPhoneNumber ?? "");
      setSavedLogoName(nextLogoName);
      setSavedLogoUrl(nextLogoUrl);
      setLogoFile(null);
      setIsConfirmOpen(false);

      setWarningMessage(data?.warning ?? null);
      setSuccessMessage("บันทึกข้อมูลร้านเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      window.clearTimeout(slowLoadingTimer);
      setShowSlowLoading(false);
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">จัดการข้อมูลหน้าร้านให้พร้อมใช้งานจริง</p>
        {canUpdate ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            โหมดแก้ไข
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            <Lock className="h-3.5 w-3.5" />
            โหมดอ่านอย่างเดียว
          </span>
        )}
      </div>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-sky-700" />
            <p className="text-sm font-semibold">ข้อมูลร้าน</p>
          </div>
          <CardStatusBadge dirty={storeCardDirty} />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="store-name">
            ชื่อร้าน
          </label>
          <input
            id="store-name"
            value={storeNameValue}
            onChange={(event) => setStoreNameValue(event.target.value)}
            disabled={!canUpdate || isSaving}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
            placeholder="เช่น Cafe Riverside"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">โลโก้ร้าน</label>
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={!canUpdate || isSaving}
                className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {renderedLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={renderedLogoUrl}
                    alt="โลโก้ร้านปัจจุบัน"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <ImagePlus className="h-7 w-7 text-slate-400" />
                  </span>
                )}
                {canUpdate ? (
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-[11px] font-medium text-white group-hover:flex">
                    เปลี่ยนรูป
                  </span>
                ) : null}
              </button>

              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                disabled={!canUpdate || isSaving}
                className="sr-only"
              />

              <p className="text-xs text-muted-foreground">
                {canUpdate ? "คลิกที่รูปเพื่ออัปโหลดโลโก้ใหม่" : "โลโก้ร้านปัจจุบัน"}
              </p>
              <p className="text-xs text-muted-foreground">
                รองรับ JPG, PNG, WEBP, SVG (ขนาดสูงสุดตามที่ระบบกำหนด)
              </p>
              {renderedLogoName ? (
                <p className="max-w-[220px] truncate text-xs text-slate-700" title={renderedLogoName}>
                  {renderedLogoName}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">ยังไม่มีโลโก้ร้าน</p>
              )}
            </div>
          </div>
        </div>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-violet-700" />
            <p className="text-sm font-semibold">ที่อยู่ร้าน</p>
          </div>
          <CardStatusBadge dirty={addressCardDirty} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="store-province">
              Province
            </label>
            <select
              id="store-province"
              value={provinceId ?? ""}
              onChange={(event) => {
                const nextProvinceId = Number(event.target.value) || null;
                setProvinceId(nextProvinceId);
                setDistrictId(null);
              }}
              disabled={!canUpdate || isSaving}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
            >
              <option value="">เลือก Province</option>
              {laosProvinces.map((province) => (
                <option key={province.id} value={province.id}>
                  {province.nameEn}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="store-district">
              District
            </label>
            <select
              id="store-district"
              value={districtId ?? ""}
              onChange={(event) => setDistrictId(Number(event.target.value) || null)}
              disabled={!canUpdate || isSaving || !provinceId}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
            >
              <option value="">เลือก District</option>
              {districtOptions.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.nameEn}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="store-village">
              Village
            </label>
            <input
              id="store-village"
              value={village}
              onChange={(event) => setVillage(event.target.value)}
              disabled={!canUpdate || isSaving}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
              placeholder="เช่น Ban Phonxay"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="store-address-detail">
              รายละเอียดเพิ่ม (optional)
            </label>
            <input
              id="store-address-detail"
              value={addressDetail}
              onChange={(event) => setAddressDetail(event.target.value)}
              disabled={!canUpdate || isSaving}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
              placeholder="เช่น ซอย 2 ใกล้ตลาด"
            />
          </div>
        </div>

        <p className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">
          ที่อยู่ที่จะแสดง: <span className="font-medium">{addressPreview}</span>
        </p>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold">ติดต่อร้าน</p>
          </div>
          <CardStatusBadge dirty={contactCardDirty} />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="store-phone-number">
            เบอร์โทรร้าน
          </label>
          <input
            id="store-phone-number"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={!canUpdate || isSaving}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
            placeholder="เช่น +856 20 9999 9999"
          />
        </div>
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {warningMessage ? <p className="text-sm text-amber-700">{warningMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {canUpdate ? (
        <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 text-xs">
            <p className="text-muted-foreground">
              {hasAnyChanges ? "มีข้อมูลที่ยังไม่บันทึก" : "ข้อมูลล่าสุดถูกบันทึกแล้ว"}
            </p>
            <CardStatusBadge dirty={hasAnyChanges} />
          </div>
          <Button
            className="h-10 w-full"
            onClick={handleOpenConfirm}
            disabled={isSaving || !hasAnyChanges}
          >
            บันทึกการเปลี่ยนแปลง
          </Button>
        </article>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลร้าน กรุณาติดต่อผู้ดูแลระบบร้าน
        </p>
      )}

      {isConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => {
            if (!isSaving) {
              setIsConfirmOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold">ยืนยันการบันทึกข้อมูลร้าน</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ตรวจสอบข้อมูลด้านล่าง แล้วกดยืนยันเพื่อบันทึกการเปลี่ยนแปลง
            </p>
            {isSaving ? (
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {showSlowLoading ? "กำลังบันทึกข้อมูล (เครือข่ายช้าเล็กน้อย)" : "กำลังบันทึก..."}
              </p>
            ) : null}
            {errorMessage ? <p className="mt-2 text-xs text-red-600">{errorMessage}</p> : null}

            <div className="mt-4 space-y-2 rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
              <p>
                ชื่อร้าน: <span className="font-medium">{normalizedStoreName || "-"}</span>
              </p>
              <p>
                ที่อยู่ร้าน: <span className="font-medium">{addressPreview}</span>
              </p>
              <p>
                เบอร์โทรร้าน: <span className="font-medium">{normalizedPhoneNumber || "ไม่ระบุ"}</span>
              </p>
              <p>
                โลโก้ร้าน:{" "}
                <span className="font-medium">
                  {logoFile ? logoFile.name : savedLogoName ? `ใช้ไฟล์เดิม (${savedLogoName})` : "ยังไม่มี"}
                </span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSaving}
              >
                ยกเลิก
              </Button>
              <Button type="button" onClick={saveProfile} disabled={isSaving}>
                {isSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึก...
                  </span>
                ) : (
                  "ยืนยันบันทึก"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
