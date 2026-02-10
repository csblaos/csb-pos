import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { getSession } from "@/lib/auth/session";

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <OnboardingWizard hasStoreMembership={session.hasStoreMembership} />;
}
