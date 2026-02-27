"use client";

import { useRouter } from "next/navigation";
import { Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authFetch, clearClientAuthToken } from "@/lib/auth/client-token";
import { clearPurchaseLocalStorage } from "@/lib/purchases/client-storage";

export function SystemAdminLogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    try {
      await authFetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      clearClientAuthToken();
      clearPurchaseLocalStorage();
    }

    router.replace("/login");
    router.refresh();
  };

  return (
    <Button
      variant="outline"
      className="h-9 w-9 p-0"
      onClick={onLogout}
      aria-label="ออกจากระบบ"
    >
      <Power className="h-4 w-4" />
      <span className="sr-only">ออกจากระบบ</span>
    </Button>
  );
}
