import { defineConfig } from "drizzle-kit";

const url =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema/index.ts",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
  strict: true,
  verbose: true,
});
