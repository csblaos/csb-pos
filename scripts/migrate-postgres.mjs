import "./load-local-env.mjs";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Sequelize } from "sequelize";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../postgres/migrations");

const sanitizeDatabaseUrl = (databaseUrl) => {
  const trimmed = databaseUrl.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslrootcert");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("uselibpqcompat");
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const splitSqlStatements = (rawSql) =>
  rawSql
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const toChecksum = (content) => createHash("sha256").update(content).digest("hex");

const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sslMode = (process.env.POSTGRES_SSL_MODE ?? "require").trim().toLowerCase();
const shouldUseSsl = sslMode !== "disable" && sslMode !== "off" && sslMode !== "false";
const rejectUnauthorized =
  (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "0").trim() === "1";

const sequelize = new Sequelize(sanitizeDatabaseUrl(databaseUrl), {
  dialect: "postgres",
  logging: false,
  dialectOptions: shouldUseSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});

try {
  await sequelize.authenticate();

  await sequelize.query(`
    create table if not exists __app_postgres_migrations (
      filename text primary key,
      checksum text not null,
      applied_at text not null default current_timestamp
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((entry) => entry.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const [appliedRows] = await sequelize.query(
    "select filename, checksum from __app_postgres_migrations order by filename asc",
  );
  const appliedMap = new Map(
    Array.isArray(appliedRows)
      ? appliedRows.map((row) => [String(row.filename), String(row.checksum)])
      : [],
  );

  let appliedCount = 0;

  for (const filename of files) {
    const absolutePath = path.join(migrationsDir, filename);
    const contents = await readFile(absolutePath, "utf8");
    const checksum = toChecksum(contents);
    const existingChecksum = appliedMap.get(filename);

    if (existingChecksum) {
      if (existingChecksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for ${filename}. Existing=${existingChecksum} Current=${checksum}`,
        );
      }
      console.info(`[pg:migrate] skip ${filename}`);
      continue;
    }

    const statements = splitSqlStatements(contents);
    if (statements.length === 0) {
      console.info(`[pg:migrate] skip empty ${filename}`);
      continue;
    }

    await sequelize.transaction(async (tx) => {
      for (const statement of statements) {
        await sequelize.query(statement, { transaction: tx });
      }

      await sequelize.query(
        `
          insert into __app_postgres_migrations (filename, checksum, applied_at)
          values (:filename, :checksum, current_timestamp)
        `,
        {
          transaction: tx,
          replacements: {
            filename,
            checksum,
          },
        },
      );
    });

    appliedCount += 1;
    console.info(`[pg:migrate] applied ${filename}`);
  }

  console.info(
    `[pg:migrate] done. applied=${appliedCount} total=${files.length} dir=${migrationsDir}`,
  );
} catch (error) {
  console.error("[pg:migrate] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
