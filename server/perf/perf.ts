import "server-only";

const toMs = (value: number) => Number(value.toFixed(1));

export const isPerfEnabled = () =>
  process.env.PERF_DEBUG === "1" ||
  (process.env.NODE_ENV === "development" && process.env.PERF_DEBUG !== "0");

export async function timePerf<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!isPerfEnabled()) {
    return operation();
  }

  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const durationMs = toMs(performance.now() - startedAt);
    console.info(`[perf] ${label} ${durationMs}ms`);
  }
}

export async function timeDb<T>(
  label: string,
  query: () => Promise<T>,
): Promise<T> {
  if (!isPerfEnabled()) {
    return query();
  }

  const startedAt = performance.now();
  try {
    return await query();
  } finally {
    const durationMs = toMs(performance.now() - startedAt);
    const thresholdMs = Number(process.env.PERF_SLOW_QUERY_MS ?? "250");
    const level = durationMs >= thresholdMs ? "warn" : "info";
    console[level](`[perf][db] ${label} ${durationMs}ms`);
  }
}

export function createPerfScope(scope: string, mode: "perf" | "render" = "perf") {
  const enabled = isPerfEnabled();
  const startedAt = performance.now();

  return {
    async step<T>(label: string, operation: () => Promise<T>): Promise<T> {
      if (!enabled) {
        return operation();
      }

      const stepStartedAt = performance.now();
      try {
        return await operation();
      } finally {
        const durationMs = toMs(performance.now() - stepStartedAt);
        console.info(`[perf] ${scope}.${label} ${durationMs}ms`);
      }
    },
    end() {
      if (!enabled) {
        return;
      }
      const durationMs = toMs(performance.now() - startedAt);
      if (mode === "render") {
        console.info(`[perf][render] ${scope} ${durationMs}ms`);
        return;
      }

      console.info(`[perf] ${scope}.total ${durationMs}ms`);
    },
  };
}
