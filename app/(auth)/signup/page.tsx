import { redirect } from "next/navigation";

import { SignupForm } from "@/components/app/signup-form";
import { getSession } from "@/lib/auth/session";

export default async function SignupPage() {
  const session = await getSession();
  if (session) {
    redirect(session.hasStoreMembership ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-blue-600">SaaS POS</p>
        <h1 className="text-2xl font-semibold tracking-tight">สมัครสมาชิก</h1>
        <p className="text-sm text-muted-foreground">
          สร้างบัญชีเพื่อเริ่มตั้งค่าร้านค้า
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
