const toMs = (value: number) => Number(value.toFixed(1));

export const isPerfDebugEnabled = () =>
  process.env.PERF_DEBUG === "1" ||
  (process.env.NODE_ENV === "development" && process.env.PERF_DEBUG !== "0");

export function startServerRenderTimer(label: string) {
  if (!isPerfDebugEnabled()) {
    return () => {};
  }

  const startedAt = performance.now();

  return () => {
    const durationMs = toMs(performance.now() - startedAt);
    console.info(`[perf][render] ${label} ${durationMs}ms`);
  };
}

export async function timeAsync<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!isPerfDebugEnabled()) {
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

export async function timeDbQuery<T>(
  label: string,
  query: () => Promise<T>,
): Promise<T> {
  if (!isPerfDebugEnabled()) {
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
