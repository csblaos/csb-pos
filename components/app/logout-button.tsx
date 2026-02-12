"use client";

import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch, clearClientAuthToken } from "@/lib/auth/client-token";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const onLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await authFetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      clearClientAuthToken();
      setIsLoggingOut(false);
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full justify-center gap-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 hover:text-red-800"
      onClick={onLogout}
      aria-label="ออกจากระบบ"
      disabled={isLoggingOut}
    >
      {isLoggingOut ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      <span>{isLoggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}</span>
    </Button>
  );
}
