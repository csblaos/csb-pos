# PostgreSQL + Sequelize Query-First Migration Plan

เอกสารนี้อธิบายแนวทางย้ายจาก `Turso/LibSQL + Drizzle` ไปเป็น `Aiven PostgreSQL + Sequelize.query(...)`
โดยออกแบบให้ย้ายไป `Express + TypeScript` ได้ง่ายในอนาคต

## เป้าหมาย

- ใช้ `PostgreSQL` เป็นฐานข้อมูลหลัก
- ใช้ `Sequelize` เป็น infrastructure layer สำหรับ:
  - connection pool
  - transaction
  - parameter binding
  - health check
- ใช้ `sequelize.query(...)` เป็นแกนของ query ทั้ง read/write
- ลดการผูก business logic กับ Next.js และกับ Sequelize ORM model

## สิ่งที่ตั้งใจไม่ใช้

- ไม่ใช้ `Model.findAll/create/update` เป็นแนวหลักของโดเมนธุรกิจ
- ไม่พึ่ง Sequelize association/hook/lazy-loading สำหรับ flow สำคัญ
- ไม่ให้ route handler ถือ SQL string โดยตรง

## Target Architecture

```text
app/api/...                 -> transport adapter (Next.js ชั่วคราว)
modules/<domain>/*.service  -> business rules
modules/<domain>/*.repo     -> เรียก sequelize.query(...)
modules/<domain>/*.sql      -> เก็บ SQL strings
lib/db/sequelize.ts         -> connection + pool
lib/db/query.ts             -> query helpers
lib/db/transaction.ts       -> transaction wrapper
```

## Design Rules

1. `route/controller` เรียก `service` เท่านั้น
2. `service` ไม่รู้จัก `NextRequest/NextResponse`
3. `repository` รับ `tx?: Transaction`
4. `repository` คืนค่าเป็น plain object เท่านั้น
5. SQL อยู่ในไฟล์ `*.sql.ts` หรือ constants เดียวกันต่อโดเมน
6. ทุก query ต้องใช้ parameter binding (`replacements`) ห้าม string interpolation ที่รับค่าจาก user

## Why Query-First

- query ซับซ้อนของ `orders`, `stock`, `reports` คุมได้ดีกว่า ORM model
- ลด lock-in กับ Sequelize model API
- ย้ายไป `Express + TypeScript` ได้โดยเปลี่ยนแค่ transport layer
- อนาคตถ้าจะลด Sequelize ลงเหลือ `pg` ตรง ๆ ก็ reuse SQL ได้เกือบทั้งหมด

## Migration Phases

### Phase 0: Freeze Strategy

- หยุดเพิ่ม query ใหม่บน Drizzle สำหรับโมดูลที่จะเริ่ม migrate
- ตกลง naming convention:
  - table/column = `snake_case`
  - DTO/TypeScript = `camelCase`
- ตกลง transaction boundary ต่อโดเมน

### Phase 1: Foundation

- เพิ่ม dependency:
  - `sequelize`
  - `pg`
  - `pg-hstore`
- เพิ่มไฟล์:
  - `lib/db/sequelize.ts`
  - `lib/db/query.ts`
  - `lib/db/transaction.ts`
  - `lib/db/sql.ts`
- เพิ่ม env ใหม่:
  - `POSTGRES_DATABASE_URL`
  - `POSTGRES_SSL_MODE`
  - `POSTGRES_SSL_REJECT_UNAUTHORIZED`
  - `POSTGRES_POOL_MAX`
  - `POSTGRES_POOL_MIN`
  - `POSTGRES_POOL_IDLE_MS`
  - `POSTGRES_POOL_ACQUIRE_MS`
  - `POSTGRES_LOG_SQL`

### Phase 2: PostgreSQL Schema

- ทำ SQL migration files สำหรับ PostgreSQL โดยแยกจาก Drizzle migration เดิม
- ใช้ runner `npm run db:migrate:postgres` (`scripts/migrate-postgres.mjs`) สำหรับ apply ไฟล์ใน `postgres/migrations/`
- track migration ที่ apply แล้วในตาราง `__app_postgres_migrations` พร้อม checksum
- แปลง schema จาก SQLite/LibSQL -> PostgreSQL โดยเช็กจุดต่าง:
  - `integer boolean` -> `boolean`
  - timestamp/timezone
  - `on conflict`
  - foreign key actions
  - indexes/unique constraints
  - JSON/JSONB

สถานะตอนนี้:

- baseline แรกถูก scaffold แล้วที่ `postgres/migrations/0001_orders_read_foundation.sql`
- baseline นี้ครอบเฉพาะตารางที่ `orders read` ใช้จริงก่อน เพื่อเปิดทดสอบ `POSTGRES_ORDERS_READ_ENABLED=1` ได้แบบจำกัดขอบเขต
- เพิ่ม `postgres/migrations/0002_inventory_movements_foundation.sql` แล้ว เพื่อขยาย baseline ไปถึงตาราง stock movement ที่ `orders write` ต้องใช้
- มี backfill script แล้วที่ `scripts/backfill-postgres-orders-read.mjs` สำหรับย้ายข้อมูลจาก Turso -> PostgreSQL แบบ upsert/re-run safe
- มี parity-check script แล้วที่ `scripts/compare-postgres-orders-read.mjs` สำหรับเทียบผลลัพธ์ `orders list/detail` ระหว่างสองฐานก่อนเปิด read flag จริง
- เพิ่ม `scripts/backfill-postgres-inventory-movements.mjs` และ `scripts/compare-postgres-inventory-parity.mjs` เพื่อปิด gap ของ stock movement parity ก่อนเปิด inventory reads/write flags ที่แตะ reserve/out จริง
- เพิ่ม `postgres/migrations/0004_auth_rbac_foundation.sql` แล้ว เพื่อขยาย baseline ไปถึง `auth/session + RBAC + app shell`
- เพิ่ม `scripts/backfill-postgres-auth-rbac-read.mjs` และ `scripts/compare-postgres-auth-rbac-read.mjs`
- parity ของ auth/RBAC baseline ผ่านแล้ว (`system_config`, `permissions`, `roles`, `store_members`, `store_branches`, `store_member_branches`, `role_permissions`)
- เพิ่ม `postgres/migrations/0005_settings_system_admin_foundation.sql` แล้ว เพื่อขยาย baseline ไปถึง `settings/system-admin` read foundation (`fb_connections`, `wa_connections`)
- เพิ่ม `scripts/backfill-postgres-settings-system-admin-read.mjs` และ `scripts/compare-postgres-settings-system-admin-read.mjs`
- parity ของ settings/system-admin foundation ผ่านแล้ว (`fb_connections=5`, `wa_connections=5`, `superadmins=3`, `policyUsers=4`)
- เพิ่ม `postgres/migrations/0006_products_units_onboarding_foundation.sql` แล้ว เพื่อขยาย baseline ไปถึง `products/units/onboarding` read foundation (`product_categories`, `product_models`, `product_units`)
- เพิ่ม `scripts/backfill-postgres-products-units-onboarding-read.mjs` และ `scripts/compare-postgres-products-units-onboarding-read.mjs`
- parity ของ products/units/onboarding foundation ผ่านแล้ว (`stores=6`, `product_categories=3`, `product_models=4`, `product_units=12`)
- เพิ่ม low-risk write foundation สำหรับ `products/units/onboarding` แล้วผ่าน helper `lib/platform/postgres-products-onboarding-write.ts`
- scope write รอบนี้ครอบ `units`, `product categories`, และ `onboarding channel connect` ผ่าน flag `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED`
- เพิ่ม smoke script `npm run smoke:postgres:products-units-onboarding-write` แล้ว และรันผ่านแบบ rollback บน Aiven
- เพิ่ม rollout gate `npm run smoke:postgres:products-units-onboarding-write-gate` และ execution checklist `docs/postgres-products-units-onboarding-write-rollout-execution.md` แล้ว เพื่อใช้เปิด low-risk writes บน staging แบบ canary
- เพิ่ม product CRUD + variant persistence foundation แล้วผ่าน helper `lib/platform/postgres-products-write.ts`
- เพิ่ม migration `postgres/migrations/0007_products_variant_write_foundation.sql` สำหรับ `product_model_attributes`, `product_model_attribute_values`, และ index ที่ product write path ต้องใช้
- เพิ่ม scripts:
  - `npm run db:backfill:postgres:product-variants-foundation`
  - `npm run db:compare:postgres:product-variants-foundation`
  - `npm run smoke:postgres:products-write`
- เพิ่ม flag `POSTGRES_PRODUCTS_WRITE_ENABLED` สำหรับเปิด product CRUD + variant persistence write path ใน phase ถัดไป
- ขยาย read prep ใน `lib/platform/postgres-products-onboarding.ts` / `lib/products/service.ts` ให้ครอบ `listStoreProducts`, `/api/products/models`, และ `/api/products/search` เพื่อกัน read-after-write stale ตอน rollout write path

### Phase 3: Data Migration

- export data จาก Turso
- transform types ให้ตรง PostgreSQL
- import เข้า Aiven
- verify:
  - row counts
  - FK integrity
  - core business tables (`orders`, `order_items`, `inventory_movements`, `audit_events`)

### Phase 4: Query Migration

ลำดับแนะนำ:

1. `auth/session + RBAC + app shell`
2. `settings/system-admin`
3. `settings`
4. `products/units/onboarding`
5. `orders` read
6. `orders` write
7. `stock` / `purchase orders`
8. `reports`

### Phase 5: Express-Ready Refactor

- แยก service signatures ให้ framework-agnostic
- ลดการอ้างอิง Next-specific API ใน business layer
- เตรียม controller layer ที่ reuse service เดิมได้

### Phase 6: Cutover

- ชี้ runtime หลักไป PostgreSQL
- ปิด path เดิมของ Turso/Drizzle ทีละส่วน
- รัน smoke tests ทุก flow สำคัญ

### Staging Rollout Note

- หลัง order read parity และ inventory parity ผ่านแล้ว ให้เปิด PostgreSQL write paths เป็น wave บน staging ไม่ใช่เปิดพร้อมกันทั้งหมด
- ใช้ runbook ใน `docs/postgres-staging-rollout.md` เป็น source of truth สำหรับ:
  - ลำดับการเปิด flags
  - preflight commands
  - manual UAT
  - rollback rules
- ใช้ `npm run smoke:postgres:orders-write-suite` เป็น pre-rollout gate สำหรับ order write actions ทั้งชุด

### Remaining Inventory Producers

- หลังจบ order-route rollout ให้ใช้อ audit ใน `docs/postgres-inventory-producers-audit.md` เป็น source of truth สำหรับ movement producers ที่ยังค้างบน Turso
- `POST /api/orders` รองรับ PostgreSQL write path แล้วผ่าน flag `POSTGRES_ORDERS_WRITE_CREATE_ENABLED`
- `POST /api/stock/movements` รองรับ PostgreSQL write path แล้วผ่าน flag `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED`
- PO receive flows มี PostgreSQL write path แล้ว
- purchase read (`list/detail/pending-rate`) มี PostgreSQL path แล้วผ่าน flag `POSTGRES_PURCHASE_READ_ENABLED`
- backfill `purchase_orders`, `purchase_order_items`, `purchase_order_payments` และ parity-check purchase read ผ่านแล้ว
- ขั้นถัดไปคือ rollout purchase read/write flags พร้อมกันบน staging ไม่ใช่เพิ่ม migration slice ใหม่ทันที

### Purchase Orders Next Gate

- `POSTGRES_PURCHASE_READ_ENABLED` เปิด purchase list/detail/pending-rate reads ผ่าน PostgreSQL
- `POST /api/stock/purchase-orders` branch `receiveImmediately=true` รองรับ PostgreSQL write path แล้วผ่าน `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED`
- `PATCH /api/stock/purchase-orders/[poId]` transition ไป `RECEIVED` รองรับ PostgreSQL write path แล้วผ่าน `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED`
- มี migration `postgres/migrations/0003_purchase_orders_foundation.sql` และ smoke:
  - `npm run smoke:postgres:po-create-received`
  - `npm run smoke:postgres:po-status-received`
- มี backfill/parity scripts:
  - `npm run db:backfill:postgres:purchase-read`
  - `npm run db:compare:postgres:purchase-read`
- มี rollout gate script:
  - `npm run smoke:postgres:purchase-suite`
- มี inventory read gate script:
  - `npm run smoke:postgres:inventory-read-gate`
- มี cutover gate script:
  - `npm run smoke:postgres:cutover-gate`
- ยังไม่ควรเปิด purchase read อย่างเดียวหรือ purchase write อย่างเดียว ควรเปิดสาม flag พร้อมกันบน staging เพื่อกัน purchase UI stale ระหว่างสองฐาน

### Inventory Read Next Gate

- `POSTGRES_INVENTORY_READ_ENABLED` ควรเปิดหลังจาก order write rollout และ purchase rollout ผ่านแล้วเท่านั้น
- ใช้ `npm run smoke:postgres:inventory-read-gate` เป็น preflight หลักก่อนเปิด
- หลังเปิดแล้วต้องทำ canary UAT ทั้ง order reserve/out/cancel และ purchase receive flows เพื่อยืนยันว่า stock truth บน UI เปลี่ยนไปพึ่ง PostgreSQL ได้จริง

### Cutover Phase After Inventory Reads

- หลัง inventory read rollout ผ่านแล้ว ให้ใช้ `docs/postgres-cutover-plan.md` เป็น source of truth สำหรับ phase cutover ถัดไป
- preflight หลักของ phase นี้คือ `npm run smoke:postgres:cutover-gate`
- เพิ่ม reports read path แล้วใน `lib/reports/queries.ts` ผ่าน `POSTGRES_REPORTS_READ_ENABLED`
- `server/services/reports.service.ts` และ `server/services/purchase-ap.service.ts` ใช้ helper `getReportStoreCurrency` ตัวเดียวกันแล้ว เพื่อไม่ให้ `/reports`, AP summary/statement และ CSV export ต้องกลับไปอ่าน `stores.currency` จาก Turso เมื่อเปิด reports flag
- มี parity script แล้ว:
  - `npm run db:compare:postgres:reports-read`
- มี rollout gate script แล้ว:
  - `npm run smoke:postgres:reports-read-gate`
- parity ของ `/reports` overview และ `outstanding PO/AP` ผ่านแล้วบนข้อมูลปัจจุบัน
- phase ถัดไปจึงควรเป็น reports staging rollout/observe ไม่ใช่เริ่มเขียน query layer ใหม่อีก
- หลัง reports rollout และ phase observe/fallback removal ผ่านแล้ว ให้ใช้ `docs/postgres-turso-drizzle-retirement-plan.md` เป็น source of truth สำหรับลำดับถอด Turso/Drizzle ออกจาก runtime จริง
- หลัง retirement plan พร้อมแล้ว ให้ใช้ `docs/express-readiness-plan.md` เป็น source of truth สำหรับการเตรียม boundary ก่อนย้าย API transport ไป `Express + TypeScript`

## Domain Guidance

### ใช้ Raw SQL เต็มตัวตั้งแต่แรก

- `orders`
- `stock`
- `purchase orders`
- `reports`
- `idempotency`
- `audit events`

### โดเมนที่อาจยอมใช้ Sequelize model ได้ ถ้าจำเป็น

- `users`
- `roles`
- `shipping providers`
- `store settings`

แต่ถ้าเป้าหมายคือย้ายไป Express ง่ายที่สุด ให้ใช้ `sequelize.query(...)` ทั้งหมดจะสม่ำเสมอกว่า

## Example Query Pattern

```ts
import { QueryTypes } from "sequelize";
import { getSequelize } from "@/lib/db/sequelize";

export async function listOrdersByStatus(status: string) {
  return getSequelize().query(
    `
      select
        o.id,
        o.order_no as "orderNo",
        o.status
      from orders o
      where o.status = :status
      order by o.created_at desc
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { status },
    },
  );
}
```

## Transaction Pattern

```ts
import { runInTransaction } from "@/lib/db/transaction";

await runInTransaction(async (tx) => {
  await orderRepository.updateStatus(orderId, "PAID", tx);
  await auditRepository.insertEvent(auditPayload, tx);
  await idempotencyRepository.markSucceeded(key, tx);
});
```

## Express Migration Readiness Checklist

- service layer ไม่ import Next.js
- repository layer ไม่คืน Sequelize instance
- auth/session/rbac logic แยกจาก transport
- validation ใช้ `zod` หรือ schema กลาง
- SQL อยู่รวมใน domain ชัดเจน

## Recommended Next Implementation Slice

เริ่มที่ `orders read` หรือ `settings read`

- ถ้าต้องการลด architectural risk ก่อน: เริ่ม `orders read`
- ถ้าต้องการ slice ง่ายและเร็ว: เริ่ม `settings read`

สำหรับโปรเจกต์นี้ แนะนำ `orders read` เป็น slice แรก เพราะ:

- เป็นโดเมนสำคัญที่สุด
- ใช้ query ซับซ้อนและจะเห็น trade-off ชัดตั้งแต่ต้น
- ช่วยออกแบบ transaction/read model สำหรับโดเมนอื่นต่อได้ง่าย
