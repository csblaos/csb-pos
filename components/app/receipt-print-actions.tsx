"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type ReceiptPrintActionsProps = {
  autoPrint: boolean;
  returnTo: string | null;
};

export function ReceiptPrintActions({ autoPrint, returnTo }: ReceiptPrintActionsProps) {
  const router = useRouter();

  useEffect(() => {
    if (!autoPrint) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.print();
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoPrint]);

  return (
    <div className="mt-3 flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={() => window.print()}>
        พิมพ์อีกครั้ง
      </Button>
      {returnTo ? (
        <Button
          type="button"
          className="h-9 px-3 text-xs"
          onClick={() => {
            router.push(returnTo);
          }}
        >
          กลับ POS
        </Button>
      ) : null}
    </div>
  );
}
