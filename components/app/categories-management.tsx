"use client";

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type TouchEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import type { CategoryItem } from "@/lib/products/service";

type CategoriesManagementProps = {
  categories: CategoryItem[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export function CategoriesManagement({
  categories: initialCategories,
  canCreate,
  canUpdate,
  canDelete,
}: CategoriesManagementProps) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* ── Sheet state ── */
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(
    null,
  );
  const [deleteDialogCategory, setDeleteDialogCategory] =
    useState<CategoryItem | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  /* ── Form state ── */
  const [createName, setCreateName] = useState("");
  const [editName, setEditName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(
    null,
  );

  /* ── Drag-to-dismiss (create sheet) ── */
  const [isCreateDragging, setIsCreateDragging] = useState(false);
  const [createDragY, setCreateDragY] = useState(0);
  const createStartYRef = useRef<number | null>(null);
  const createCanDragRef = useRef(false);

  /* ── Drag-to-dismiss (edit sheet) ── */
  const [isEditDragging, setIsEditDragging] = useState(false);
  const [editDragY, setEditDragY] = useState(0);
  const editStartYRef = useRef<number | null>(null);
  const editCanDragRef = useRef(false);

  /* ── Body scroll lock ── */
  const sheetScrollYRef = useRef(0);
  const bodyStyleRef = useRef<{
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
  } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsDesktopViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isCreateSheetOpen && !isEditSheetOpen) return;
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
      const prev = bodyStyleRef.current;
      if (prev) {
        body.style.position = prev.position;
        body.style.top = prev.top;
        body.style.left = prev.left;
        body.style.right = prev.right;
        body.style.width = prev.width;
        body.style.overflow = prev.overflow;
      }
      window.scrollTo(0, sheetScrollYRef.current);
    };
  }, [isCreateSheetOpen, isEditSheetOpen]);

  /* ── Drag helpers ── */
  const resetCreateDrag = () => {
    setCreateDragY(0);
    setIsCreateDragging(false);
    createStartYRef.current = null;
    createCanDragRef.current = false;
  };
  const resetEditDrag = () => {
    setEditDragY(0);
    setIsEditDragging(false);
    editStartYRef.current = null;
    editCanDragRef.current = false;
  };

  const handleCreateTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!isCreateSheetOpen || isSubmitting || isDesktopViewport) return;
    createCanDragRef.current = true;
    createStartYRef.current = e.touches[0]?.clientY ?? null;
    setCreateDragY(0);
    setIsCreateDragging(false);
  };
  const handleCreateTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (
      isDesktopViewport ||
      !createCanDragRef.current ||
      createStartYRef.current === null
    )
      return;
    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    const dy = Math.max(0, y - createStartYRef.current);
    if (dy <= 0) return;
    setIsCreateDragging(true);
    setCreateDragY(dy);
    e.preventDefault();
  };
  const handleCreateTouchEnd = () => {
    if (isDesktopViewport) return;
    if (createDragY > 120) {
      closeCreateSheet();
      return;
    }
    resetCreateDrag();
  };

  const handleEditTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!isEditSheetOpen || isSubmitting || isDesktopViewport) return;
    editCanDragRef.current = true;
    editStartYRef.current = e.touches[0]?.clientY ?? null;
    setEditDragY(0);
    setIsEditDragging(false);
  };
  const handleEditTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (
      isDesktopViewport ||
      !editCanDragRef.current ||
      editStartYRef.current === null
    )
      return;
    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    const dy = Math.max(0, y - editStartYRef.current);
    if (dy <= 0) return;
    setIsEditDragging(true);
    setEditDragY(dy);
    e.preventDefault();
  };
  const handleEditTouchEnd = () => {
    if (isDesktopViewport) return;
    if (editDragY > 120) {
      closeEditSheet();
      return;
    }
    resetEditDrag();
  };

  /* ── Sheet open/close ── */
  const openCreateSheet = () => {
    setErrorMessage(null);
    setCreateName("");
    resetCreateDrag();
    setIsCreateSheetOpen(true);
  };

  const closeCreateSheet = () => {
    if (isSubmitting) return;
    resetCreateDrag();
    setIsCreateSheetOpen(false);
  };

  const openEditSheet = (cat: CategoryItem) => {
    if (!canUpdate) return;
    setErrorMessage(null);
    resetEditDrag();
    setEditingCategory(cat);
    setEditName(cat.name);
    setIsEditSheetOpen(true);
  };

  const closeEditSheet = () => {
    if (isSubmitting) return;
    resetEditDrag();
    setIsEditSheetOpen(false);
    setEditingCategory(null);
  };

  const openDeleteDialog = (cat: CategoryItem) => {
    if (!canDelete) return;
    setDeleteErrorMessage(null);
    setDeleteDialogCategory(cat);
  };

  const closeDeleteDialog = () => {
    if (deletingId) return;
    setDeleteDialogCategory(null);
    setDeleteErrorMessage(null);
  };

  /* ── CRUD ── */
  const onCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await authFetch("/api/products/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.message ?? "เพิ่มหมวดหมู่ไม่สำเร็จ");
        return;
      }
      setCategories(data.categories);
      toast.success("เพิ่มหมวดหมู่เรียบร้อย");
      resetCreateDrag();
      setIsCreateSheetOpen(false);
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editName.trim();
    if (!name || !editingCategory || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await authFetch("/api/products/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCategory.id, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.message ?? "เปลี่ยนชื่อไม่สำเร็จ");
        return;
      }
      setCategories(data.categories);
      toast.success("เปลี่ยนชื่อเรียบร้อย");
      resetEditDrag();
      setIsEditSheetOpen(false);
      setEditingCategory(null);
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteDialogCategory || !canDelete) return;
    setDeleteErrorMessage(null);
    setDeletingId(deleteDialogCategory.id);
    try {
      const res = await authFetch("/api/products/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteDialogCategory.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteErrorMessage(data?.message ?? "ลบหมวดหมู่ไม่สำเร็จ");
        return;
      }
      setCategories(data.categories);
      toast.success("ลบหมวดหมู่เรียบร้อย");
      setDeleteDialogCategory(null);
      router.refresh();
    } catch {
      setDeleteErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Style helpers ── */
  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  const createBackdropOpacity = isCreateSheetOpen
    ? Math.max(0, 1 - Math.min(createDragY / 220, 1) * 0.55)
    : 0;
  const editBackdropOpacity = isEditSheetOpen
    ? Math.max(0, 1 - Math.min(editDragY / 220, 1) * 0.55)
    : 0;
  const createSheetStyle =
    isCreateSheetOpen && !isDesktopViewport
      ? { transform: `translateY(${createDragY}px)` }
      : undefined;
  const editSheetStyle =
    isEditSheetOpen && !isDesktopViewport
      ? { transform: `translateY(${editDragY}px)` }
      : undefined;

  return (
    <section className="space-y-5">
      {/* ── Add button ── */}
      {canCreate && (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            เพิ่มหมวดหมู่ใหม่
          </p>
          <div className="sm:flex sm:justify-end">
            <Button
              type="button"
              className="h-11 w-full rounded-xl sm:w-auto sm:px-5"
              onClick={openCreateSheet}
            >
              <Plus className="h-4 w-4" />
              เพิ่มหมวดหมู่
            </Button>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {errorMessage && !isEditSheetOpen && !deleteDialogCategory ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      {/* ── Category list ── */}
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          รายการหมวดหมู่
        </p>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              หมวดหมู่สินค้า ({categories.length})
            </h2>
          </div>
          {categories.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              ยังไม่มีหมวดหมู่สินค้า
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {categories.map((cat) => (
                <li
                  key={cat.id}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {cat.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cat.productCount} สินค้า
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canUpdate && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-xl px-3 text-xs"
                        onClick={() => openEditSheet(cat)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        แก้ไข
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-xl border-red-200 px-3 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => openDeleteDialog(cat)}
                        disabled={Boolean(deletingId)}
                      >
                        {deletingId === cat.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            กำลังลบ...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-1 h-3 w-3" />
                            ลบ
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Create Category
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className={`fixed inset-0 z-50 ${isCreateSheetOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isCreateSheetOpen}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างเพิ่มหมวดหมู่"
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200 ${
            isCreateSheetOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ opacity: createBackdropOpacity }}
          onClick={closeCreateSheet}
          disabled={isSubmitting}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            isCreateDragging && !isDesktopViewport
              ? "transition-none"
              : "transition-all duration-300 ease-out"
          } ${
            isCreateSheetOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
          style={createSheetStyle}
        >
          <div
            className="flex touch-none justify-center pt-2 sm:hidden"
            onTouchStart={handleCreateTouchStart}
            onTouchMove={handleCreateTouchMove}
            onTouchEnd={handleCreateTouchEnd}
            onTouchCancel={handleCreateTouchEnd}
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                เพิ่มหมวดหมู่
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                กรอกชื่อหมวดหมู่ที่ต้องการสร้าง
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeCreateSheet}
              disabled={isSubmitting}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            <form className="space-y-3" onSubmit={onCreateSubmit}>
              <div className="space-y-2">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="create-cat-name"
                >
                  ชื่อหมวดหมู่
                </label>
                <input
                  id="create-cat-name"
                  autoFocus
                  className={fieldClassName}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="เช่น อาหาร, เครื่องดื่ม, ขนม"
                  disabled={isSubmitting}
                />
              </div>

              {errorMessage && isCreateSheetOpen ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {errorMessage}
                </p>
              ) : null}

              <Button
                type="submit"
                className="h-11 w-full rounded-xl"
                disabled={!createName.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกหมวดหมู่"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Edit Category
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className={`fixed inset-0 z-50 ${isEditSheetOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isEditSheetOpen}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างแก้ไขหมวดหมู่"
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200 ${
            isEditSheetOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ opacity: editBackdropOpacity }}
          onClick={closeEditSheet}
          disabled={isSubmitting}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            isEditDragging && !isDesktopViewport
              ? "transition-none"
              : "transition-all duration-300 ease-out"
          } ${
            isEditSheetOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
          style={editSheetStyle}
        >
          <div
            className="flex touch-none justify-center pt-2 sm:hidden"
            onTouchStart={handleEditTouchStart}
            onTouchMove={handleEditTouchMove}
            onTouchEnd={handleEditTouchEnd}
            onTouchCancel={handleEditTouchEnd}
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                แก้ไขหมวดหมู่
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {editingCategory
                  ? `รายการ: ${editingCategory.name}`
                  : "อัปเดตชื่อหมวดหมู่"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeEditSheet}
              disabled={isSubmitting}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            <form className="space-y-3" onSubmit={onEditSubmit}>
              <div className="space-y-2">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="edit-cat-name"
                >
                  ชื่อหมวดหมู่
                </label>
                <input
                  id="edit-cat-name"
                  autoFocus
                  className={fieldClassName}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {errorMessage && isEditSheetOpen ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {errorMessage}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={closeEditSheet}
                  disabled={isSubmitting}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  className="h-11 rounded-xl"
                  disabled={!editName.trim() || isSubmitting}
                >
                  {isSubmitting ? (
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
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * Delete Confirm Dialog
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className={`fixed inset-0 z-50 ${deleteDialogCategory ? "" : "pointer-events-none"}`}
        aria-hidden={!deleteDialogCategory}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างยืนยันลบหมวดหมู่"
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${
            deleteDialogCategory ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeDeleteDialog}
          disabled={Boolean(deletingId)}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            deleteDialogCategory
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                ยืนยันการลบหมวดหมู่
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {deleteDialogCategory
                  ? `หมวดหมู่: ${deleteDialogCategory.name}`
                  : "เลือกหมวดหมู่ที่ต้องการลบ"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeDeleteDialog}
              disabled={Boolean(deletingId)}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            {deleteDialogCategory &&
            deleteDialogCategory.productCount > 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                หมวดหมู่นี้มี{" "}
                <span className="font-semibold">
                  {deleteDialogCategory.productCount} สินค้า
                </span>{" "}
                อยู่ — กรุณาย้ายสินค้าออกก่อนจึงจะลบได้
              </p>
            ) : (
              <p className="text-sm text-slate-700">
                คุณต้องการลบหมวดหมู่นี้ใช่หรือไม่?
                การลบไม่สามารถย้อนกลับได้
              </p>
            )}

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
                disabled={Boolean(deletingId)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl bg-red-600 text-white hover:bg-red-700"
                onClick={onConfirmDelete}
                disabled={
                  Boolean(deletingId) ||
                  (deleteDialogCategory
                    ? deleteDialogCategory.productCount > 0
                    : false)
                }
              >
                {deletingId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  "ลบหมวดหมู่"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
