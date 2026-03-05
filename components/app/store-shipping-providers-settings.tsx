"use client";

import { Loader2, PencilLine, Plus, Trash2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type ShippingProviderItem = {
  id: string;
  code: string;
  displayName: string;
  branchName: string | null;
  aliases: string[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
};

type ShippingProviderFormState = {
  displayName: string;
  branchName: string;
  aliasesText: string;
  sortOrder: string;
  active: boolean;
};

type StoreShippingProvidersSettingsProps = {
  initialProviders: ShippingProviderItem[];
  canUpdate: boolean;
};

const emptyFormState = (): ShippingProviderFormState => ({
  displayName: "",
  branchName: "",
  aliasesText: "",
  sortOrder: "0",
  active: true,
});

const formStateFromProvider = (provider: ShippingProviderItem): ShippingProviderFormState => ({
  displayName: provider.displayName,
  branchName: provider.branchName ?? "",
  aliasesText: provider.aliases.join(", "),
  sortOrder: String(provider.sortOrder),
  active: provider.active,
});

const parseAliasesText = (value: string) => {
  const deduped = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = item.toLowerCase();
      if (deduped.has(key)) {
        return false;
      }
      deduped.add(key);
      return true;
    });
};

export function StoreShippingProvidersSettings({
  initialProviders,
  canUpdate,
}: StoreShippingProvidersSettingsProps) {
  const router = useRouter();
  const [providers, setProviders] = useState(initialProviders);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [form, setForm] = useState<ShippingProviderFormState>(emptyFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) =>
        a.sortOrder !== b.sortOrder
          ? a.sortOrder - b.sortOrder
          : a.displayName.localeCompare(b.displayName, "en"),
      ),
    [providers],
  );

  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingProviderId) ?? null,
    [editingProviderId, providers],
  );

  const closeSheet = (options?: { force?: boolean }) => {
    if (!options?.force && (isSaving || isDeleting)) {
      return;
    }
    setIsSheetOpen(false);
    setMode("create");
    setEditingProviderId(null);
    setForm(emptyFormState());
    setIsDeleteConfirmOpen(false);
    setErrorMessage(null);
  };

  const openCreateSheet = () => {
    if (!canUpdate) {
      return;
    }
    setMode("create");
    setEditingProviderId(null);
    setForm(emptyFormState());
    setIsDeleteConfirmOpen(false);
    setErrorMessage(null);
    setIsSheetOpen(true);
  };

  const openEditSheet = (provider: ShippingProviderItem) => {
    if (!canUpdate) {
      return;
    }
    setMode("edit");
    setEditingProviderId(provider.id);
    setForm(formStateFromProvider(provider));
    setIsDeleteConfirmOpen(false);
    setErrorMessage(null);
    setIsSheetOpen(true);
  };

  const setFormValue = <K extends keyof ShippingProviderFormState>(
    key: K,
    value: ShippingProviderFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (!canUpdate) {
      return;
    }
    if (mode === "edit" && !editingProviderId) {
      setErrorMessage("ไม่พบรายการที่ต้องการแก้ไข");
      return;
    }
    const displayName = form.displayName.trim();
    if (!displayName) {
      setErrorMessage("กรุณากรอกชื่อผู้ให้บริการขนส่ง");
      return;
    }

    const parsedSortOrder = Number(form.sortOrder);
    if (!Number.isFinite(parsedSortOrder) || parsedSortOrder < 0) {
      setErrorMessage("ลำดับแสดงต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    const aliases = parseAliasesText(form.aliasesText);

    try {
      const response = await authFetch("/api/settings/store/shipping-providers", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          mode === "create"
            ? {
                displayName,
                branchName: form.branchName.trim(),
                aliases,
                sortOrder: Math.trunc(parsedSortOrder),
                active: form.active,
              }
            : {
                id: editingProviderId,
                displayName,
                branchName: form.branchName.trim(),
                aliases,
                sortOrder: Math.trunc(parsedSortOrder),
                active: form.active,
              },
        ),
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string; provider?: ShippingProviderItem }
        | null;

      if (!response.ok) {
        setErrorMessage(data?.message ?? "บันทึกข้อมูลขนส่งไม่สำเร็จ");
        return;
      }

      if (!data?.provider) {
        setErrorMessage("ไม่พบข้อมูลผู้ให้บริการที่บันทึก");
        return;
      }
      const provider = data.provider;

      setProviders((prev) => {
        const index = prev.findIndex((item) => item.id === provider.id);
        if (index < 0) {
          return [...prev, provider];
        }
        const next = [...prev];
        next[index] = provider;
        return next;
      });

      toast.success(mode === "create" ? "เพิ่มผู้ให้บริการขนส่งแล้ว" : "อัปเดตผู้ให้บริการขนส่งแล้ว");
      closeSheet({ force: true });
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProvider = async () => {
    if (!canUpdate || !editingProviderId) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await authFetch(
        `/api/settings/store/shipping-providers?id=${encodeURIComponent(editingProviderId)}`,
        { method: "DELETE" },
      );

      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setErrorMessage(data?.message ?? "ลบผู้ให้บริการขนส่งไม่สำเร็จ");
        return;
      }

      setProviders((prev) => prev.filter((item) => item.id !== editingProviderId));
      toast.success("ลบผู้ให้บริการขนส่งแล้ว");
      closeSheet({ force: true });
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ผู้ให้บริการขนส่ง</h2>
          <p className="text-xs text-slate-500">รายการนี้ถูกใช้เป็นปุ่มเลือกใน flow สั่งออนไลน์</p>
        </div>
        <Button onClick={openCreateSheet} disabled={!canUpdate} className="h-9 rounded-lg px-3">
          <Plus className="h-4 w-4" />
          เพิ่มขนส่ง
        </Button>
      </div>

      {!canUpdate ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          บัญชีนี้มีสิทธิ์ดูอย่างเดียว ไม่สามารถเพิ่ม/แก้ไขผู้ให้บริการขนส่ง
        </p>
      ) : null}

      {sortedProviders.length <= 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500">
          ยังไม่มีผู้ให้บริการขนส่ง
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedProviders.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Truck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{provider.displayName}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {provider.branchName?.trim() ? `สาขา: ${provider.branchName}` : "ไม่ระบุสาขา"} • ลำดับ{" "}
                  {provider.sortOrder}
                  {provider.aliases.length > 0 ? ` • alias ${provider.aliases.join(", ")}` : ""}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  provider.active
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-slate-200 bg-slate-100 text-slate-600"
                }`}
              >
                {provider.active ? "ใช้งาน" : "ปิดใช้งาน"}
              </span>
              <button
                type="button"
                onClick={() => openEditSheet(provider)}
                disabled={!canUpdate}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`แก้ไข ${provider.displayName}`}
              >
                <PencilLine className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SlideUpSheet
        isOpen={isSheetOpen}
        onClose={closeSheet}
        title={mode === "create" ? "เพิ่มผู้ให้บริการขนส่ง" : "แก้ไขผู้ให้บริการขนส่ง"}
        description="ค่าที่บันทึกจะถูกใช้ในหน้า POS (สั่งออนไลน์/จัดส่ง)"
        panelMaxWidthClass="min-[1200px]:max-w-xl"
        disabled={isSaving || isDeleting}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="shipping-provider-display-name">
              ชื่อผู้ให้บริการ
            </label>
            <input
              id="shipping-provider-display-name"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
              value={form.displayName}
              onChange={(event) => setFormValue("displayName", event.target.value)}
              disabled={isSaving || isDeleting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="shipping-provider-branch-name">
              สาขา (ไม่บังคับ)
            </label>
            <input
              id="shipping-provider-branch-name"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
              value={form.branchName}
              onChange={(event) => setFormValue("branchName", event.target.value)}
              disabled={isSaving || isDeleting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="shipping-provider-aliases">
              Alias (คั่นด้วย ,)
            </label>
            <input
              id="shipping-provider-aliases"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
              value={form.aliasesText}
              onChange={(event) => setFormValue("aliasesText", event.target.value)}
              disabled={isSaving || isDeleting}
              placeholder="เช่น HL, Houngaloun Express"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="shipping-provider-sort-order">
                ลำดับแสดง
              </label>
              <input
                id="shipping-provider-sort-order"
                type="number"
                min={0}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                value={form.sortOrder}
                onChange={(event) => setFormValue("sortOrder", event.target.value)}
                disabled={isSaving || isDeleting}
              />
            </div>
            <label className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                checked={form.active}
                onChange={(event) => setFormValue("active", event.target.checked)}
                disabled={isSaving || isDeleting}
              />
              ใช้งาน
            </label>
          </div>

          {editingProvider ? (
            <p className="text-[11px] text-slate-500">รหัสภายใน: {editingProvider.code}</p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={submit} disabled={isSaving || isDeleting} className="h-10 rounded-lg px-4">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : mode === "create" ? (
                "เพิ่มผู้ให้บริการ"
              ) : (
                "บันทึกการเปลี่ยนแปลง"
              )}
            </Button>

            {mode === "edit" ? (
              isDeleteConfirmOpen ? (
                <div className="w-full space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3">
                  <p className="text-xs text-red-700">
                    ยืนยันลบผู้ให้บริการขนส่งนี้? รายการนี้จะหายจากตัวเลือกใน POS
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsDeleteConfirmOpen(false)}
                      disabled={isDeleting || isSaving}
                      className="h-9 rounded-lg px-3"
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      variant="outline"
                      onClick={deleteProvider}
                      disabled={isSaving || isDeleting}
                      className="h-9 rounded-lg border-red-300 px-3 text-red-600"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          กำลังลบ...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          ยืนยันลบ
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={isSaving || isDeleting}
                  className="h-10 rounded-lg px-4 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  ลบรายการนี้
                </Button>
              )
            ) : null}
          </div>
        </div>
      </SlideUpSheet>
    </section>
  );
}
