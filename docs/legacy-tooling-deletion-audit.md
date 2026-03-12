# Legacy Tooling Deletion Audit

ผลล่าสุด: legacy Turso/LibSQL tooling ถูกลบออกแล้ว

## Deleted

- `legacy/drizzle.config.ts`
- `legacy/drizzle/`
- scripts กลุ่ม compare/backfill/repair/seed/benchmark ที่อิง LibSQL
- package scripts กลุ่ม `legacy:*`
- dependency `@libsql/client`
- devDependency `drizzle-kit`

## Remaining

ไม่เหลือ LibSQL/Drizzle runtime หรือ tooling ที่ใช้งานอยู่แล้ว

สถานะล่าสุด:

- runtime app เป็น `PostgreSQL-only`
- tooling ปัจจุบันเป็น `PostgreSQL-only`
- schema source of truth เหลือ `postgres/migrations/` อย่างเดียว
