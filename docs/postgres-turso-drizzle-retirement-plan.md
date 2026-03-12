# Turso/Drizzle Retirement Plan

> Historical reference: retirement plan นี้ถูกเก็บไว้เป็นบันทึก migration หลัง runtime/tooling หลักย้ายเป็น PostgreSQL-only แล้ว

เอกสารนี้ใช้สำหรับ phase สุดท้ายของการย้ายจาก `Turso/LibSQL + Drizzle` ไป `Aiven PostgreSQL + Sequelize query-first`
หลังจาก runtime หลักวิ่งบน PostgreSQL จริงและผ่านช่วง observe/fallback removal แล้ว

## เป้าหมาย

- ถอน `Turso` ออกจาก runtime path หลัก
- ถอน `Drizzle` จาก read/write paths ของโดเมนหลัก
- คงเหลือเฉพาะ legacy tooling ที่ยังต้องใช้จริงในช่วงสั้น
- เตรียม codebase ให้พร้อมสำหรับ phase ถัดไป เช่น `Express + TypeScript`

## Preconditions

ต้องครบทุกข้อ:

- phase ใน [docs/postgres-all-postgres-observe-fallback-removal.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-all-postgres-observe-fallback-removal.md) ผ่านแล้ว
- ไม่มี fallback warnings ซ้ำจาก:
  - `orders.read.pg`
  - `purchase.read.pg`
  - `inventory.read.pg`
  - `reports.read.pg`
  - `orders.write.pg`
  - `purchase.write.pg`
  - `stock.write.pg`
- compare scripts ผ่านหลังมี traffic จริง:
  - `npm run db:compare:postgres:orders-read`
  - `npm run db:compare:postgres:purchase-read`
  - `npm run db:compare:postgres:inventory`
  - `npm run db:compare:postgres:reports-read`
- smoke suites ผ่าน:
  - `npm run smoke:postgres:orders-write-suite`
  - `npm run smoke:postgres:purchase-suite`
  - `npm run smoke:postgres:inventory-read-gate`
  - `npm run smoke:postgres:reports-read-gate`
- fallback paths ใน `orders`, `purchase`, `inventory`, `reports`, และ write layers ถูกถอดแล้วหรืออยู่ในสถานะพร้อมถอดทันที
- มี runtime audit ล่าสุดที่ [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## สิ่งที่ยังมักผูกกับ Turso/Drizzle

ต้อง audit ให้ชัดก่อนเริ่ม:

1. `lib/db/client.ts`
2. `server/repositories/` และ lazy helpers ที่ยังเรียก Drizzle/Turso โดยตรง
3. route/service ที่ยัง import `db` จาก Turso path
4. schema/type helpers ที่ยังผูกกับ Drizzle runtime (ถ้ามี)
5. legacy config/scripts/migrations ที่ยังจำเป็นต่อ tooling ในช่วงนั้น
6. env vars legacy ของช่วง migration

ผล audit ล่าสุดถูกรวบไว้ที่:

- [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## Retirement Waves

### Wave 1: Remove Runtime Dependency

ขอบเขต:

- หยุดให้ runtime หลัก import หรือ initialize Turso client
- ย้าย code paths ที่ยัง fallback ไป Turso ออกทั้งหมด
- ปิด feature flags ที่มีหน้าที่ fallback เท่านั้น

สิ่งที่ต้องทำ:

1. audit imports ของ `lib/db/client.ts`
2. ไล่ลบการเรียก Turso ใน:
   - routes
   - services
   - repositories
   - query helpers
3. ลบ wrappers ที่ไม่จำเป็น เช่น `server/db/client.ts`
4. ปรับ `lib/db/client.ts` ไม่ให้มี import-time side effects
3. ยืนยันว่า build/runtime ใช้ PostgreSQL path โดยไม่ probe Turso

exit criteria:

- `build` ไม่ควรมี Turso init/probe logs จาก import graph ของ runtime path หลักอีก
- `rg "lib/db/client"` และจุดเรียก Turso เหลือเฉพาะ legacy tooling ที่ตั้งใจคงไว้

สถานะล่าสุด:

- runtime import graph ถูกเก็บจนไม่เหลือ top-level import ของ `@/lib/db/client` แล้ว
- [server/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/db/client.ts) ถูกลบออกจาก runtime แล้ว
- runtime callers ของ `getTursoDb()` ใน `app/lib/server` เหลือ `0`
- [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ถูกลบแล้ว เพราะไม่มี runtime caller เหลือ
- [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) เหลือไว้เฉพาะ legacy tooling path
- wave นี้ถือว่า `complete` ใน dev runtime แล้ว

### Wave 2: Remove Drizzle Repositories From Core Domains

ขอบเขต:

- `orders`
- `purchase`
- `inventory`
- `reports`

สิ่งที่ต้องทำ:

1. audit `server/repositories/` และ helper ที่ยังผูก Drizzle
2. ลบหรือ archive repository paths ที่ไม่ถูกใช้งานแล้ว
3. ย้าย type dependencies ที่จำเป็นออกจาก Drizzle schema runtime

exit criteria:

- core domains ข้างต้นไม่พึ่ง Drizzle runtime แล้ว
- เหลือ Drizzle ได้เฉพาะ tooling/schema reference ชั่วคราว

### Wave 3: Env And Ops Cleanup

ขอบเขต:

- `.env.example`
- deploy/staging/prod env docs
- scripts/ops docs

สิ่งที่ต้องทำ:

1. ทำ `POSTGRES_*` เป็น env หลัก
2. ลด/ถอด `TURSO_*` จาก runtime environments
3. อัปเดต runbooks และ handoff ให้ไม่อ้าง Turso เป็น primary path

exit criteria:

- deployment ใหม่ไม่ต้องพึ่ง `TURSO_*` เพื่อให้ app หลักรันได้
- docs/runtime config ใช้ PostgreSQL เป็นค่าเริ่มต้นทั้งหมด

### Wave 4: Migration Tooling Decision

ต้องตัดสินใจให้ชัด:

สถานะล่าสุด:

- phase นี้เสร็จแล้ว
- `legacy/drizzle/`, `legacy/drizzle.config.ts`, `lib/db/schema/*`, และ dependency `drizzle-orm` ถูกลบออกแล้ว
- PostgreSQL schema/migrations เป็น source of truth เดียวของ repo

### Wave 5: Final Turso Retirement

สิ่งที่ต้องทำ:

1. ถอน Turso secrets จาก runtime environments
2. ปิด monitor/alerts ที่ผูกกับ Turso
3. archive หรือ decommission Turso database ตามนโยบายทีม
4. บันทึกวัน retirement ชัดเจนใน handoff/decision log

## Suggested Execution Order

1. audit runtime imports ที่ยังแตะ Turso/Drizzle
2. freeze Turso ให้เป็น legacy tooling only
3. remove Drizzle repositories from core domains
4. cleanup env/ops docs
5. scrub historical docs ที่ยังอ้าง Drizzle/Turso path เก่า
6. retire Turso infra จริง

## Validation Commands

```bash
rg "lib/db/client|TURSO_DATABASE_URL|TURSO_AUTH_TOKEN|from \\\"@/lib/db/client\\\"|from '@/lib/db/client'" .
npm run lint
npm run build
```

ควรเสริมด้วย:

- smoke suites หลักทั้งหมด
- compare scripts หลักทั้งหมด

## Rollback Rules

ถ้าถอด Turso/Drizzle แล้ว runtime เพี้ยน:

1. restore wave ล่าสุดทันที
2. ตรวจ import graph ของโดเมนที่เพี้ยน
3. rerun smoke/compare ของโดเมนนั้น
4. อย่าขยับไป wave ถัดไปจนกว่าจะไม่มี hidden dependency ค้างอยู่

## Exit Criteria

phase นี้ถือว่าสำเร็จเมื่อ:

- runtime หลักของ app ไม่ใช้ Turso แล้ว
- core domains ไม่พึ่ง Drizzle runtime แล้ว
- env/runtime docs ชี้ PostgreSQL เป็นค่าเริ่มต้นทั้งหมด
- Turso เหลือเพียง archive/legacy state ตามนโยบายทีม หรือถูก decommission แล้ว

## Recommended Next Phase

หลังจาก phase นี้ ควรทำ `Express readiness plan`

ขอบเขตที่ควรรวม:

- audit transport adapters ที่ยังผูก Next.js
- แยก controller/service boundary ให้ชัดขึ้น
- ระบุ routes/domains ที่ย้ายไป Express ได้ก่อน
- วางแผน coexistence ระหว่าง Next App Router UI กับ Express API
