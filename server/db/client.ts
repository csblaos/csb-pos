import "server-only";

import { db } from "@/lib/db/client";

export { db };
export type DatabaseClient = typeof db;
