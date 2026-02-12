import { SuperadminManagement } from "@/components/system-admin/superadmin-management";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import { listSuperadmins } from "@/lib/system-admin/superadmins";

export const dynamic = "force-dynamic";

export default async function SystemAdminClientsConfigPage() {
  const [superadmins, globalBranchDefaults] = await Promise.all([
    listSuperadmins(),
    getGlobalBranchPolicy(),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Manage Client</h1>
        <p className="text-sm text-muted-foreground">
          1 SUPERADMIN = 1 Client ที่สมัครใช้ระบบ POS
        </p>
      </header>

      <SuperadminManagement
        superadmins={superadmins}
        globalBranchDefaults={globalBranchDefaults}
      />
    </section>
  );
}
