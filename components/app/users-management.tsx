"use client";

import { ChevronRight, Copy, KeyRound, Loader2, Mail, Plus, Smartphone, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type MemberItem = {
  userId: string;
  email: string;
  name: string;
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
  mustChangePassword: boolean;
  sessionLimit: number | null;
  createdByUserId: string | null;
  createdByName: string | null;
  roleId: string;
  roleName: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  joinedAt: string;
  addedByUserId: string | null;
  addedByName: string | null;
};

type RoleOption = {
  id: string;
  name: string;
};

type UsersManagementProps = {
  members: MemberItem[];
  roles: RoleOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canLinkExisting: boolean;
  defaultSessionLimit: number;
};

const statusLabel: Record<MemberItem["status"], string> = {
  ACTIVE: "ใช้งาน",
  INVITED: "รอเปิดใช้งาน",
  SUSPENDED: "ระงับ",
};

const statusToneClassName: Record<MemberItem["status"], string> = {
  ACTIVE: "text-emerald-700",
  INVITED: "text-amber-700",
  SUSPENDED: "text-rose-700",
};

const statusDotClassName: Record<MemberItem["status"], string> = {
  ACTIVE: "bg-emerald-500",
  INVITED: "bg-amber-500",
  SUSPENDED: "bg-rose-500",
};

const statusCompactLabel: Record<MemberItem["status"], string> = {
  ACTIVE: "ใช้งาน",
  INVITED: "รอ",
  SUSPENDED: "ระงับ",
};

const statusOptions: Array<{ value: MemberItem["status"]; label: string }> = [
  { value: "ACTIVE", label: "ใช้งาน" },
  { value: "INVITED", label: "รอเปิดใช้งาน" },
  { value: "SUSPENDED", label: "ระงับ" },
];

const normalizeSessionLimit = (value: string) => {
  const raw = value.trim();
  if (!raw) {
    return { ok: true as const, value: null as number | null };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    return {
      ok: false as const,
      message: "จำนวนอุปกรณ์ต้องเป็นตัวเลข 1-10 หรือเว้นว่างเพื่อใช้ค่าเริ่มต้นระบบ",
    };
  }

  return { ok: true as const, value: parsed };
};

const getInitial = (name: string, email: string) => {
  const text = name.trim() || email.trim();
  if (!text) {
    return "U";
  }
  return text.slice(0, 1).toUpperCase();
};

export function UsersManagement({
  members,
  roles,
  canCreate,
  canUpdate,
  canLinkExisting,
  defaultSessionLimit,
}: UsersManagementProps) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"new" | "existing">("new");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [isResetPasswordConfirmOpen, setIsResetPasswordConfirmOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoleId, setFormRoleId] = useState<string>(roles[0]?.id ?? "");
  const [existingEmail, setExistingEmail] = useState("");
  const [existingRoleId, setExistingRoleId] = useState<string>(roles[0]?.id ?? "");

  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<MemberItem["status"]>("ACTIVE");
  const [editSessionLimit, setEditSessionLimit] = useState<string>("");

  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  const editingMember = editingMemberId ? membersById.get(editingMemberId) ?? null : null;
  const isEditModalOpen = Boolean(editingMember);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    if (!isCreateModalOpen && !isEditModalOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isCreateModalOpen, isEditModalOpen]);

  const openCreateModal = () => {
    if (!canCreate) {
      return;
    }
    setCreateErrorMessage(null);
    setCreateMode("new");
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (loadingKey === "create-user" || loadingKey === "add-existing-user") {
      return;
    }
    setIsCreateModalOpen(false);
    setCreateErrorMessage(null);
  };

  const openEditModal = (member: MemberItem) => {
    setEditErrorMessage(null);
    setEditingMemberId(member.userId);
    setEditRoleId(member.roleId);
    setEditStatus(member.status);
    setEditSessionLimit(member.sessionLimit?.toString() ?? "");
    setIsResetPasswordConfirmOpen(false);
    setTemporaryPassword(null);
  };

  const closeEditModal = () => {
    if (loadingKey === "save-member" || loadingKey === "reset-password") {
      return;
    }
    setEditingMemberId(null);
    setEditErrorMessage(null);
    setIsResetPasswordConfirmOpen(false);
    setTemporaryPassword(null);
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword || typeof window === "undefined" || !window.navigator?.clipboard) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(temporaryPassword);
      toast.success("คัดลอกรหัสชั่วคราวแล้ว");
    } catch {
      toast.error("คัดลอกรหัสชั่วคราวไม่สำเร็จ");
    }
  };

  const resetMemberPassword = async () => {
    if (!editingMember) {
      return;
    }

    setLoadingKey("reset-password");
    setEditErrorMessage(null);

    const response = await authFetch(`/api/settings/users/${editingMember.userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "reset_password",
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          temporaryPassword?: string;
        }
      | null;

    if (!response.ok) {
      setEditErrorMessage(data?.message ?? "รีเซ็ตรหัสผ่านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (!data?.temporaryPassword) {
      setEditErrorMessage("ไม่พบรหัสผ่านชั่วคราวจากระบบ");
      setLoadingKey(null);
      return;
    }

    setTemporaryPassword(data.temporaryPassword);
    setIsResetPasswordConfirmOpen(false);
    toast.success("รีเซ็ตรหัสผ่านชั่วคราวเรียบร้อย");
    setLoadingKey(null);
    router.refresh();
  };

  const createUser = async () => {
    if (!formRoleId) {
      setCreateErrorMessage("กรุณาเลือกบทบาท");
      return;
    }

    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setCreateErrorMessage("กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบ");
      return;
    }

    if (formPassword.trim().length < 8) {
      setCreateErrorMessage("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    setLoadingKey("create-user");
    setCreateErrorMessage(null);

    const response = await authFetch("/api/settings/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "create_new",
        name: formName,
        email: formEmail,
        password: formPassword,
        roleId: formRoleId,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setCreateErrorMessage(data?.message ?? "เพิ่มผู้ใช้ไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setIsCreateModalOpen(false);
    toast.success("เพิ่มผู้ใช้เรียบร้อยแล้ว");
    setLoadingKey(null);
    router.refresh();
  };

  const addExistingUserToStore = async () => {
    if (!existingRoleId) {
      setCreateErrorMessage("กรุณาเลือกบทบาท");
      return;
    }

    if (!existingEmail.trim()) {
      setCreateErrorMessage("กรุณากรอกอีเมลผู้ใช้เดิม");
      return;
    }

    setLoadingKey("add-existing-user");
    setCreateErrorMessage(null);

    const response = await authFetch("/api/settings/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "add_existing",
        email: existingEmail.trim().toLowerCase(),
        roleId: existingRoleId,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setCreateErrorMessage(data?.message ?? "เพิ่มผู้ใช้เดิมเข้าร้านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setExistingEmail("");
    setIsCreateModalOpen(false);
    toast.success("เพิ่มผู้ใช้เดิมเข้าร้านเรียบร้อยแล้ว");
    setLoadingKey(null);
    router.refresh();
  };

  const saveMemberChanges = async () => {
    if (!editingMember) {
      return;
    }

    if (!editRoleId) {
      setEditErrorMessage("กรุณาเลือกบทบาท");
      return;
    }

    const normalizedLimit = normalizeSessionLimit(editSessionLimit);
    if (!normalizedLimit.ok) {
      setEditErrorMessage(normalizedLimit.message);
      return;
    }

    const roleDirty = editRoleId !== editingMember.roleId;
    const statusDirty = editStatus !== editingMember.status;
    const sessionDirty = normalizedLimit.value !== editingMember.sessionLimit;
    const hasAnyChanges = roleDirty || statusDirty || sessionDirty;

    if (!hasAnyChanges) {
      toast.success("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
      return;
    }

    setLoadingKey("save-member");
    setEditErrorMessage(null);

    const runPatch = async (payload: Record<string, unknown>, fallbackMessage: string) => {
      const response = await authFetch(`/api/settings/users/${editingMember.userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(data?.message ?? fallbackMessage);
      }
    };

    try {
      if (roleDirty) {
        await runPatch({ action: "assign_role", roleId: editRoleId }, "เปลี่ยนบทบาทไม่สำเร็จ");
      }

      if (statusDirty) {
        await runPatch({ action: "set_status", status: editStatus }, "เปลี่ยนสถานะไม่สำเร็จ");
      }

      if (sessionDirty) {
        await runPatch(
          { action: "set_session_limit", sessionLimit: normalizedLimit.value },
          "บันทึกจำนวนอุปกรณ์ไม่สำเร็จ",
        );
      }

      setEditingMemberId(null);
      toast.success("บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "บันทึกข้อมูลสมาชิกไม่สำเร็จ";
      setEditErrorMessage(message);
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">สมาชิกทั้งหมด {members.length.toLocaleString("th-TH")} คน</p>
            <p className="text-xs text-slate-500">แตะรายการสมาชิกเพื่อจัดการบทบาท สถานะ และอุปกรณ์ที่เข้าใช้งานได้</p>
          </div>
          {canCreate ? (
            <Button className="h-10 w-full rounded-xl sm:w-auto" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              เพิ่มสมาชิก
            </Button>
          ) : null}
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">รายชื่อสมาชิก</h2>
        </div>
        {members.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">ยังไม่มีสมาชิกในร้านนี้</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((member) => (
              <li key={member.userId}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => openEditModal(member)}
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                    {getInitial(member.name, member.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="block min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                        {member.name}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        title={
                          member.sessionLimit === null
                            ? "จำกัดอุปกรณ์ตามค่าเริ่มต้นระบบ"
                            : `จำกัดอุปกรณ์ ${member.sessionLimit} เครื่อง`
                        }
                      >
                        <Smartphone className="h-3 w-3" />
                        {member.sessionLimit ?? defaultSessionLimit}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">{member.email}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <span className="truncate">{rolesById.get(member.roleId)?.name ?? member.roleName}</span>
                      <span className="text-slate-300">•</span>
                      <span className={`inline-flex items-center gap-1 ${statusToneClassName[member.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClassName[member.status]}`} />
                        {statusCompactLabel[member.status]}
                      </span>
                      {member.mustChangePassword ? (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            รอเปลี่ยนรหัส
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className={`fixed inset-0 z-50 ${isCreateModalOpen ? "" : "pointer-events-none"}`} aria-hidden={!isCreateModalOpen}>
        <button
          type="button"
          aria-label="ปิดหน้าต่างเพิ่มสมาชิก"
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${isCreateModalOpen ? "opacity-100" : "opacity-0"}`}
          onClick={closeCreateModal}
          disabled={loadingKey === "create-user" || loadingKey === "add-existing-user"}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[calc(100dvh-0.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(720px,calc(100dvh-2rem))] sm:w-full sm:max-w-md sm:rounded-2xl ${
            isCreateModalOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
        >
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">เพิ่มสมาชิกในร้าน</p>
                <p className="mt-0.5 text-xs text-slate-500">สร้างบัญชีใหม่หรือเพิ่มผู้ใช้เดิมเข้าร้าน</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
                onClick={closeCreateModal}
                disabled={loadingKey === "create-user" || loadingKey === "add-existing-user"}
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-4">
            {canLinkExisting ? (
              <div className="mb-4 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className={`h-9 rounded-lg text-sm font-medium transition ${createMode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  onClick={() => setCreateMode("new")}
                  disabled={loadingKey !== null}
                >
                  สร้างผู้ใช้ใหม่
                </button>
                <button
                  type="button"
                  className={`h-9 rounded-lg text-sm font-medium transition ${createMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  onClick={() => setCreateMode("existing")}
                  disabled={loadingKey !== null}
                >
                  เพิ่มผู้ใช้เดิม
                </button>
              </div>
            ) : null}

            {createMode === "new" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="new-user-name">
                    ชื่อผู้ใช้
                  </label>
                  <input
                    id="new-user-name"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canCreate || loadingKey !== null}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="new-user-email">
                    อีเมล
                  </label>
                  <input
                    id="new-user-email"
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canCreate || loadingKey !== null}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="new-user-password">
                    รหัสผ่านเริ่มต้น
                  </label>
                  <input
                    id="new-user-password"
                    type="password"
                    value={formPassword}
                    onChange={(event) => setFormPassword(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canCreate || loadingKey !== null}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="new-user-role">
                    บทบาท
                  </label>
                  <select
                    id="new-user-role"
                    value={formRoleId}
                    onChange={(event) => setFormRoleId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canCreate || loadingKey !== null}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  เพิ่มได้เฉพาะผู้ใช้ที่อยู่ในร้านภายใต้ SUPERADMIN เดียวกัน
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="existing-user-email">
                    อีเมลผู้ใช้เดิม
                  </label>
                  <input
                    id="existing-user-email"
                    type="email"
                    value={existingEmail}
                    onChange={(event) => setExistingEmail(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canCreate || loadingKey !== null}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="existing-user-role">
                    บทบาทในร้านนี้
                  </label>
                  <select
                    id="existing-user-role"
                    value={existingRoleId}
                    onChange={(event) => setExistingRoleId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canCreate || loadingKey !== null}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 border-t border-slate-100 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:pb-4">
            {createErrorMessage ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {createErrorMessage}
              </p>
            ) : null}
            <div className={`${createErrorMessage ? "mt-3 " : ""}grid grid-cols-2 gap-2`}>
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={closeCreateModal} disabled={loadingKey !== null}>
                ยกเลิก
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl"
                onClick={createMode === "new" ? createUser : addExistingUserToStore}
                disabled={!canCreate || loadingKey !== null}
              >
                {loadingKey === "create-user" || loadingKey === "add-existing-user" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : createMode === "new" ? (
                  "เพิ่มผู้ใช้"
                ) : (
                  "เพิ่มผู้ใช้เดิม"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-50 ${editingMember ? "" : "pointer-events-none"}`} aria-hidden={!editingMember}>
        <div
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${editingMember ? "opacity-100" : "opacity-0"}`}
          onClick={closeEditModal}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-auto w-full max-h-[calc(100dvh-0.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition duration-200 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(760px,calc(100dvh-2rem))] sm:w-[min(720px,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl ${editingMember ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
        >
          {editingMember ? (
            <>
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900">{editingMember.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{editingMember.email}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2.5" onClick={closeEditModal}>
                    ปิด
                  </Button>
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <article className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">บทบาท</p>
                    <select
                      value={editRoleId}
                      onChange={(event) => setEditRoleId(event.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                      disabled={!canUpdate || loadingKey !== null}
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </article>

                  <article className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">สถานะ</p>
                    <div className="grid grid-cols-3 gap-1">
                      {statusOptions.map((status) => (
                        <button
                          key={status.value}
                          type="button"
                          onClick={() => setEditStatus(status.value)}
                          disabled={!canUpdate || loadingKey !== null}
                          className={`h-9 rounded-lg text-xs font-medium transition ${
                            editStatus === status.value
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:bg-white"
                          }`}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  </article>

                  <article className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-xs text-slate-500">จำกัดอุปกรณ์เข้าสู่ระบบ</p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={editSessionLimit}
                        onChange={(event) => setEditSessionLimit(event.target.value)}
                        placeholder="ว่าง = ค่าเริ่มต้นระบบ"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                        disabled={!canUpdate || loadingKey !== null}
                      />
                      <span className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-500">
                        ปัจจุบัน: {editingMember.sessionLimit ?? defaultSessionLimit}
                      </span>
                    </div>
                  </article>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    สิทธิ์ระบบ: {editingMember.systemRole}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5" />
                    สถานะปัจจุบัน: {statusLabel[editingMember.status]}
                  </p>
                  <p className="mt-1">
                    สร้างบัญชีโดย: {editingMember.createdByName ?? (editingMember.createdByUserId ? "ไม่ทราบชื่อ" : "ระบบ")}
                  </p>
                  <p className="mt-1">
                    เพิ่มเข้าร้านโดย: {editingMember.addedByName ?? (editingMember.addedByUserId ? "ไม่ทราบชื่อ" : "ระบบ")}
                  </p>
                  <p className="mt-1">
                    สถานะรหัสผ่าน: {editingMember.mustChangePassword ? "ต้องเปลี่ยนรหัสก่อนเข้าใช้งาน" : "ปกติ"}
                  </p>
                </div>

                <article className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium text-slate-700">รีเซ็ตรหัสผ่านชั่วคราว</p>
                  <p className="text-xs text-slate-500">
                    ระบบจะสร้างรหัสแบบใช้ครั้งเดียว และบังคับให้ผู้ใช้เปลี่ยนรหัสใหม่เมื่อเข้าสู่ระบบครั้งถัดไป
                  </p>

                  {temporaryPassword ? (
                    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2">
                      <p className="text-xs text-emerald-700">รหัสชั่วคราวใหม่</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm font-semibold text-emerald-700">
                          {temporaryPassword}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-lg px-2.5 text-xs"
                          onClick={copyTemporaryPassword}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          คัดลอก
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!temporaryPassword && isResetPasswordConfirmOpen ? (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
                      <p className="text-xs text-amber-700">ยืนยันรีเซ็ตรหัสผ่านของสมาชิกคนนี้ใช่หรือไม่?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 rounded-lg text-xs"
                          onClick={() => setIsResetPasswordConfirmOpen(false)}
                          disabled={loadingKey === "reset-password"}
                        >
                          ยกเลิก
                        </Button>
                        <Button
                          type="button"
                          className="h-9 rounded-lg text-xs"
                          onClick={resetMemberPassword}
                          disabled={!canUpdate || loadingKey === "reset-password"}
                        >
                          {loadingKey === "reset-password" ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              กำลังรีเซ็ต...
                            </>
                          ) : (
                            "ยืนยันรีเซ็ต"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!temporaryPassword && !isResetPasswordConfirmOpen ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg text-xs"
                      onClick={() => setIsResetPasswordConfirmOpen(true)}
                      disabled={!canUpdate || loadingKey !== null}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      รีเซ็ตรหัสผ่านชั่วคราว
                    </Button>
                  ) : null}
                </article>
              </div>

              <div className="sticky bottom-0 z-10 border-t border-slate-100 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:pb-4">
                {editErrorMessage ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {editErrorMessage}
                  </p>
                ) : null}
                <div className={`${editErrorMessage ? "mt-3 " : ""}grid grid-cols-2 gap-2`}>
                  <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={closeEditModal} disabled={loadingKey !== null}>
                    ยกเลิก
                  </Button>
                  <Button type="button" className="h-10 rounded-xl" onClick={saveMemberChanges} disabled={!canUpdate || loadingKey !== null}>
                    {loadingKey === "save-member" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      "บันทึกการเปลี่ยนแปลง"
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
