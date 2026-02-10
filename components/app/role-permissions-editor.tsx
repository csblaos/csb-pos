"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type PermissionRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
};

type RolePermissionEditorProps = {
  roleId: string;
  roleName: string;
  locked: boolean;
  canManage: boolean;
  permissions: PermissionRow[];
  assignedPermissionKeys: string[];
};

const actionColumns = ["view", "create", "update", "delete", "export", "approve"];

const moduleLabelMap: Record<string, string> = {
  dashboard: "แดชบอร์ด",
  orders: "คำสั่งซื้อ",
  products: "สินค้า",
  inventory: "สต็อก",
  contacts: "ลูกค้า",
  members: "สมาชิกทีม",
  reports: "รายงาน",
  settings: "ตั้งค่า",
  connections: "การเชื่อมต่อ",
  stores: "ข้อมูลร้าน",
  units: "หน่วยสินค้า",
  "rbac.roles": "บทบาท",
  "rbac.permissions": "สิทธิ์ระบบ",
};

export function RolePermissionsEditor({
  roleId,
  roleName,
  locked,
  canManage,
  permissions,
  assignedPermissionKeys,
}: RolePermissionEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(assignedPermissionKeys),
  );

  const permissionMap = useMemo(() => new Map(permissions.map((item) => [item.key, item])), [permissions]);

  const resources = useMemo(() => {
    const set = new Set<string>();
    for (const permission of permissions) {
      set.add(permission.resource);
    }

    return [...set].sort((a, b) => a.localeCompare(b));
  }, [permissions]);

  const togglePermission = (permissionKey: string) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(permissionKey)) {
        next.delete(permissionKey);
      } else {
        next.add(permissionKey);
      }

      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    setErrorMessage(null);

    const response = await fetch(`/api/settings/roles/${roleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        permissionKeys: [...selectedKeys],
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึกสิทธิ์ไม่สำเร็จ");
      setSaving(false);
      return;
    }

    setSuccessMessage("บันทึกสิทธิ์เรียบร้อยแล้ว");
    setSaving(false);
    router.refresh();
  };

  return (
    <section className="space-y-4">
      <article className="rounded-xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold">แก้ไขบทบาท: {roleName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เปิด-ปิดสิทธิ์ตามโมดูลและการกระทำ
        </p>

        {locked ? (
          <p className="mt-2 text-sm text-amber-700">
            บทบาท Owner ถูกล็อก ไม่สามารถแก้ไขสิทธิ์ได้
          </p>
        ) : null}
      </article>

      <article className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">โมดูล</th>
              {actionColumns.map((action) => (
                <th key={action} className="px-3 py-2 text-center uppercase">
                  {action}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => (
              <tr key={resource} className="border-t">
                <td className="px-3 py-3 font-medium">
                  {moduleLabelMap[resource] ?? resource}
                </td>
                {actionColumns.map((action) => {
                  const permissionKey = `${resource}.${action}`;
                  const permissionExists = permissionMap.has(permissionKey);

                  if (!permissionExists) {
                    return (
                      <td key={permissionKey} className="px-3 py-3 text-center text-slate-300">
                        -
                      </td>
                    );
                  }

                  return (
                    <td key={permissionKey} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(permissionKey)}
                        onChange={() => togglePermission(permissionKey)}
                        disabled={locked || !canManage || saving}
                        className="h-4 w-4"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <Button
        className="h-11 w-full"
        onClick={onSave}
        disabled={locked || !canManage || saving}
      >
        {saving ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
