import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";

export default async function SettingsSuperadminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole !== "SUPERADMIN") {
    redirect("/settings");
  }

  return children;
}
