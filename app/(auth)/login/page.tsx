import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/app/login-form";
import { getSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.hasStoreMembership ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-blue-600">SaaS POS</p>
        <h1 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบร้านค้า</h1>
        <p className="text-sm text-muted-foreground">
          กรอกข้อมูลเพื่อเริ่มใช้งานหน้าขาย
        </p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        ยังไม่มีบัญชี?{" "}
        <Link href="/signup" className="font-medium text-blue-700 hover:underline">
          สมัครสมาชิก
        </Link>
      </p>
    </div>
  );
}
