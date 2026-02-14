"use client";

import { Check, ChevronRight, Copy, KeyRound, Loader2, Mail, Plus, Search, Smartphone, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
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

type BranchOption = {
  id: string;
  name: string;
  code: string | null;
};

type ExistingUserCandidate = {
  userId: string;
  name: string;
  email: string;
  sourceStores: string[];
};

type UsersManagementProps = {
  members: MemberItem[];
  roles: RoleOption[];
  branches: BranchOption[];
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

const getDefaultRoleId = (roleOptions: RoleOption[]) => {
  const staffRole = roleOptions.find((role) => role.name.trim().toLowerCase() === "staff");
  return staffRole?.id ?? roleOptions[0]?.id ?? "";
};

const normalizeBranchIds = (branchIds: string[]) =>
  [...new Set(branchIds)].sort((a, b) => a.localeCompare(b));

export function UsersManagement({
  members,
  roles,
  branches,
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
  const [createdTemporaryPassword, setCreatedTemporaryPassword] = useState<string | null>(null);
  const [createdUserEmail, setCreatedUserEmail] = useState<string>("");
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  const [isCreateModalDragging, setIsCreateModalDragging] = useState(false);
  const [createModalDragY, setCreateModalDragY] = useState(0);
  const createModalStartYRef = useRef<number | null>(null);
  const createModalCanDragRef = useRef(false);

  const [isEditModalDragging, setIsEditModalDragging] = useState(false);
  const [editModalDragY, setEditModalDragY] = useState(0);
  const editModalStartYRef = useRef<number | null>(null);
  const editModalCanDragRef = useRef(false);

  const modalScrollYRef = useRef(0);
  const bodyStyleRef = useRef<{
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
  } | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRoleId, setFormRoleId] = useState<string>(() => getDefaultRoleId(roles));
  const [existingQuery, setExistingQuery] = useState("");
  const [existingRoleId, setExistingRoleId] = useState<string>(() => getDefaultRoleId(roles));
  const [existingCandidates, setExistingCandidates] = useState<ExistingUserCandidate[]>([]);
  const [existingCandidatesError, setExistingCandidatesError] = useState<string | null>(null);
  const [selectedExistingUserId, setSelectedExistingUserId] = useState<string>("");
  const [isLoadingExistingCandidates, setIsLoadingExistingCandidates] = useState(false);

  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<MemberItem["status"]>("ACTIVE");
  const [editSessionLimit, setEditSessionLimit] = useState<string>("");
  const [isLoadingEditBranchAccess, setIsLoadingEditBranchAccess] = useState(false);
  const [editBranchMode, setEditBranchMode] = useState<"ALL" | "SELECTED">("ALL");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [initialEditBranchMode, setInitialEditBranchMode] = useState<"ALL" | "SELECTED">("ALL");
  const [initialEditBranchIds, setInitialEditBranchIds] = useState<string[]>([]);

  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  const editingMember = editingMemberId ? membersById.get(editingMemberId) ?? null : null;
  const isEditModalOpen = Boolean(editingMember);

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
    const defaultRoleId = getDefaultRoleId(roles);
    setFormRoleId((current) =>
      roles.some((role) => role.id === current) ? current : defaultRoleId,
    );
    setExistingRoleId((current) =>
      roles.some((role) => role.id === current) ? current : defaultRoleId,
    );
  }, [roles]);

  useEffect(() => {
    if (!isCreateModalOpen && !isEditModalOpen) {
      return;
    }

    const body = document.body;
    modalScrollYRef.current = window.scrollY;
    bodyStyleRef.current = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${modalScrollYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (isCreateModalOpen && loadingKey !== "create-user" && loadingKey !== "add-existing-user") {
        resetCreateModalDrag();
        setIsCreateModalOpen(false);
        setCreateErrorMessage(null);
        setCreatedTemporaryPassword(null);
        setCreatedUserEmail("");
      }
      if (isEditModalOpen && loadingKey !== "save-member" && loadingKey !== "reset-password") {
        resetEditModalDrag();
        setEditingMemberId(null);
        setEditErrorMessage(null);
        setIsLoadingEditBranchAccess(false);
        setEditBranchMode("ALL");
        setEditBranchIds([]);
        setInitialEditBranchMode("ALL");
        setInitialEditBranchIds([]);
        setIsResetPasswordConfirmOpen(false);
        setTemporaryPassword(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      const previousBodyStyle = bodyStyleRef.current;
      if (previousBodyStyle) {
        body.style.position = previousBodyStyle.position;
        body.style.top = previousBodyStyle.top;
        body.style.left = previousBodyStyle.left;
        body.style.right = previousBodyStyle.right;
        body.style.width = previousBodyStyle.width;
        body.style.overflow = previousBodyStyle.overflow;
      }
      window.scrollTo(0, modalScrollYRef.current);
    };
  }, [isCreateModalOpen, isEditModalOpen, loadingKey]);

  const resetCreateModalDrag = () => {
    setCreateModalDragY(0);
    setIsCreateModalDragging(false);
    createModalStartYRef.current = null;
    createModalCanDragRef.current = false;
  };

  const resetEditModalDrag = () => {
    setEditModalDragY(0);
    setIsEditModalDragging(false);
    editModalStartYRef.current = null;
    editModalCanDragRef.current = false;
  };

  const handleCreateModalTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isCreateModalOpen || isDesktopViewport || loadingKey === "create-user" || loadingKey === "add-existing-user") {
      return;
    }

    createModalCanDragRef.current = true;
    createModalStartYRef.current = event.touches[0]?.clientY ?? null;
    setCreateModalDragY(0);
    setIsCreateModalDragging(false);
  };

  const handleCreateModalTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktopViewport || !createModalCanDragRef.current || createModalStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") {
      return;
    }

    const deltaY = Math.max(0, currentY - createModalStartYRef.current);
    if (deltaY <= 0) {
      return;
    }

    setIsCreateModalDragging(true);
    setCreateModalDragY(deltaY);
    event.preventDefault();
  };

  const handleCreateModalTouchEnd = () => {
    if (isDesktopViewport) {
      return;
    }

    if (!createModalCanDragRef.current && createModalStartYRef.current === null) {
      return;
    }

    if (createModalDragY > 120) {
      closeCreateModal();
      return;
    }

    resetCreateModalDrag();
  };

  const handleEditModalTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isEditModalOpen || isDesktopViewport || loadingKey === "save-member" || loadingKey === "reset-password") {
      return;
    }

    editModalCanDragRef.current = true;
    editModalStartYRef.current = event.touches[0]?.clientY ?? null;
    setEditModalDragY(0);
    setIsEditModalDragging(false);
  };

  const handleEditModalTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktopViewport || !editModalCanDragRef.current || editModalStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") {
      return;
    }

    const deltaY = Math.max(0, currentY - editModalStartYRef.current);
    if (deltaY <= 0) {
      return;
    }

    setIsEditModalDragging(true);
    setEditModalDragY(deltaY);
    event.preventDefault();
  };

  const handleEditModalTouchEnd = () => {
    if (isDesktopViewport) {
      return;
    }

    if (!editModalCanDragRef.current && editModalStartYRef.current === null) {
      return;
    }

    if (editModalDragY > 120) {
      closeEditModal();
      return;
    }

    resetEditModalDrag();
  };

  const openCreateModal = () => {
    if (!canCreate) {
      return;
    }
    resetCreateModalDrag();
    setCreateErrorMessage(null);
    setExistingCandidatesError(null);
    setCreatedTemporaryPassword(null);
    setCreatedUserEmail("");
    setCreateMode("new");
    setFormRoleId(getDefaultRoleId(roles));
    setExistingRoleId(getDefaultRoleId(roles));
    setExistingQuery("");
    setExistingCandidates([]);
    setSelectedExistingUserId("");
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (loadingKey === "create-user" || loadingKey === "add-existing-user") {
      return;
    }
    resetCreateModalDrag();
    setIsCreateModalOpen(false);
    setCreateErrorMessage(null);
    setExistingCandidatesError(null);
    setCreatedTemporaryPassword(null);
    setCreatedUserEmail("");
  };

  const loadMemberBranchAccess = async (userId: string) => {
    setIsLoadingEditBranchAccess(true);
    const response = await authFetch(`/api/settings/users/${userId}`, {
      method: "GET",
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          branchAccess?: {
            mode?: "ALL" | "SELECTED";
            branchIds?: string[];
          };
        }
      | null;

    if (!response.ok) {
      setEditErrorMessage(data?.message ?? "โหลดสิทธิ์สาขาไม่สำเร็จ");
      setIsLoadingEditBranchAccess(false);
      return;
    }

    const mode = data?.branchAccess?.mode === "SELECTED" ? "SELECTED" : "ALL";
    const branchIds = normalizeBranchIds(data?.branchAccess?.branchIds ?? []);
    const normalizedBranchIds = mode === "SELECTED" ? branchIds : [];
    setEditBranchMode(mode);
    setEditBranchIds(normalizedBranchIds);
    setInitialEditBranchMode(mode);
    setInitialEditBranchIds(normalizedBranchIds);
    setIsLoadingEditBranchAccess(false);
  };

  const openEditModal = (member: MemberItem) => {
    resetEditModalDrag();
    setEditErrorMessage(null);
    setEditingMemberId(member.userId);
    setEditRoleId(member.roleId);
    setEditStatus(member.status);
    setEditSessionLimit(member.sessionLimit?.toString() ?? "");
    setEditBranchMode("ALL");
    setEditBranchIds([]);
    setInitialEditBranchMode("ALL");
    setInitialEditBranchIds([]);
    void loadMemberBranchAccess(member.userId);
    setIsResetPasswordConfirmOpen(false);
    setTemporaryPassword(null);
  };

  const closeEditModal = () => {
    if (loadingKey === "save-member" || loadingKey === "reset-password") {
      return;
    }
    resetEditModalDrag();
    setEditingMemberId(null);
    setEditErrorMessage(null);
    setIsLoadingEditBranchAccess(false);
    setEditBranchMode("ALL");
    setEditBranchIds([]);
    setInitialEditBranchMode("ALL");
    setInitialEditBranchIds([]);
    setIsResetPasswordConfirmOpen(false);
    setTemporaryPassword(null);
  };

  const loadExistingCandidates = async (query: string) => {
    setIsLoadingExistingCandidates(true);
    setExistingCandidatesError(null);

    const searchParams = new URLSearchParams();
    const normalizedQuery = query.trim();
    if (normalizedQuery) {
      searchParams.set("q", normalizedQuery);
    }
    const queryString = searchParams.toString();
    const endpoint = queryString
      ? `/api/settings/users/candidates?${queryString}`
      : "/api/settings/users/candidates";

    try {
      const response = await authFetch(endpoint, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
            candidates?: ExistingUserCandidate[];
          }
        | null;

      if (!response.ok) {
        setExistingCandidates([]);
        setExistingCandidatesError(data?.message ?? "โหลดรายชื่อผู้ใช้ที่เพิ่มได้ไม่สำเร็จ");
        return;
      }

      const nextCandidates = data?.candidates ?? [];
      setExistingCandidates(nextCandidates);
      setSelectedExistingUserId((current) =>
        nextCandidates.some((item) => item.userId === current) ? current : "",
      );
    } catch {
      setExistingCandidates([]);
      setExistingCandidatesError("โหลดรายชื่อผู้ใช้ที่เพิ่มได้ไม่สำเร็จ");
    } finally {
      setIsLoadingExistingCandidates(false);
    }
  };

  useEffect(() => {
    if (!isCreateModalOpen || createMode !== "existing" || !canLinkExisting) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadExistingCandidates(existingQuery);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isCreateModalOpen, createMode, canLinkExisting, existingQuery]);

  const copyTextToClipboard = async (text: string, successMessage: string) => {
    if (!text || typeof window === "undefined" || !window.navigator?.clipboard) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("คัดลอกรหัสชั่วคราวไม่สำเร็จ");
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) {
      return;
    }
    await copyTextToClipboard(temporaryPassword, "คัดลอกรหัสชั่วคราวแล้ว");
  };

  const copyCreatedTemporaryPassword = async () => {
    if (!createdTemporaryPassword) {
      return;
    }
    await copyTextToClipboard(createdTemporaryPassword, "คัดลอกรหัสผ่านเริ่มต้นแล้ว");
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

    if (!formName.trim() || !formEmail.trim()) {
      setCreateErrorMessage("กรุณากรอกชื่อและอีเมลให้ครบ");
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
        roleId: formRoleId,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          temporaryPassword?: string;
        }
      | null;

    if (!response.ok) {
      setCreateErrorMessage(data?.message ?? "เพิ่มผู้ใช้ไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (!data?.temporaryPassword) {
      setCreateErrorMessage("ไม่พบรหัสผ่านชั่วคราวจากระบบ");
      setLoadingKey(null);
      return;
    }

    setCreatedTemporaryPassword(data.temporaryPassword);
    setCreatedUserEmail(formEmail.trim().toLowerCase());
    setFormName("");
    setFormEmail("");
    toast.success("เพิ่มผู้ใช้เรียบร้อยแล้ว");
    setLoadingKey(null);
    router.refresh();
  };

  const addExistingUserToStore = async () => {
    if (!existingRoleId) {
      setCreateErrorMessage("กรุณาเลือกบทบาท");
      return;
    }

    if (!selectedExistingUserId) {
      setCreateErrorMessage("กรุณาเลือกผู้ใช้ที่ต้องการเพิ่ม");
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
        userId: selectedExistingUserId,
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

    setExistingQuery("");
    setExistingCandidates([]);
    setSelectedExistingUserId("");
    setExistingCandidatesError(null);
    resetCreateModalDrag();
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
    const nextBranchIds = editBranchMode === "SELECTED" ? normalizeBranchIds(editBranchIds) : [];
    const prevBranchIds =
      initialEditBranchMode === "SELECTED" ? normalizeBranchIds(initialEditBranchIds) : [];
    const branchModeDirty = editBranchMode !== initialEditBranchMode;
    const branchIdsDirty =
      editBranchMode === "SELECTED" &&
      (nextBranchIds.length !== prevBranchIds.length ||
        nextBranchIds.some((branchId, index) => branchId !== prevBranchIds[index]));
    const branchDirty = branchModeDirty || branchIdsDirty;
    const hasAnyChanges = roleDirty || statusDirty || sessionDirty || branchDirty;

    if (!hasAnyChanges) {
      toast.success("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
      return;
    }

    setLoadingKey("save-member");
    setEditErrorMessage(null);

    if (editBranchMode === "SELECTED" && nextBranchIds.length === 0) {
      setEditErrorMessage("กรุณาเลือกอย่างน้อย 1 สาขา หรือเปลี่ยนเป็นเข้าถึงทุกสาขา");
      setLoadingKey(null);
      return;
    }

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

      if (branchDirty) {
        await runPatch(
          {
            action: "set_branch_access",
            mode: editBranchMode,
            branchIds: editBranchMode === "SELECTED" ? nextBranchIds : [],
          },
          "บันทึกสิทธิ์เข้าถึงสาขาไม่สำเร็จ",
        );
      }

      resetEditModalDrag();
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

  const createModalBackdropOpacity = isCreateModalOpen
    ? Math.max(0, 1 - Math.min(createModalDragY / 220, 1) * 0.55)
    : 0;
  const editModalBackdropOpacity = isEditModalOpen
    ? Math.max(0, 1 - Math.min(editModalDragY / 220, 1) * 0.55)
    : 0;
  const createModalInlineStyle =
    isCreateModalOpen && !isDesktopViewport ? { transform: `translateY(${createModalDragY}px)` } : undefined;
  const editModalInlineStyle =
    isEditModalOpen && !isDesktopViewport ? { transform: `translateY(${editModalDragY}px)` } : undefined;
  const canSubmitNewUser = Boolean(formName.trim() && formEmail.trim() && formRoleId);
  const isCreateSubmitDisabled =
    !canCreate ||
    loadingKey !== null ||
    (createMode === "new"
      ? !canSubmitNewUser || Boolean(createdTemporaryPassword)
      : !existingRoleId || !selectedExistingUserId);

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
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200 ${isCreateModalOpen ? "opacity-100" : "opacity-0"}`}
          style={{ opacity: createModalBackdropOpacity }}
          onClick={closeCreateModal}
          disabled={loadingKey === "create-user" || loadingKey === "add-existing-user"}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[calc(100dvh-0.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(720px,calc(100dvh-2rem))] sm:w-full sm:max-w-md sm:rounded-2xl ${
            isCreateModalDragging && !isDesktopViewport
              ? "transition-none"
              : "transition-all duration-300 ease-out"
          } ${
            isCreateModalOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
          style={createModalInlineStyle}
        >
          <div
            className="flex touch-none justify-center pt-2 sm:hidden"
            onTouchStart={handleCreateModalTouchStart}
            onTouchMove={handleCreateModalTouchMove}
            onTouchEnd={handleCreateModalTouchEnd}
            onTouchCancel={handleCreateModalTouchEnd}
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
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
                  onClick={() => {
                    setCreateMode("new");
                    setCreateErrorMessage(null);
                    setCreatedTemporaryPassword(null);
                    setCreatedUserEmail("");
                  }}
                  disabled={loadingKey !== null}
                >
                  สร้างผู้ใช้ใหม่
                </button>
                <button
                  type="button"
                  className={`h-9 rounded-lg text-sm font-medium transition ${createMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  onClick={() => {
                    setCreateMode("existing");
                    setCreateErrorMessage(null);
                    setExistingCandidatesError(null);
                    setSelectedExistingUserId("");
                    setCreatedTemporaryPassword(null);
                    setCreatedUserEmail("");
                  }}
                  disabled={loadingKey !== null}
                >
                  เพิ่มผู้ใช้เดิม
                </button>
              </div>
            ) : null}

            {createMode === "new" ? (
              createdTemporaryPassword ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-medium text-emerald-700">สร้างสมาชิกสำเร็จ</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      ส่งรหัสชั่วคราวนี้ให้ผู้ใช้ {createdUserEmail ? `(${createdUserEmail})` : ""} และระบบจะบังคับเปลี่ยนรหัสเมื่อเข้าใช้งานครั้งแรก
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm font-semibold text-emerald-700">
                        {createdTemporaryPassword}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={copyCreatedTemporaryPassword}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        คัดลอก
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
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
                  <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    ระบบจะสร้างรหัสผ่านชั่วคราวอัตโนมัติ และบังคับผู้ใช้เปลี่ยนรหัสเมื่อเข้าสู่ระบบครั้งแรก
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  เพิ่มได้เฉพาะผู้ใช้ที่อยู่ในร้านภายใต้ SUPERADMIN เดียวกัน
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="existing-user-search">
                    ค้นหาผู้ใช้เดิม (ชื่อหรืออีเมล)
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="existing-user-search"
                      type="text"
                      value={existingQuery}
                      onChange={(event) => setExistingQuery(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-20 text-sm outline-none ring-primary transition focus:border-slate-300 focus:bg-white focus:ring-2"
                      disabled={!canCreate || loadingKey !== null}
                      placeholder="พิมพ์ชื่อหรืออีเมล เช่น somchai@email.com"
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                      {isLoadingExistingCandidates ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                      ) : null}
                      {existingQuery ? (
                        <button
                          type="button"
                          className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
                          onClick={() => setExistingQuery("")}
                          disabled={!canCreate || loadingKey !== null}
                          aria-label="ล้างคำค้นหา"
                        >
                          ล้าง
                        </button>
                      ) : null}
                    </div>
                  </div>
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

                {existingCandidatesError ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {existingCandidatesError}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs text-slate-500">รายชื่อผู้ใช้ที่เพิ่มได้</p>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {isLoadingExistingCandidates ? (
                      <div className="px-3 py-3 text-sm text-slate-500">กำลังโหลดรายชื่อผู้ใช้...</div>
                    ) : existingCandidates.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500">
                        ไม่พบผู้ใช้ที่เพิ่มได้ในร้านอื่นของ SUPERADMIN นี้
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {existingCandidates.map((candidate) => {
                          const selected = selectedExistingUserId === candidate.userId;
                          return (
                            <li key={candidate.userId}>
                              <button
                                type="button"
                                className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition ${
                                  selected ? "bg-blue-50" : "hover:bg-slate-50"
                                }`}
                                onClick={() => setSelectedExistingUserId(candidate.userId)}
                                disabled={loadingKey !== null}
                                aria-pressed={selected}
                              >
                                <span className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-slate-900">{candidate.name}</p>
                                  <p className="truncate text-xs text-slate-500">{candidate.email}</p>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                    อยู่ในร้าน: {candidate.sourceStores.join(", ")}
                                  </p>
                                </span>
                                {selected ? <Check className="h-4 w-4 shrink-0 self-center text-emerald-600" /> : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
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
            {createMode === "new" && createdTemporaryPassword ? (
              <div className={`${createErrorMessage ? "mt-3 " : ""}grid grid-cols-2 gap-2`}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => {
                    setCreatedTemporaryPassword(null);
                    setCreatedUserEmail("");
                    setCreateErrorMessage(null);
                    setFormRoleId(getDefaultRoleId(roles));
                  }}
                  disabled={loadingKey !== null}
                >
                  เพิ่มอีกคน
                </Button>
                <Button type="button" className="h-10 rounded-xl" onClick={closeCreateModal} disabled={loadingKey !== null}>
                  เสร็จสิ้น
                </Button>
              </div>
            ) : (
              <div className={`${createErrorMessage ? "mt-3 " : ""}grid grid-cols-2 gap-2`}>
                <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={closeCreateModal} disabled={loadingKey !== null}>
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-xl"
                  onClick={createMode === "new" ? createUser : addExistingUserToStore}
                  disabled={isCreateSubmitDisabled}
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
            )}
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-50 ${editingMember ? "" : "pointer-events-none"}`} aria-hidden={!editingMember}>
        <div
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200 ${editingMember ? "opacity-100" : "opacity-0"}`}
          style={{ opacity: editModalBackdropOpacity }}
          onClick={closeEditModal}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-auto w-full max-h-[calc(100dvh-0.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(760px,calc(100dvh-2rem))] sm:w-[min(720px,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl ${
            isEditModalDragging && !isDesktopViewport ? "transition-none" : "transition duration-200"
          } ${editingMember ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
          style={editModalInlineStyle}
        >
          {editingMember ? (
            <>
              <div
                className="flex touch-none justify-center pt-2 sm:hidden"
                onTouchStart={handleEditModalTouchStart}
                onTouchMove={handleEditModalTouchMove}
                onTouchEnd={handleEditModalTouchEnd}
                onTouchCancel={handleEditModalTouchEnd}
              >
                <span className="h-1.5 w-12 rounded-full bg-slate-300" />
              </div>
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

                  <article className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-xs text-slate-500">สิทธิ์เข้าถึงสาขา</p>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        className={`h-9 rounded-md text-xs font-medium transition ${
                          editBranchMode === "ALL"
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                        onClick={() => setEditBranchMode("ALL")}
                        disabled={!canUpdate || loadingKey !== null || isLoadingEditBranchAccess}
                      >
                        ทุกสาขา
                      </button>
                      <button
                        type="button"
                        className={`h-9 rounded-md text-xs font-medium transition ${
                          editBranchMode === "SELECTED"
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                        onClick={() => setEditBranchMode("SELECTED")}
                        disabled={!canUpdate || loadingKey !== null || isLoadingEditBranchAccess}
                      >
                        เลือกสาขา
                      </button>
                    </div>

                    {isLoadingEditBranchAccess ? (
                      <p className="text-xs text-slate-500">กำลังโหลดสิทธิ์สาขา...</p>
                    ) : editBranchMode === "SELECTED" ? (
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                        {branches.length === 0 ? (
                          <p className="text-xs text-slate-500">ยังไม่มีข้อมูลสาขาในร้านนี้</p>
                        ) : (
                          <ul className="space-y-1">
                            {branches.map((branch) => {
                              const selected = editBranchIds.includes(branch.id);
                              return (
                                <li key={branch.id}>
                                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(event) => {
                                        setEditBranchIds((current) => {
                                          if (event.target.checked) {
                                            return normalizeBranchIds([...current, branch.id]);
                                          }
                                          return current.filter((id) => id !== branch.id);
                                        });
                                      }}
                                      disabled={!canUpdate || loadingKey !== null}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-xs text-slate-700">
                                      {branch.name}
                                      {branch.code === "MAIN" ? " (MAIN)" : ""}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        ผู้ใช้คนนี้สามารถสลับและใช้งานได้ทุกสาขาในร้านนี้
                      </p>
                    )}
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
