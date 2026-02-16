"use client";

import { Package, ShoppingCart } from "lucide-react";
import { type ReactNode, useState } from "react";

type StockTabsProps = {
  stockTab: ReactNode;
  purchaseTab: ReactNode;
};

const tabs = [
  { id: "stock", label: "คลังสินค้า", icon: Package },
  { id: "purchase", label: "สั่งซื้อ", icon: ShoppingCart },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function StockTabs({ stockTab, purchaseTab }: StockTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("stock");

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
              onClick={() => setActiveTab(tab.id)}
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
