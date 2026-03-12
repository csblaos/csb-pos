# Context Index

ไฟล์นี้เป็นแผนที่รวม context ทั้งโปรเจกต์ เพื่อให้ AI/ทีมอ่านต่อได้เร็วและตรง

## Current Status

- runtime app เป็น `PostgreSQL-only`
- tooling ปัจจุบันเป็น `PostgreSQL-only`
- โปรเจกต์อยู่ในสถานะ `พร้อมพัฒนาฟีเจอร์ต่อ`
- เอกสารในส่วน rollout/migration หลายไฟล์ด้านล่างเป็น `historical reference`

## Current Source Of Truth

1. `AI_CONTEXT.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CODEBASE_MAP.md`
5. `docs/UI_ROUTE_MAP.md`
6. `docs/API_INVENTORY.md`
7. `docs/SCHEMA_MAP.md`
8. `docs/DECISIONS.md`
9. `docs/express-readiness-plan.md`

## Read Order (Recommended)

1. `AI_CONTEXT.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CODEBASE_MAP.md`
5. `docs/UI_ROUTE_MAP.md`
6. `docs/DECISIONS.md`
7. `docs/API_INVENTORY.md`
8. `docs/SCHEMA_MAP.md`
9. `docs/express-readiness-plan.md`
10. `docs/orders-system-design.md`
11. `docs/product-variants-plan.md`
12. `docs/postgresql-sequelize-migration.md`
13. `docs/postgres-staging-rollout.md`
14. `docs/postgres-cutover-plan.md`
15. `docs/postgres-full-cutover-checklist.md`
16. `docs/postgres-turso-drizzle-retirement-plan.md`
17. `docs/postgres-turso-runtime-dependency-audit.md`
18. `docs/turso-legacy-tooling.md`
19. `docs/archive/HANDOFF_HISTORY.md`

## What Each File Is For

- `AI_CONTEXT.md`
  - กติกาหลัก, quick start, update contract
- `docs/HANDOFF.md`
  - สถานะล่าสุด, สิ่งที่ทำไปแล้ว, next step ที่ควรทำต่อ
- `docs/ARCHITECTURE.md`
  - ภาพรวมระบบ, flow หลัก, reliability patterns
- `docs/CODEBASE_MAP.md`
  - แผนที่โครงสร้างโค้ดทั้งระบบ (domain ownership)
- `docs/UI_ROUTE_MAP.md`
  - แผนที่หน้า UI -> component -> API สำหรับ trace/debug
- `docs/DECISIONS.md`
  - บันทึกเหตุผลการตัดสินใจ (ADR-lite)
- `docs/API_INVENTORY.md`
  - แคตตาล็อก API route ทั้งระบบ พร้อม access control แบบย่อ
- `docs/SCHEMA_MAP.md`
  - แผนผังตารางและความสัมพันธ์สำคัญ
- `docs/orders-system-design.md`
  - แผนออกแบบ `/orders` ระดับระบบสำหรับ roadmap
- `docs/product-variants-plan.md`
  - แผนโครงสร้างสินค้าแบบ Variant (DB + UX + rollout phases)
- `docs/express-readiness-plan.md`
  - แผนเตรียม boundary สำหรับย้าย API จาก Next.js ไป Express + TypeScript แบบค่อยเป็นค่อยไป
- `docs/postgresql-sequelize-migration.md`
  - historical migration record ของการย้ายไป `PostgreSQL + Sequelize.query(...)`
- `docs/postgres-staging-rollout.md`
  - historical rollout runbook ของช่วงเปิด PostgreSQL flags
- `docs/postgres-cutover-plan.md`
  - historical cutover plan ของ inventory/reporting
- `docs/postgres-full-cutover-checklist.md`
  - historical checklist ของ phase cutover/fallback removal
- `docs/postgres-turso-drizzle-retirement-plan.md`
  - historical retirement plan หลังจบ migration แล้ว
- `docs/postgres-turso-runtime-dependency-audit.md`
  - historical audit ของการถอด Turso runtime dependency
- `docs/turso-legacy-tooling.md`
  - historical note ของ phase แยก legacy tooling ออกจาก runtime
- `docs/archive/HANDOFF_HISTORY.md`
  - บันทึก handoff/migration log เดิมแบบเต็ม ใช้อ้างย้อนหลังเท่านั้น

## Historical / Archive Docs

ไฟล์กลุ่มนี้ใช้เพื่ออ้างย้อนหลัง ไม่ใช่คู่มือปัจจุบัน:

- `docs/postgresql-sequelize-migration.md`
- `docs/postgres-staging-rollout.md`
- `docs/postgres-cutover-plan.md`
- `docs/postgres-full-cutover-checklist.md`
- `docs/postgres-turso-drizzle-retirement-plan.md`
- `docs/postgres-turso-runtime-dependency-audit.md`
- `docs/turso-legacy-tooling.md`
- `docs/archive/HANDOFF_HISTORY.md`

## Maintenance Rules

- ถ้าแก้ behavior/API/schema/env:
  - ต้องอัปเดต `AI_CONTEXT.md` และ `docs/HANDOFF.md`
- ถ้าเพิ่ม/แก้ route:
  - ต้องอัปเดต `docs/API_INVENTORY.md`
- ถ้าเปลี่ยน flow หน้า UI -> API:
  - ต้องอัปเดต `docs/UI_ROUTE_MAP.md`
- ถ้าแก้ schema/migration:
  - ต้องอัปเดต `docs/SCHEMA_MAP.md`
- ถ้าเปลี่ยน decision เชิงสถาปัตยกรรม:
  - ต้องอัปเดต `docs/DECISIONS.md`
