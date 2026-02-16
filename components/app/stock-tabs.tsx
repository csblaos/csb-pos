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
  { id: "recording", label: "บันทึกสต็อก", labelMobile: "บันทึก", icon: Edit },
  { id: "inventory", label: "ดูสต็อก", labelMobile: "สต็อก", icon: Package },
  { id: "history", label: "ประวัติ", labelMobile: "ประวัติ", icon: FileText },
  { id: "purchase", label: "สั่งซื้อ", labelMobile: "PO", icon: ShoppingCart },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function StockTabs({
  recordingTab,
  inventoryTab,
  historyTab,
  purchaseTab,
  initialTab = "recording",
}: StockTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>((searchParams.get("tab") as TabId) || (initialTab as TabId));

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && (tabParam === "recording" || tabParam === "inventory" || tabParam === "history" || tabParam === "purchase")) {
      setActiveTab(tabParam as TabId);
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
      {activeTab === "recording" && recordingTab}
      {activeTab === "inventory" && inventoryTab}
      {activeTab === "history" && historyTab}
      {activeTab === "purchase" && purchaseTab}
    </div>
  );
}
