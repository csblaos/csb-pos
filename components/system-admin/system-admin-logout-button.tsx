"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authFetch, clearClientAuthToken } from "@/lib/auth/client-token";

export function SystemAdminLogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    try {
      await authFetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      clearClientAuthToken();
    }

    router.replace("/login");
    router.refresh();
  };

  return (
    <Button variant="outline" className="h-9" onClick={onLogout}>
      ออกจากระบบ
    </Button>
  );
}
