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
- มี backfill script แล้วที่ `scripts/backfill-postgres-orders-read.mjs` สำหรับย้ายข้อมูลจาก Turso -> PostgreSQL แบบ upsert/re-run safe
- มี parity-check script แล้วที่ `scripts/compare-postgres-orders-read.mjs` สำหรับเทียบผลลัพธ์ `orders list/detail` ระหว่างสองฐานก่อนเปิด read flag จริง

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

1. `settings`
2. `products`
3. `orders` read
4. `orders` write
5. `stock` / `purchase orders`
6. `reports`

### Phase 5: Express-Ready Refactor

- แยก service signatures ให้ framework-agnostic
- ลดการอ้างอิง Next-specific API ใน business layer
- เตรียม controller layer ที่ reuse service เดิมได้

### Phase 6: Cutover

- ชี้ runtime หลักไป PostgreSQL
- ปิด path เดิมของ Turso/Drizzle ทีละส่วน
- รัน smoke tests ทุก flow สำคัญ

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
