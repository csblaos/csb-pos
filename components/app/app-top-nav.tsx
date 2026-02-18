"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";

import { MenuBackButton } from "@/components/ui/menu-back-button";

type AppTopNavProps = {
  activeStoreName: string;
  activeStoreLogoUrl: string | null;
  activeBranchName: string | null;
  shellTitle: string;
};

const navRoots = [
  "/dashboard",
  "/orders",
  "/stock",
  "/products",
  "/settings",
  "/stores",
  "/reports",
];

const isInRoot = (pathname: string, root: string) =>
  pathname === root || pathname.startsWith(`${root}/`);

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const getFullscreenElement = () => {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
};

function StoreSwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 10l1.2-4.2A1.5 1.5 0 0 1 5.64 4.7h12.72a1.5 1.5 0 0 1 1.44 1.08L21 10" />
      <path d="M4 10h16v7.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V10Z" />
      <path d="M9 14h6" />
      <path d="M17.6 6.4h2.9" />
      <path d="m19.2 4.8 1.3 1.6-1.3 1.6" />
    </svg>
  );
}

function getStoreInitial(storeName: string) {
  const normalizedName = storeName.trim();
  if (!normalizedName) {
    return "S";
  }

  return normalizedName.slice(0, 1).toUpperCase();
}

export function AppTopNav({
  activeStoreName,
  activeStoreLogoUrl,
  activeBranchName,
  shellTitle,
}: AppTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canUseFullscreen, setCanUseFullscreen] = useState(false);

  const activeRoot = useMemo(() => {
    const sortedRoots = [...navRoots].sort((a, b) => b.length - a.length);
    return sortedRoots.find((root) => isInRoot(pathname, root)) ?? null;
  }, [pathname]);

  const showBackButton = Boolean(activeRoot && pathname !== activeRoot);
  const showStoreIdentity = !showBackButton;
  const storeInitial = getStoreInitial(activeStoreName);
  const backHref = useMemo(() => {
    if (pathname.startsWith("/settings/superadmin/")) {
      return "/settings/superadmin";
    }

    if (pathname === "/settings/stores") {
      return "/settings";
    }

    if (pathname.startsWith("/settings/roles/")) {
      return "/settings/roles";
    }

    return undefined;
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/settings/superadmin/")) {
      return;
    }

    router.prefetch("/settings/superadmin");
  }, [pathname, router]);

  useEffect(() => {
    const fullscreenDocument = document as FullscreenDocument;
    const rootElement = document.documentElement as FullscreenElement;

    setCanUseFullscreen(
      Boolean(
        document.fullscreenEnabled ||
          fullscreenDocument.webkitFullscreenEnabled ||
          rootElement.requestFullscreen ||
          rootElement.webkitRequestFullscreen,
      ),
    );

    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(getFullscreenElement()));
    };

    syncFullscreenState();

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
    };
  }, []);

  const toggleFullscreen = async () => {
    const fullscreenDocument = document as FullscreenDocument;
    const rootElement = document.documentElement as FullscreenElement;

    try {
      if (getFullscreenElement()) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (fullscreenDocument.webkitExitFullscreen) {
          await fullscreenDocument.webkitExitFullscreen();
        }
      } else if (rootElement.requestFullscreen) {
        await rootElement.requestFullscreen();
      } else if (rootElement.webkitRequestFullscreen) {
        await rootElement.webkitRequestFullscreen();
      }
    } catch {
      // Ignore browser-level fullscreen errors to avoid noisy UI state.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <MenuBackButton
          roots={navRoots}
          backHref={backHref}
          className="-ml-1 shrink-0"
          showLabelOnMobile
        />
        {showStoreIdentity ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
              {activeStoreLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeStoreLogoUrl}
                  alt={`โลโก้ร้าน ${activeStoreName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                  {storeInitial}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold leading-tight text-slate-900">
                {activeStoreName}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {shellTitle}
                {activeBranchName ? ` · ${activeBranchName}` : ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggleFullscreen}
          disabled={!canUseFullscreen}
          title={isFullscreen ? "ออกจากโหมดเต็มจอ" : "เข้าโหมดเต็มจอ"}
          aria-label={isFullscreen ? "ออกจากโหมดเต็มจอ" : "เข้าโหมดเต็มจอ"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:w-9"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <Link
          href="/settings/stores"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98]"
        >
          <StoreSwitchIcon className="h-3.5 w-3.5" />
          <span>เปลี่ยนร้าน</span>
        </Link>
      </div>
    </div>
  );
}
