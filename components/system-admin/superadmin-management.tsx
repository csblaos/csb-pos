"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type SuperadminItem = {
  userId: string;
  email: string;
  name: string;
  canCreateStores: boolean;
  maxStores: number | null;
  activeOwnerStoreCount: number;
  createdAt: string;
};

type SuperadminManagementProps = {
  superadmins: SuperadminItem[];
};

export function SuperadminManagement({ superadmins }: SuperadminManagementProps) {
  const router = useRouter();

  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formCanCreateStores, setFormCanCreateStores] = useState(true);
  const [formMaxStores, setFormMaxStores] = useState("1");

  const [draftCanCreateMap, setDraftCanCreateMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(superadmins.map((item) => [item.userId, item.canCreateStores])),
  );
  const [draftMaxStoresMap, setDraftMaxStoresMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      superadmins.map((item) => [item.userId, item.maxStores ? String(item.maxStores) : ""]),
    ),
  );

  const refreshPage = () => {
    router.refresh();
  };

  const handleError = (message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
  };

  const handleSuccess = (message: string) => {
    setErrorMessage(null);
    setSuccessMessage(message);
  };

  const parseMaxStores = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return Number.NaN;
    }

    return parsed;
  };

  const createSuperadmin = async () => {
    const parsedMaxStores = parseMaxStores(formMaxStores);
    if (Number.isNaN(parsedMaxStores)) {
      handleError("โควตาร้านต้องเป็นตัวเลข 1-100 หรือเว้นว่างเพื่อไม่จำกัด");
      return;
    }

    setLoadingKey("create-superadmin");
    setErrorMessage(null);

    const response = await authFetch("/api/system-admin/superadmins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: formName,
        email: formEmail,
        password: formPassword,
        canCreateStores: formCanCreateStores,
        maxStores: formCanCreateStores ? parsedMaxStores : null,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      handleError(data?.message ?? "สร้างบัญชี SUPERADMIN ไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormCanCreateStores(true);
    setFormMaxStores("1");

    handleSuccess("สร้างบัญชี SUPERADMIN เรียบร้อยแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  const updateStoreCreationConfig = async (userId: string) => {
    const canCreateStores = Boolean(draftCanCreateMap[userId]);
    const parsedMaxStores = parseMaxStores(draftMaxStoresMap[userId] ?? "");
    if (Number.isNaN(parsedMaxStores)) {
      handleError("โควตาร้านต้องเป็นตัวเลข 1-100 หรือเว้นว่างเพื่อไม่จำกัด");
      return;
    }

    setLoadingKey(`update-${userId}`);
    setErrorMessage(null);

    const response = await authFetch(`/api/system-admin/superadmins/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "set_store_creation_config",
        canCreateStores,
        maxStores: canCreateStores ? parsedMaxStores : null,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      handleError(data?.message ?? "บันทึกโควตาสร้างร้านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    handleSuccess("อัปเดตโควตาสร้างร้านแล้ว");
    setLoadingKey(null);
    refreshPage();
  };

  return (
    <section className="space-y-5">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สร้างบัญชี SUPERADMIN</h2>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="superadmin-name">
            ชื่อผู้ดูแลลูกค้า
          </label>
          <input
            id="superadmin-name"
            value={formName}
            onChange={(event) => setFormName(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loadingKey !== null}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="superadmin-email">
            อีเมล
          </label>
          <input
            id="superadmin-email"
            type="email"
            value={formEmail}
            onChange={(event) => setFormEmail(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loadingKey !== null}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="superadmin-password">
            รหัสผ่านเริ่มต้น
          </label>
          <input
            id="superadmin-password"
            type="password"
            value={formPassword}
            onChange={(event) => setFormPassword(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loadingKey !== null}
          />
        </div>

        <label className="flex items-center justify-between gap-2 rounded-md border border-dashed p-3 text-sm">
          <span>อนุญาตให้สร้างร้าน</span>
          <input
            type="checkbox"
            checked={formCanCreateStores}
            onChange={(event) => setFormCanCreateStores(event.target.checked)}
            disabled={loadingKey !== null}
          />
        </label>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="superadmin-max-stores">
            โควตาร้าน (ว่าง = ไม่จำกัด)
          </label>
          <input
            id="superadmin-max-stores"
            type="number"
            min={1}
            max={100}
            value={formMaxStores}
            onChange={(event) => setFormMaxStores(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loadingKey !== null || !formCanCreateStores}
          />
        </div>

        <Button className="h-10 w-full" onClick={createSuperadmin} disabled={loadingKey !== null}>
          {loadingKey === "create-superadmin" ? "กำลังสร้าง..." : "สร้างบัญชี SUPERADMIN"}
        </Button>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">SUPERADMIN ทั้งหมด</h2>

        <div className="space-y-3">
          {superadmins.map((item) => (
            <div key={item.userId} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ร้านที่เป็น Owner อยู่: {item.activeOwnerStoreCount}
              </p>

              <div className="mt-3 space-y-2">
                <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>อนุญาตให้สร้างร้าน</span>
                  <input
                    type="checkbox"
                    checked={Boolean(draftCanCreateMap[item.userId])}
                    onChange={(event) =>
                      setDraftCanCreateMap((previous) => ({
                        ...previous,
                        [item.userId]: event.target.checked,
                      }))
                    }
                    disabled={loadingKey !== null}
                  />
                </label>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draftMaxStoresMap[item.userId] ?? ""}
                    onChange={(event) =>
                      setDraftMaxStoresMap((previous) => ({
                        ...previous,
                        [item.userId]: event.target.value,
                      }))
                    }
                    placeholder="โควตาร้าน (ว่าง = ไม่จำกัด)"
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loadingKey !== null || !Boolean(draftCanCreateMap[item.userId])}
                  />

                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => updateStoreCreationConfig(item.userId)}
                    disabled={loadingKey !== null}
                  >
                    {loadingKey === `update-${item.userId}` ? "กำลังบันทึก..." : "บันทึก"}
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {superadmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีบัญชี SUPERADMIN</p>
          ) : null}
        </div>
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
