import { SystemBranchPolicyConfig } from "@/components/system-admin/system-branch-policy-config";
import { SystemSessionPolicyConfig } from "@/components/system-admin/system-session-policy-config";
import { SystemStoreLogoPolicyConfig } from "@/components/system-admin/system-store-logo-policy-config";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import { getGlobalSessionPolicy, getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";

export default async function SystemAdminSystemConfigPage() {
  const [branchPolicy, sessionPolicy, storeLogoPolicy] = await Promise.all([
    getGlobalBranchPolicy(),
    getGlobalSessionPolicy(),
    getGlobalStoreLogoPolicy(),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">System Config</h1>
        <p className="text-sm text-muted-foreground">
          ตั้งค่านโยบายกลางของแพลตฟอร์ม และค่าเริ่มต้นสำหรับแต่ละ SUPERADMIN
        </p>
      </header>

      <SystemBranchPolicyConfig initialConfig={branchPolicy} />
      <SystemSessionPolicyConfig initialConfig={sessionPolicy} />
      <SystemStoreLogoPolicyConfig initialConfig={storeLogoPolicy} />
    </section>
  );
}
