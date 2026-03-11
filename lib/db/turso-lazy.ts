// Legacy Turso entrypoint for fallback/compare paths that have not been retired yet.
export const getTursoDb = async () => (await import("@/lib/db/client")).db;
