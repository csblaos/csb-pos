"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Bell, Maximize2, Minimize2, RefreshCw } from "lucide-react";

import { MenuBackButton } from "@/components/ui/menu-back-button";
import { authFetch } from "@/lib/auth/client-token";

type AppTopNavProps = {
  activeStoreName: string;
  activeStoreLogoUrl: string | null;
  activeBranchName: string | null;
  shellTitle: string;
  canViewNotifications: boolean;
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

const allowFullscreenOnTouch = process.env.NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH === "true";
const emptyNotificationSummary = {
  unreadCount: 0,
  activeCount: 0,
  resolvedCount: 0,
} as const;

type TopNavNotificationItem = {
  id: string;
  title: string;
  message: string;
  status: "UNREAD" | "READ" | "RESOLVED";
  dueStatus: "OVERDUE" | "DUE_SOON" | null;
  dueDate: string | null;
  lastDetectedAt: string;
  payload: Record<string, unknown>;
};

type TopNavNotificationSummary = {
  unreadCount: number;
  activeCount: number;
  resolvedCount: number;
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

function formatShortDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppTopNav({
  activeStoreName,
  activeStoreLogoUrl,
  activeBranchName,
  shellTitle,
  canViewNotifications,
}: AppTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canUseFullscreen, setCanUseFullscreen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<TopNavNotificationItem[]>([]);
  const [notificationSummary, setNotificationSummary] =
    useState<TopNavNotificationSummary>(emptyNotificationSummary);
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const notificationBoxRef = useRef<HTMLDivElement | null>(null);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  const activeRoot = useMemo(() => {
    const sortedRoots = [...navRoots].sort((a, b) => b.length - a.length);
    return sortedRoots.find((root) => isInRoot(pathname, root)) ?? null;
  }, [pathname]);

  const showBackButton = Boolean(activeRoot && pathname !== activeRoot);
  const showStoreIdentity = !showBackButton;
  const showStoreSwitchButton = !pathname.startsWith("/settings/stores");
  const showNotificationButton = canViewNotifications;
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

  useEffect(() => {
    const syncViewportAndDevice = () => {
      setIsDesktopViewport(window.innerWidth >= 1024);
      setIsSmallViewport(window.innerWidth < 640);

      const hasTouchPoints = navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const hasTouchEvent = "ontouchstart" in window;
      setIsTouchDevice(hasTouchPoints || hasCoarsePointer || hasTouchEvent);
    };

    syncViewportAndDevice();

    window.addEventListener("resize", syncViewportAndDevice);
    return () => {
      window.removeEventListener("resize", syncViewportAndDevice);
    };
  }, []);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const showFullscreenButton =
    canUseFullscreen && (isDesktopViewport || (allowFullscreenOnTouch && isTouchDevice));

  const loadNotifications = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!showNotificationButton) {
        return;
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setIsNotificationLoading(true);
        setNotificationError(null);
      }

      try {
        const fetchLimit = isSmallViewport ? 6 : 8;
        const res = await authFetch(
          `/api/settings/notifications/inbox?filter=ACTIVE&limit=${fetchLimit}`,
          {
            cache: "no-store",
          },
        );
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              message?: string;
              items?: TopNavNotificationItem[];
              summary?: TopNavNotificationSummary;
            }
          | null;

        if (!res.ok || !data?.ok) {
          if (res.status === 401 || res.status === 403) {
            setNotifications([]);
            setNotificationSummary(emptyNotificationSummary);
            return;
          }

          if (!silent) {
            setNotificationError(data?.message ?? "โหลดการแจ้งเตือนไม่สำเร็จ");
          }
          return;
        }

        setNotifications(Array.isArray(data.items) ? data.items : []);
        setNotificationSummary(data.summary ?? emptyNotificationSummary);
      } catch {
        if (!silent) {
          setNotificationError("เชื่อมต่อไม่สำเร็จ");
        }
      } finally {
        if (!silent) {
          setIsNotificationLoading(false);
        }
      }
    },
    [isSmallViewport, showNotificationButton],
  );

  const markNotificationRead = useCallback(async (notificationId: string) => {
    setMarkingReadId(notificationId);
    try {
      const res = await authFetch("/api/settings/notifications/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_read",
          notificationId,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; summary?: TopNavNotificationSummary }
        | null;
      if (!res.ok || !data?.ok) {
        return;
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, status: "READ" } : item,
        ),
      );
      if (data.summary) {
        setNotificationSummary(data.summary);
      } else {
        setNotificationSummary((current) => ({
          ...current,
          unreadCount: Math.max(0, current.unreadCount - 1),
        }));
      }
    } catch {
      // Ignore transient network errors in compact top-nav action.
    } finally {
      setMarkingReadId(null);
    }
  }, []);

  useEffect(() => {
    if (!showNotificationButton) {
      return;
    }

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadNotifications, showNotificationButton]);

  useEffect(() => {
    if (!isNotificationOpen) {
      return;
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const isInsideTrigger = notificationBoxRef.current?.contains(targetNode) ?? false;
      const isInsidePanel = notificationPanelRef.current?.contains(targetNode) ?? false;
      if (!isInsideTrigger && !isInsidePanel) {
        setIsNotificationOpen(false);
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [isNotificationOpen]);

  useEffect(() => {
    setIsNotificationOpen(false);
  }, [pathname]);

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

  const renderNotificationPanelContent = () => {
    return (
    <>
      <div className="border-b border-slate-100 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-900">งานแจ้งเตือนล่าสุด</p>
            <p className="text-[11px] text-slate-500">
              ยังไม่อ่าน {notificationSummary.unreadCount.toLocaleString("th-TH")} รายการ
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
              onClick={() => {
                void loadNotifications();
              }}
              disabled={isNotificationLoading}
              title="รีเฟรช"
              aria-label="รีเฟรช"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isNotificationLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
      >
        {notificationError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
            {notificationError}
          </div>
        ) : null}
        {!notificationError && notifications.length === 0 ? (
          <p className="py-5 text-center text-xs text-slate-500">ยังไม่มีรายการแจ้งเตือน</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((item) => {
              const poNumber =
                typeof item.payload.poNumber === "string" ? item.payload.poNumber : null;
              const supplierName =
                typeof item.payload.supplierName === "string" ? item.payload.supplierName : null;

              return (
                <li key={item.id} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
                        {item.message}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-slate-500">
                        {poNumber ? `PO ${poNumber}` : "PO -"}
                        {supplierName ? ` · ${supplierName}` : ""}
                        {item.dueDate ? ` · due ${formatShortDateTime(item.dueDate)}` : ""}
                      </p>
                    </div>
                    {item.dueStatus ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          item.dueStatus === "OVERDUE"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.dueStatus === "OVERDUE" ? "เกินกำหนด" : "ใกล้ครบกำหนด"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-slate-500">
                      ตรวจล่าสุด {formatShortDateTime(item.lastDetectedAt)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {item.status === "UNREAD" ? (
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => {
                            void markNotificationRead(item.id);
                          }}
                          disabled={markingReadId === item.id}
                        >
                          อ่านแล้ว
                        </button>
                      ) : null}
                      <Link
                        href="/stock?tab=purchase"
                        className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-slate-800"
                        onClick={() => setIsNotificationOpen(false)}
                      >
                        เปิดงาน AP
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 p-2.5">
        <Link
          href="/settings/notifications"
          className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          onClick={() => setIsNotificationOpen(false)}
        >
          เปิด Notification Center
        </Link>
      </div>
    </>
    );
  };

  const mobileNotificationPopover =
    isClientReady && !isDesktopViewport && isNotificationOpen
      ? createPortal(
          <div
            ref={notificationPanelRef}
            className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[60] flex w-[min(24rem,calc(100vw-1rem))] max-h-[68dvh] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            {renderNotificationPanelContent()}
          </div>,
          document.body,
        )
      : null;

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
        {showStoreSwitchButton ? (
          <Link
            href="/settings/stores"
            title="เปลี่ยนร้าน"
            aria-label="เปลี่ยนร้าน"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98] xl:px-3"
          >
            <StoreSwitchIcon className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">เปลี่ยนร้าน</span>
          </Link>
        ) : null}
        {showNotificationButton ? (
          <div ref={notificationBoxRef} className="relative">
            <button
              type="button"
              title="การแจ้งเตือน"
              aria-label="การแจ้งเตือน"
              aria-expanded={isNotificationOpen}
              onClick={() => {
                setIsNotificationOpen((current) => {
                  const next = !current;
                  if (next) {
                    void loadNotifications();
                  }
                  return next;
                });
              }}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98] md:h-9 md:w-9"
            >
              <Bell className="h-4 w-4" />
              {notificationSummary.unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                  {notificationSummary.unreadCount > 99
                    ? "99+"
                    : notificationSummary.unreadCount.toLocaleString("th-TH")}
                </span>
              ) : null}
            </button>

            {isNotificationOpen && isDesktopViewport ? (
              <div
                ref={notificationPanelRef}
                className="absolute right-0 top-11 z-30 flex w-[min(24rem,calc(100vw-1rem))] max-h-[68dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[32rem]"
              >
                {renderNotificationPanelContent()}
              </div>
            ) : null}
          </div>
        ) : null}
        {showFullscreenButton ? (
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "ออกจากโหมดเต็มจอ" : "เข้าโหมดเต็มจอ"}
            aria-label={isFullscreen ? "ออกจากโหมดเต็มจอ" : "เข้าโหมดเต็มจอ"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-[0.98] md:h-9 md:w-9"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {mobileNotificationPopover}
    </div>
  );
}
