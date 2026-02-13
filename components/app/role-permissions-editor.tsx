"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

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

const actionColumns = ["view", "create", "update", "delete", "export", "approve"] as const;
const actionLabelMap: Record<(typeof actionColumns)[number], string> = {
  view: "ดู",
  create: "สร้าง",
  update: "แก้ไข",
  delete: "ลบ",
  export: "ส่งออก",
  approve: "อนุมัติ",
};

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

function isSameSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

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
  const saveSectionRef = useRef<HTMLDivElement | null>(null);
  const [isSaveSectionVisible, setIsSaveSectionVisible] = useState(true);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(assignedPermissionKeys),
  );
  const [savedKeys, setSavedKeys] = useState<Set<string>>(
    () => new Set(assignedPermissionKeys),
  );

  const permissionMap = useMemo(() => new Map(permissions.map((item) => [item.key, item])), [permissions]);
  const hasUnsavedChanges = useMemo(
    () => !isSameSet(selectedKeys, savedKeys),
    [selectedKeys, savedKeys],
  );
  const showFloatingScrollButton = hasUnsavedChanges && !isSaveSectionVisible;

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

  const scrollToSave = () => {
    saveSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    const element = saveSectionRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSaveSectionVisible(entry.isIntersecting);
      },
      { threshold: 0.25 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
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
        return;
      }

      setSavedKeys(new Set(selectedKeys));
      toast.success("บันทึกสิทธิ์เรียบร้อยแล้ว");
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 pb-4 sm:pb-20">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">แก้ไขบทบาท: {roleName}</h1>
            <p className="mt-1 text-sm text-slate-500">เปิดหรือปิดสิทธิ์ของแต่ละโมดูลตามการใช้งานจริง</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                hasUnsavedChanges
                  ? "border border-amber-200 bg-amber-50 text-amber-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {hasUnsavedChanges ? "ยังไม่บันทึก" : "บันทึกแล้ว"}
            </span>
          </div>
        </div>

        {locked ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            บทบาท Owner ถูกล็อก ไม่สามารถแก้ไขสิทธิ์ได้
          </p>
        ) : null}
      </article>

      <article className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">โมดูล</th>
              {actionColumns.map((action) => (
                <th key={action} className="px-3 py-2 text-center uppercase">
                  {actionLabelMap[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => (
              <tr key={resource} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-3 font-medium text-slate-900">
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
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <div className="space-y-3 sm:hidden">
        {resources.map((resource) => (
          <article
            key={resource}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-slate-900">{moduleLabelMap[resource] ?? resource}</h2>
            <div className="grid grid-cols-2 gap-2">
              {actionColumns.map((action) => {
                const permissionKey = `${resource}.${action}`;
                const permissionExists = permissionMap.has(permissionKey);

                if (!permissionExists) {
                  return (
                    <div
                      key={permissionKey}
                      className="flex h-10 items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs text-slate-400"
                    >
                      <span>{actionLabelMap[action]}</span>
                      <span>-</span>
                    </div>
                  );
                }

                return (
                  <label
                    key={permissionKey}
                    className="flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-3"
                  >
                    <span className="text-xs font-medium text-slate-700">{actionLabelMap[action]}</span>
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(permissionKey)}
                      onChange={() => togglePermission(permissionKey)}
                      disabled={locked || !canManage || saving}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                  </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      <div ref={saveSectionRef} className="sm:sticky sm:bottom-3 sm:z-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:bg-white/95 sm:shadow-lg sm:backdrop-blur">
          <div className="mb-2 text-xs text-slate-500">
            เลือกแล้ว {selectedKeys.size.toLocaleString("th-TH")} สิทธิ์
          </div>
          <Button
            className="h-11 w-full rounded-xl"
            onClick={onSave}
            disabled={locked || !canManage || saving || !hasUnsavedChanges}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              "บันทึกสิทธิ์"
            )}
          </Button>
        </div>
      </div>

      {showFloatingScrollButton ? (
        <Button
          type="button"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-30 h-10 rounded-full px-4 shadow-lg sm:bottom-6"
          onClick={scrollToSave}
        >
          ไปปุ่มบันทึก
        </Button>
      ) : null}
    </section>
  );
}
