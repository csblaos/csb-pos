"use client";

import { Package, ShoppingCart } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

type StockTabsProps = {
  stockTab: ReactNode;
  purchaseTab: ReactNode;
  initialTab?: string;
};

const tabs = [
  { id: "stock", label: "คลังสินค้า", icon: Package },
  { id: "purchase", label: "สั่งซื้อ", icon: ShoppingCart },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function StockTabs({ stockTab, purchaseTab, initialTab = "stock" }: StockTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>((searchParams.get("tab") as TabId) || (initialTab as TabId));

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && (tabParam === "stock" || tabParam === "purchase")) {
      setActiveTab(tabParam as TabId);
    }
  }, [searchParams]);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "stock" && stockTab}
      {activeTab === "purchase" && purchaseTab}
    </div>
  );
}
