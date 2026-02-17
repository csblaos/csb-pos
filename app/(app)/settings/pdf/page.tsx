import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { StorePdfSettings } from "@/components/app/store-pdf-settings";
import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

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

  const [store] = await db
    .select({
      logoUrl: stores.logoUrl,
      currency: stores.currency,
      pdfShowLogo: stores.pdfShowLogo,
      pdfShowSignature: stores.pdfShowSignature,
      pdfShowNote: stores.pdfShowNote,
      pdfHeaderColor: stores.pdfHeaderColor,
      pdfCompanyName: stores.pdfCompanyName,
      pdfCompanyAddress: stores.pdfCompanyAddress,
      pdfCompanyPhone: stores.pdfCompanyPhone,
    })
    .from(stores)
    .where(eq(stores.id, session.activeStoreId))
    .limit(1);

  const initialConfig = {
    pdfShowLogo: store?.pdfShowLogo ?? true,
    pdfShowSignature: store?.pdfShowSignature ?? true,
    pdfShowNote: store?.pdfShowNote ?? true,
    pdfHeaderColor: store?.pdfHeaderColor ?? "#f1f5f9",
    pdfCompanyName: store?.pdfCompanyName ?? null,
    pdfCompanyAddress: store?.pdfCompanyAddress ?? null,
    pdfCompanyPhone: store?.pdfCompanyPhone ?? null,
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
        storeLogoUrl={store?.logoUrl ?? null}
        storeCurrency={store?.currency ?? "LAK"}
        canUpdate={canUpdate}
      />
    </section>
  );
}
