import { redirect } from "next/navigation";

import { StorePdfSettings } from "@/components/app/store-pdf-settings";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import {
  getStoreFinancialConfigFromPostgres,
  getStorePdfConfigFromPostgres,
  getStoreProfileFromPostgres,
} from "@/lib/platform/postgres-store-settings";

export default async function SettingsPdfPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "settings.view");
  const canUpdate = isPermissionGranted(permissionKeys, "settings.update");

  if (!canView) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">ตั้งค่าเอกสาร PDF</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
      </section>
    );
  }

  const [storeProfile, storeFinancial, pdfConfig] = await Promise.all([
    getStoreProfileFromPostgres(session.activeStoreId),
    getStoreFinancialConfigFromPostgres(session.activeStoreId),
    getStorePdfConfigFromPostgres(session.activeStoreId),
  ]);

  const initialConfig = {
    pdfShowLogo: pdfConfig?.pdfShowLogo ?? true,
    pdfShowSignature: pdfConfig?.pdfShowSignature ?? true,
    pdfShowNote: pdfConfig?.pdfShowNote ?? true,
    pdfHeaderColor: pdfConfig?.pdfHeaderColor ?? "#f1f5f9",
    pdfCompanyName: pdfConfig?.pdfCompanyName ?? null,
    pdfCompanyAddress: pdfConfig?.pdfCompanyAddress ?? null,
    pdfCompanyPhone: pdfConfig?.pdfCompanyPhone ?? null,
  };

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">ตั้งค่าเอกสาร PDF</h1>
        <p className="text-sm text-muted-foreground">
          ปรับแต่ง Logo, ลายเซ็น, สีหัวตาราง และข้อมูลบริษัทที่แสดงบน PDF
        </p>
      </header>

      <StorePdfSettings
        initialConfig={initialConfig}
        storeLogoUrl={storeProfile?.logoUrl ?? null}
        storeCurrency={storeFinancial?.currency ?? "LAK"}
        canUpdate={canUpdate}
      />
    </section>
  );
}
