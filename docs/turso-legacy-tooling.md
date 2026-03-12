# Turso Legacy Tooling

สถานะล่าสุด: legacy Turso/LibSQL/Drizzle tooling ถูกลบออกจาก repo แล้ว

## Current State

- runtime app เป็น `PostgreSQL-only`
- ไม่มี `legacy:*` commands
- ไม่มี `LEGACY_LIBSQL_*` env ที่ใช้ใน workflow ปัจจุบัน
- ไม่มี scripts compare/backfill/repair/seed ที่อิง LibSQL แล้ว

## Source Of Truth

ให้ใช้ PostgreSQL อย่างเดียว:

- migrations: `postgres/migrations/`
- apply migrations: `npm run db:migrate:postgres`
- docs หลัก:
  - [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md)
  - [docs/postgres-full-cutover-checklist.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-full-cutover-checklist.md)
