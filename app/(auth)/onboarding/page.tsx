import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole === "SYSTEM_ADMIN") {
    redirect("/system-admin");
  }

  return (
    <OnboardingWizard
      hasStoreMembership={session.hasStoreMembership}
      activeStoreType={session.activeStoreType}
    />
  );
}
