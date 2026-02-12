"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type MemberItem = {
  userId: string;
  email: string;
  name: string;
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
  sessionLimit: number | null;
  roleId: string;
  roleName: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  joinedAt: string;
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
};

const statusLabel: Record<MemberItem["status"], string> = {
  ACTIVE: "ใช้งาน",
  INVITED: "รอเปิดใช้งาน",
  SUSPENDED: "ระงับ",
};

export function UsersManagement({
  members,
  roles,
  canCreate,
  canUpdate,
  canLinkExisting,
}: UsersManagementProps) {
  const router = useRouter();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoleId, setFormRoleId] = useState<string>(roles[0]?.id ?? "");
  const [existingEmail, setExistingEmail] = useState("");
  const [existingRoleId, setExistingRoleId] = useState<string>(roles[0]?.id ?? "");

  const [draftRoleMap, setDraftRoleMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((member) => [member.userId, member.roleId])),
  );
  const [draftSessionLimitMap, setDraftSessionLimitMap] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        members.map((member) => [member.userId, member.sessionLimit?.toString() ?? ""]),
      ),
  );

  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);

  const handleError = (message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
  };

  const handleSuccess = (message: string) => {
    setErrorMessage(null);
    setSuccessMessage(message);
  };

  const refreshPage = () => {
    router.refresh();
  };

  const createUser = async () => {
    if (!formRoleId) {
      handleError("กรุณาเลือกบทบาท");
      return;
    }

    setLoadingKey("create-user");
    setErrorMessage(null);

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
      handleError(data?.message ?? "เพิ่มผู้ใช้ไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setFormName("");
    setFormEmail("");
    setFormPassword("");
    handleSuccess("เพิ่มผู้ใช้เรียบร้อยแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  const addExistingUserToStore = async () => {
    if (!existingRoleId) {
      handleError("กรุณาเลือกบทบาท");
      return;
    }

    if (!existingEmail.trim()) {
      handleError("กรุณากรอกอีเมลผู้ใช้เดิม");
      return;
    }

    setLoadingKey("add-existing-user");
    setErrorMessage(null);

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
      handleError(data?.message ?? "เพิ่มผู้ใช้เดิมเข้าร้านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setExistingEmail("");
    handleSuccess("เพิ่มผู้ใช้เดิมเข้าร้านเรียบร้อยแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  const updateRole = async (userId: string) => {
    const roleId = draftRoleMap[userId];
    if (!roleId) {
      handleError("กรุณาเลือกบทบาท");
      return;
    }

    setLoadingKey(`role-${userId}`);
    setErrorMessage(null);

    const response = await authFetch(`/api/settings/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "assign_role",
        roleId,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      handleError(data?.message ?? "เปลี่ยนบทบาทไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    handleSuccess("อัปเดตบทบาทแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  const toggleStatus = async (member: MemberItem) => {
    const nextStatus = member.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";

    setLoadingKey(`status-${member.userId}`);
    setErrorMessage(null);

    const response = await authFetch(`/api/settings/users/${member.userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "set_status",
        status: nextStatus,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      handleError(data?.message ?? "เปลี่ยนสถานะไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    handleSuccess("อัปเดตสถานะแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  const updateSessionLimit = async (userId: string) => {
    const rawValue = (draftSessionLimitMap[userId] ?? "").trim();
    let sessionLimit: number | null = null;

    if (rawValue.length > 0) {
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
        handleError("จำนวนอุปกรณ์ต้องเป็นตัวเลข 1-10 หรือเว้นว่างเพื่อใช้ค่าเริ่มต้นระบบ");
        return;
      }
      sessionLimit = parsed;
    }

    setLoadingKey(`session-limit-${userId}`);
    setErrorMessage(null);

    const response = await authFetch(`/api/settings/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "set_session_limit",
        sessionLimit,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      handleError(data?.message ?? "บันทึกจำนวนอุปกรณ์ไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    handleSuccess("อัปเดตจำนวนอุปกรณ์เข้าสู่ระบบแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สร้างผู้ใช้ใหม่ในร้าน</h2>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="new-user-name">
            ชื่อผู้ใช้
          </label>
          <input
            id="new-user-name"
            value={formName}
            onChange={(event) => setFormName(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={!canCreate || loadingKey !== null}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="new-user-email">
            อีเมล
          </label>
          <input
            id="new-user-email"
            type="email"
            value={formEmail}
            onChange={(event) => setFormEmail(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={!canCreate || loadingKey !== null}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="new-user-password">
            รหัสผ่านเริ่มต้น
          </label>
          <input
            id="new-user-password"
            type="password"
            value={formPassword}
            onChange={(event) => setFormPassword(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={!canCreate || loadingKey !== null}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="new-user-role">
            บทบาท
          </label>
          <select
            id="new-user-role"
            value={formRoleId}
            onChange={(event) => setFormRoleId(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={!canCreate || loadingKey !== null}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>

        <Button
          className="h-10 w-full"
          onClick={createUser}
          disabled={!canCreate || loadingKey !== null}
        >
          {loadingKey === "create-user" ? "กำลังเพิ่มผู้ใช้..." : "เพิ่มผู้ใช้"}
        </Button>
      </article>

      {canLinkExisting ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">เพิ่มผู้ใช้เดิมเข้าร้านนี้</h2>
          <p className="text-xs text-muted-foreground">
            ใช้เมื่อผู้ใช้นี้มีบัญชีอยู่แล้วในระบบ และต้องการให้เข้าได้อีกสาขา/อีกร้าน
          </p>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="existing-user-email">
              อีเมลผู้ใช้เดิม
            </label>
            <input
              id="existing-user-email"
              type="email"
              value={existingEmail}
              onChange={(event) => setExistingEmail(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={!canCreate || loadingKey !== null}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="existing-user-role">
              บทบาทในร้านนี้
            </label>
            <select
              id="existing-user-role"
              value={existingRoleId}
              onChange={(event) => setExistingRoleId(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={!canCreate || loadingKey !== null}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            className="h-10 w-full"
            onClick={addExistingUserToStore}
            disabled={!canCreate || loadingKey !== null}
          >
            {loadingKey === "add-existing-user"
              ? "กำลังเพิ่มผู้ใช้เดิม..."
              : "เพิ่มผู้ใช้เดิมเข้าร้าน"}
          </Button>
        </article>
      ) : null}

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">ผู้ใช้ในร้าน</h2>

        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.userId} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                สถานะ: {statusLabel[member.status]}
              </p>

              <div className="mt-3 space-y-2">
                <select
                  value={draftRoleMap[member.userId] ?? member.roleId}
                  onChange={(event) =>
                    setDraftRoleMap((previous) => ({
                      ...previous,
                      [member.userId]: event.target.value,
                    }))
                  }
                  className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={!canUpdate || loadingKey !== null}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => updateRole(member.userId)}
                    disabled={!canUpdate || loadingKey !== null}
                  >
                    {loadingKey === `role-${member.userId}`
                      ? "กำลังบันทึก..."
                      : "บันทึกบทบาท"}
                  </Button>

                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => toggleStatus(member)}
                    disabled={!canUpdate || loadingKey !== null}
                  >
                    {loadingKey === `status-${member.userId}`
                      ? "กำลังอัปเดต..."
                      : member.status === "SUSPENDED"
                        ? "เปิดใช้งาน"
                        : "ปิดใช้งาน"}
                  </Button>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={draftSessionLimitMap[member.userId] ?? ""}
                    onChange={(event) =>
                      setDraftSessionLimitMap((previous) => ({
                        ...previous,
                        [member.userId]: event.target.value,
                      }))
                    }
                    placeholder="อุปกรณ์สูงสุด (ว่าง = ค่าเริ่มต้นระบบ)"
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={!canUpdate || loadingKey !== null}
                  />

                  <Button
                    variant="outline"
                    className="h-9 px-3"
                    onClick={() => updateSessionLimit(member.userId)}
                    disabled={!canUpdate || loadingKey !== null}
                  >
                    {loadingKey === `session-limit-${member.userId}`
                      ? "กำลังบันทึก..."
                      : "บันทึก"}
                  </Button>
                </div>

              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                บทบาทปัจจุบัน: {rolesById.get(member.roleId)?.name ?? member.roleName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                จำกัดอุปกรณ์: {member.sessionLimit ?? "ค่าเริ่มต้นระบบ"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                สิทธิ์ระบบ: {member.systemRole}
              </p>
            </div>
          ))}
        </div>
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
