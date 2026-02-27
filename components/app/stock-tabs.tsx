"use client";

import { Edit, FileText, Package, ShoppingCart } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

type StockTabsProps = {
  recordingTab: ReactNode;
  inventoryTab: ReactNode;
  historyTab: ReactNode;
  purchaseTab: ReactNode;
  initialTab?: string;
};

const tabs = [
  { id: "inventory", label: "ดูสต็อก", labelMobile: "สต็อก", icon: Package },
  { id: "purchase", label: "สั่งซื้อ", labelMobile: "PO", icon: ShoppingCart },
  { id: "recording", label: "บันทึกสต็อก", labelMobile: "บันทึก", icon: Edit },
  { id: "history", label: "ประวัติ", labelMobile: "ประวัติ", icon: FileText },
] as const;

type TabId = (typeof tabs)[number]["id"];
const isTabId = (value: string | null): value is TabId =>
  value === "recording" || value === "inventory" || value === "history" || value === "purchase";

export function StockTabs({
  recordingTab,
  inventoryTab,
  historyTab,
  purchaseTab,
  initialTab = "inventory",
}: StockTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get("tab");
  const initialActiveTab: TabId = isTabId(tabFromQuery)
    ? tabFromQuery
    : isTabId(initialTab)
      ? initialTab
      : "inventory";
  const [activeTab, setActiveTab] = useState<TabId>(
    initialActiveTab,
  );
  const [mountedTabs, setMountedTabs] = useState<Record<TabId, boolean>>(() => ({
    inventory: initialActiveTab === "inventory",
    purchase: initialActiveTab === "purchase",
    recording: initialActiveTab === "recording",
    history: initialActiveTab === "history",
  }));

  useEffect(() => {
    setMountedTabs((prev) => ({ ...prev, [activeTab]: true }));
  }, [activeTab]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (isTabId(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`flex flex-1 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => {
                setActiveTab(tab.id);
                const params = new URLSearchParams(searchParams);
                params.set("tab", tab.id);
                router.push(`?${params.toString()}`);
              }}
            >
              <Icon className="h-4 w-4" />
              <span className="md:hidden">{tab.labelMobile}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className={activeTab === "inventory" ? "block" : "hidden"} aria-hidden={activeTab !== "inventory"}>
        {mountedTabs.inventory ? inventoryTab : null}
      </div>
      <div className={activeTab === "purchase" ? "block" : "hidden"} aria-hidden={activeTab !== "purchase"}>
        {mountedTabs.purchase ? purchaseTab : null}
      </div>
      <div className={activeTab === "recording" ? "block" : "hidden"} aria-hidden={activeTab !== "recording"}>
        {mountedTabs.recording ? recordingTab : null}
      </div>
      <div className={activeTab === "history" ? "block" : "hidden"} aria-hidden={activeTab !== "history"}>
        {mountedTabs.history ? historyTab : null}
      </div>
    </div>
  );
}
