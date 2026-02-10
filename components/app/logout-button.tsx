"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    router.replace("/login");
    router.refresh();
  };

  return (
    <Button variant="outline" className="w-full" onClick={onLogout}>
      ออกจากระบบ
    </Button>
  );
}
