"use client";

import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MenuBackButtonProps = {
  roots: string[];
  className?: string;
  label?: string;
  showLabelOnMobile?: boolean;
  keepSpaceWhenHidden?: boolean;
};

const isInRoot = (pathname: string, root: string) =>
  pathname === root || pathname.startsWith(`${root}/`);

export function MenuBackButton({
  roots,
  className,
  label = "ย้อนกลับ",
  showLabelOnMobile = false,
  keepSpaceWhenHidden = false,
}: MenuBackButtonProps) {
  const pathname = usePathname();
  const router = useRouter();

  const activeRoot = useMemo(() => {
    const sortedRoots = [...roots].sort((a, b) => b.length - a.length);
    return sortedRoots.find((root) => isInRoot(pathname, root)) ?? null;
  }, [pathname, roots]);

  if (!activeRoot || pathname === activeRoot) {
    if (keepSpaceWhenHidden) {
      return <span aria-hidden className={cn("inline-flex h-9 w-20", className)} />;
    }
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-9 px-2", className)}
      onClick={() => router.push(activeRoot)}
    >
      <ArrowLeft className="h-4 w-4" />
      {showLabelOnMobile ? (
        <span>{label}</span>
      ) : (
        <>
          <span className="hidden sm:inline">{label}</span>
          <span className="sr-only sm:hidden">{label}</span>
        </>
      )}
    </Button>
  );
}
