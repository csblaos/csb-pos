"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type TouchEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import type { UnitOption } from "@/lib/products/service";
import {
  createUnitSchema,
  type CreateUnitFormInput,
  type CreateUnitInput,
} from "@/lib/products/validation";

type UnitsManagementProps = {
  units: UnitOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export function UnitsManagement({ units, canCreate, canUpdate, canDelete }: UnitsManagementProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitOption | null>(null);
  const [deleteDialogUnit, setDeleteDialogUnit] = useState<UnitOption | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  const [isCreateSheetDragging, setIsCreateSheetDragging] = useState(false);
  const [createSheetDragY, setCreateSheetDragY] = useState(0);
  const createSheetStartYRef = useRef<number | null>(null);
  const createSheetCanDragRef = useRef(false);

  const [isEditSheetDragging, setIsEditSheetDragging] = useState(false);
  const [editSheetDragY, setEditSheetDragY] = useState(0);
  const editSheetStartYRef = useRef<number | null>(null);
  const editSheetCanDragRef = useRef(false);

  const sheetScrollYRef = useRef(0);
  const bodyStyleRef = useRef<{
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
  } | null>(null);

  const createForm = useForm<CreateUnitFormInput, unknown, CreateUnitInput>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      code: "",
      nameTh: "",
    },
  });

  const updateForm = useForm<CreateUnitFormInput, unknown, CreateUnitInput>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      code: "",
      nameTh: "",
    },
  });

  const resetFeedback = () => {
    setErrorMessage(null);
    setDeleteErrorMessage(null);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const applyViewportState = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    applyViewportState();
    mediaQuery.addEventListener("change", applyViewportState);
    return () => {
      mediaQuery.removeEventListener("change", applyViewportState);
    };
  }, []);

  useEffect(() => {
    if (!isCreateSheetOpen && !isEditSheetOpen) {
      return;
    }

    const body = document.body;
    sheetScrollYRef.current = window.scrollY;
    bodyStyleRef.current = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${sheetScrollYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      const previousBodyStyle = bodyStyleRef.current;
      if (previousBodyStyle) {
        body.style.position = previousBodyStyle.position;
        body.style.top = previousBodyStyle.top;
        body.style.left = previousBodyStyle.left;
        body.style.right = previousBodyStyle.right;
        body.style.width = previousBodyStyle.width;
        body.style.overflow = previousBodyStyle.overflow;
      }
      window.scrollTo(0, sheetScrollYRef.current);
    };
  }, [isCreateSheetOpen, isEditSheetOpen]);

  const resetCreateSheetDrag = () => {
    setCreateSheetDragY(0);
    setIsCreateSheetDragging(false);
    createSheetStartYRef.current = null;
    createSheetCanDragRef.current = false;
  };

  const resetEditSheetDrag = () => {
    setEditSheetDragY(0);
    setIsEditSheetDragging(false);
    editSheetStartYRef.current = null;
    editSheetCanDragRef.current = false;
  };

  const handleCreateSheetTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isCreateSheetOpen || createForm.formState.isSubmitting || isDesktopViewport) {
      return;
    }

    createSheetCanDragRef.current = true;
    createSheetStartYRef.current = event.touches[0]?.clientY ?? null;
    setCreateSheetDragY(0);
    setIsCreateSheetDragging(false);
  };

  const handleCreateSheetTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktopViewport || !createSheetCanDragRef.current || createSheetStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") {
      return;
    }

    const deltaY = Math.max(0, currentY - createSheetStartYRef.current);
    if (deltaY <= 0) {
      return;
    }

    setIsCreateSheetDragging(true);
    setCreateSheetDragY(deltaY);
    event.preventDefault();
  };

  const handleCreateSheetTouchEnd = () => {
    if (isDesktopViewport) {
      return;
    }

    if (!createSheetCanDragRef.current && createSheetStartYRef.current === null) {
      return;
    }

    if (createSheetDragY > 120) {
      closeCreateSheet();
      return;
    }

    resetCreateSheetDrag();
  };

  const handleEditSheetTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isEditSheetOpen || updateForm.formState.isSubmitting || isDesktopViewport) {
      return;
    }

    editSheetCanDragRef.current = true;
    editSheetStartYRef.current = event.touches[0]?.clientY ?? null;
    setEditSheetDragY(0);
    setIsEditSheetDragging(false);
  };

  const handleEditSheetTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktopViewport || !editSheetCanDragRef.current || editSheetStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") {
      return;
    }

    const deltaY = Math.max(0, currentY - editSheetStartYRef.current);
    if (deltaY <= 0) {
      return;
    }

    setIsEditSheetDragging(true);
    setEditSheetDragY(deltaY);
    event.preventDefault();
  };

  const handleEditSheetTouchEnd = () => {
    if (isDesktopViewport) {
      return;
    }

    if (!editSheetCanDragRef.current && editSheetStartYRef.current === null) {
      return;
    }

    if (editSheetDragY > 120) {
      closeEditSheet();
      return;
    }

    resetEditSheetDrag();
  };

  const closeCreateSheet = () => {
    if (createForm.formState.isSubmitting) {
      return;
    }
    resetCreateSheetDrag();
    setIsCreateSheetOpen(false);
  };

  const openEditSheet = (unit: UnitOption) => {
    if (!canUpdate || unit.scope !== "STORE") {
      return;
    }

    resetFeedback();
    resetEditSheetDrag();
    setEditingUnit(unit);
    updateForm.reset({
      code: unit.code,
      nameTh: unit.nameTh,
    });
    setIsEditSheetOpen(true);
  };

  const closeEditSheet = (options?: { force?: boolean }) => {
    if (!options?.force && updateForm.formState.isSubmitting) {
      return;
    }

    resetEditSheetDrag();
    setIsEditSheetOpen(false);
    setEditingUnit(null);
  };

  const closeDeleteDialog = () => {
    if (deletingUnitId) {
      return;
    }
    setDeleteDialogUnit(null);
    setDeleteErrorMessage(null);
  };

  const openDeleteDialog = (unit: UnitOption) => {
    if (!canDelete || unit.scope !== "STORE") {
      return;
    }
    if (deletingUnitId) {
      return;
    }

    resetFeedback();
    setDeleteDialogUnit(unit);
  };

  const onConfirmDeleteUnit = async () => {
    if (!deleteDialogUnit || !canDelete || deleteDialogUnit.scope !== "STORE") {
      return;
    }

    resetFeedback();
    setDeletingUnitId(deleteDialogUnit.id);
    try {
      const response = await authFetch(`/api/units/${deleteDialogUnit.id}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
            usage?: {
              productBaseCount?: number;
              productConversionCount?: number;
              orderItemCount?: number;
            };
          }
        | null;

      if (!response.ok) {
        const usageText = data?.usage
          ? ` (หน่วยหลักสินค้า ${data.usage.productBaseCount ?? 0}, หน่วยแปลง ${data.usage.productConversionCount ?? 0}, รายการขาย ${data.usage.orderItemCount ?? 0})`
          : "";
        setDeleteErrorMessage(`${data?.message ?? "ลบหน่วยสินค้าไม่สำเร็จ"}${usageText}`);
        return;
      }

      if (editingUnit?.id === deleteDialogUnit.id) {
        closeEditSheet();
      }

      toast.success("ลบหน่วยสินค้าเรียบร้อย");
      setDeleteDialogUnit(null);
      router.refresh();
    } catch {
      setDeleteErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeletingUnitId(null);
    }
  };

  const onCreateSubmit = createForm.handleSubmit(async (values) => {
    resetFeedback();

    try {
      const response = await authFetch("/api/units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
          }
        | null;

      if (!response.ok) {
        setErrorMessage(data?.message ?? "เพิ่มหน่วยไม่สำเร็จ");
        return;
      }

      createForm.reset({ code: "", nameTh: "" });
      toast.success("เพิ่มหน่วยสินค้าเรียบร้อย");
      resetCreateSheetDrag();
      setIsCreateSheetOpen(false);
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  });

  const onUpdateSubmit = updateForm.handleSubmit(async (values) => {
    if (!editingUnit) {
      return;
    }

    resetFeedback();

    try {
      const response = await authFetch(`/api/units/${editingUnit.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
          }
        | null;

      if (!response.ok) {
        setErrorMessage(data?.message ?? "อัปเดตหน่วยไม่สำเร็จ");
        return;
      }

      toast.success("อัปเดตหน่วยสินค้าเรียบร้อย");
      closeEditSheet({ force: true });
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  });

  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  const renderCreateForm = (idPrefix: string) => (
    <form className="space-y-3" onSubmit={onCreateSubmit}>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-unit-code`}>
          รหัสหน่วย (เช่น PCS, PACK)
        </label>
        <input
          id={`${idPrefix}-unit-code`}
          className={fieldClassName}
          disabled={!canCreate || createForm.formState.isSubmitting}
          {...createForm.register("code")}
        />
        {createForm.formState.errors.code?.message ? (
          <p className="text-xs text-red-600">{createForm.formState.errors.code.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-unit-name`}>
          ชื่อหน่วยภาษาไทย
        </label>
        <input
          id={`${idPrefix}-unit-name`}
          className={fieldClassName}
          disabled={!canCreate || createForm.formState.isSubmitting}
          {...createForm.register("nameTh")}
        />
        {createForm.formState.errors.nameTh?.message ? (
          <p className="text-xs text-red-600">{createForm.formState.errors.nameTh.message}</p>
        ) : null}
      </div>

      {!canCreate ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          บัญชีนี้ไม่มีสิทธิ์เพิ่มหน่วยสินค้า
        </p>
      ) : null}

      <Button
        type="submit"
        className="h-11 w-full rounded-xl"
        disabled={!canCreate || createForm.formState.isSubmitting}
      >
        {createForm.formState.isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังบันทึก...
          </>
        ) : (
          "บันทึกหน่วยสินค้า"
        )}
      </Button>
    </form>
  );

  const renderEditForm = (idPrefix: string) => (
    <form className="space-y-3" onSubmit={onUpdateSubmit}>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-edit-unit-code`}>
          รหัสหน่วย (เช่น PCS, PACK)
        </label>
        <input
          id={`${idPrefix}-edit-unit-code`}
          className={fieldClassName}
          disabled={!canUpdate || updateForm.formState.isSubmitting}
          {...updateForm.register("code")}
        />
        {updateForm.formState.errors.code?.message ? (
          <p className="text-xs text-red-600">{updateForm.formState.errors.code.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-edit-unit-name`}>
          ชื่อหน่วยภาษาไทย
        </label>
        <input
          id={`${idPrefix}-edit-unit-name`}
          className={fieldClassName}
          disabled={!canUpdate || updateForm.formState.isSubmitting}
          {...updateForm.register("nameTh")}
        />
        {updateForm.formState.errors.nameTh?.message ? (
          <p className="text-xs text-red-600">{updateForm.formState.errors.nameTh.message}</p>
        ) : null}
      </div>

      {!canUpdate ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          บัญชีนี้ไม่มีสิทธิ์แก้ไขหน่วยสินค้า
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl"
          onClick={() => closeEditSheet()}
          disabled={updateForm.formState.isSubmitting}
        >
          ยกเลิก
        </Button>
        <Button
          type="submit"
          className="h-11 rounded-xl"
          disabled={!canUpdate || updateForm.formState.isSubmitting}
        >
          {updateForm.formState.isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            "บันทึกการแก้ไข"
          )}
        </Button>
      </div>
    </form>
  );

  const createSheetBackdropOpacity = isCreateSheetOpen
    ? Math.max(0, 1 - Math.min(createSheetDragY / 220, 1) * 0.55)
    : 0;
  const editSheetBackdropOpacity = isEditSheetOpen
    ? Math.max(0, 1 - Math.min(editSheetDragY / 220, 1) * 0.55)
    : 0;
  const createSheetInlineStyle =
    isCreateSheetOpen && !isDesktopViewport ? { transform: `translateY(${createSheetDragY}px)` } : undefined;
  const editSheetInlineStyle =
    isEditSheetOpen && !isDesktopViewport ? { transform: `translateY(${editSheetDragY}px)` } : undefined;

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          เพิ่มหน่วยใหม่
        </p>

        <div className="sm:flex sm:justify-end">
          <Button
            type="button"
            className="h-11 w-full rounded-xl sm:w-auto sm:px-5"
            onClick={() => {
              resetFeedback();
              resetCreateSheetDrag();
              setIsCreateSheetOpen(true);
            }}
            disabled={!canCreate}
          >
            <Plus className="h-4 w-4" />
            เพิ่มหน่วยสินค้า
          </Button>
        </div>
      </div>

      {errorMessage && !isEditSheetOpen && !deleteDialogUnit ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          รายการหน่วย
        </p>
        <div className="px-1">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">ค่าเริ่มต้นระบบ</span> จะไม่สามารถแก้ไขหรือลบได้
          </p>
        </div>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">รายการหน่วยสินค้า</h2>
          </div>
          {units.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">ยังไม่มีหน่วยสินค้าในร้านนี้</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {units.map((unit) => (
                <li key={unit.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{unit.code}</p>
                      <span
                        className={
                          unit.scope === "SYSTEM"
                            ? "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                            : "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                        }
                      >
                        {unit.scope === "SYSTEM" ? "ค่าเริ่มต้นระบบ" : "หน่วยของร้าน"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{unit.nameTh}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canUpdate && unit.scope === "STORE" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-xl px-3 text-xs"
                        onClick={() => openEditSheet(unit)}
                      >
                        แก้ไข
                      </Button>
                    ) : null}
                    {canDelete && unit.scope === "STORE" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-xl border-red-200 px-3 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => openDeleteDialog(unit)}
                        disabled={Boolean(deletingUnitId)}
                      >
                        {deletingUnitId === unit.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            กำลังลบ...
                          </>
                        ) : (
                          "ลบ"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div
        className={`fixed inset-0 z-50 ${isCreateSheetOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isCreateSheetOpen}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างเพิ่มหน่วย"
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200 ${
            isCreateSheetOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ opacity: createSheetBackdropOpacity }}
          onClick={closeCreateSheet}
          disabled={createForm.formState.isSubmitting}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            isCreateSheetDragging && !isDesktopViewport
              ? "transition-none"
              : "transition-all duration-300 ease-out"
          } ${
            isCreateSheetOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
          style={createSheetInlineStyle}
        >
          <div
            className="flex touch-none justify-center pt-2 sm:hidden"
            onTouchStart={handleCreateSheetTouchStart}
            onTouchMove={handleCreateSheetTouchMove}
            onTouchEnd={handleCreateSheetTouchEnd}
            onTouchCancel={handleCreateSheetTouchEnd}
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">เพิ่มหน่วยสินค้า</p>
              <p className="mt-0.5 text-xs text-slate-500">กรอกรหัสและชื่อหน่วยที่ต้องการ</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeCreateSheet}
              disabled={createForm.formState.isSubmitting}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            {renderCreateForm("mobile")}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-50 ${isEditSheetOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isEditSheetOpen}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างแก้ไขหน่วย"
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200 ${
            isEditSheetOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ opacity: editSheetBackdropOpacity }}
          onClick={() => closeEditSheet()}
          disabled={updateForm.formState.isSubmitting}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            isEditSheetDragging && !isDesktopViewport
              ? "transition-none"
              : "transition-all duration-300 ease-out"
          } ${
            isEditSheetOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
          style={editSheetInlineStyle}
        >
          <div
            className="flex touch-none justify-center pt-2 sm:hidden"
            onTouchStart={handleEditSheetTouchStart}
            onTouchMove={handleEditSheetTouchMove}
            onTouchEnd={handleEditSheetTouchEnd}
            onTouchCancel={handleEditSheetTouchEnd}
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">แก้ไขหน่วยสินค้า</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {editingUnit ? `รายการ: ${editingUnit.code}` : "อัปเดตรหัสและชื่อหน่วย"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={() => closeEditSheet()}
              disabled={updateForm.formState.isSubmitting}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            {renderEditForm("edit")}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-50 ${deleteDialogUnit ? "" : "pointer-events-none"}`}
        aria-hidden={!deleteDialogUnit}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างยืนยันลบหน่วย"
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${
            deleteDialogUnit ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeDeleteDialog}
          disabled={Boolean(deletingUnitId)}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            deleteDialogUnit
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">ยืนยันการลบหน่วยสินค้า</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {deleteDialogUnit ? `หน่วย: ${deleteDialogUnit.code}` : "เลือกหน่วยที่ต้องการลบ"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeDeleteDialog}
              disabled={Boolean(deletingUnitId)}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            <p className="text-sm text-slate-700">
              คุณต้องการลบหน่วยนี้ใช่หรือไม่? ระบบจะลบได้เฉพาะหน่วยที่ไม่ถูกใช้งานในสินค้าและรายการขาย
            </p>

            {deleteErrorMessage ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {deleteErrorMessage}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={closeDeleteDialog}
                disabled={Boolean(deletingUnitId)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl bg-red-600 text-white hover:bg-red-700"
                onClick={onConfirmDeleteUnit}
                disabled={Boolean(deletingUnitId)}
              >
                {deletingUnitId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  "ลบหน่วย"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
