"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MenuBackButtonProps = {
  roots: string[];
  className?: string;
  label?: string;
  showLabelOnMobile?: boolean;
  keepSpaceWhenHidden?: boolean;
  backHref?: string;
};

const isInRoot = (pathname: string, root: string) =>
  pathname === root || pathname.startsWith(`${root}/`);

export function MenuBackButton({
  roots,
  className,
  label = "ย้อนกลับ",
  showLabelOnMobile = false,
  keepSpaceWhenHidden = false,
  backHref,
}: MenuBackButtonProps) {
  const pathname = usePathname();
  const router = useRouter();

  const activeRoot = useMemo(() => {
    const sortedRoots = [...roots].sort((a, b) => b.length - a.length);
    return sortedRoots.find((root) => isInRoot(pathname, root)) ?? null;
  }, [pathname, roots]);

  const targetHref = backHref ?? activeRoot;

  useEffect(() => {
    if (!targetHref) {
      return;
    }

    router.prefetch(targetHref);
  }, [router, targetHref]);

  if (!targetHref || pathname === targetHref) {
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
      className={cn(
        showLabelOnMobile
          ? "h-9 min-w-9 gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98]"
          : "h-9 w-9 rounded-full border border-slate-200 bg-white p-0 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98] sm:h-9 sm:w-auto sm:min-w-9 sm:gap-1.5 sm:px-2.5",
        className,
      )}
      onMouseEnter={() => router.prefetch(targetHref)}
      onTouchStart={() => router.prefetch(targetHref)}
      onClick={() => router.push(targetHref)}
    >
      <ArrowLeft className="h-4 w-4" />
      {showLabelOnMobile ? (
        <span className="text-xs font-semibold">{label}</span>
      ) : (
        <>
          <span className="hidden text-xs font-semibold sm:inline">{label}</span>
          <span className="sr-only sm:hidden">{label}</span>
        </>
      )}
    </Button>
  );
}
