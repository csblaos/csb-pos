"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";

export function ClientPerfVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NEXT_PUBLIC_PERF_DEBUG !== "1") {
      return;
    }

    const value = Number(metric.value.toFixed(2));
    console.info(`[perf][web-vitals] ${metric.name}=${value}`);
  });

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PERF_DEBUG !== "1") {
      return;
    }

    const hydrationAtMs = Number(performance.now().toFixed(1));
    const scriptResources = performance
      .getEntriesByType("resource")
      .filter(
        (entry): entry is PerformanceResourceTiming =>
          (entry as PerformanceResourceTiming).initiatorType === "script",
      );
    const transferSize = scriptResources.reduce((sum, entry) => {
      return sum + (entry.transferSize || 0);
    }, 0);

    console.info(
      `[perf][client] hydration=${hydrationAtMs}ms scripts=${scriptResources.length} transfer=${Math.round(transferSize / 1024)}KB`,
    );
  }, []);

  return null;
}
