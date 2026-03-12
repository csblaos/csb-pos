# Handoff

## Current State

- runtime app เป็น `PostgreSQL-only`
- tooling ปัจจุบันเป็น `PostgreSQL-only`
- Turso/LibSQL/Drizzle ถูกถอดออกจาก workflow ปัจจุบันแล้ว
- rollout flags กลุ่ม `POSTGRES_*_ENABLED` ถูกถอดออกจาก runtime/env แล้ว
- env PostgreSQL ปัจจุบันคงไว้เฉพาะ `POSTGRES_DATABASE_URL`, `POSTGRES_SSL_MODE`, และ `POSTGRES_SSL_REJECT_UNAUTHORIZED`; ค่า pool/log ใช้ default ในโค้ด
- `TURSO_DATABASE_URL` และ `TURSO_AUTH_TOKEN` ถูกลบออกจาก env ปัจจุบันแล้ว เพื่อไม่ให้สับสนว่า runtime ยังพึ่ง Turso อยู่
- dashboard daily metrics ใน [server/repositories/dashboard.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/dashboard.repo.ts) ถูกแก้ให้ cast `paid_at` / `created_at` จาก `text` เป็น `timestamptz` ก่อนเทียบช่วงวัน เพื่อแก้ `operator does not exist: text >= timestamp without time zone`
- baseline PostgreSQL ถูกเติมตาราง `shipping_providers` แล้วใน [postgres/migrations/0009_shipping_providers_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0009_shipping_providers_foundation.sql) พร้อม seed ค่า default ของร้านเดิม (`Houngaloun`, `Anousith`, `Mixay`) เพื่อให้หน้า orders/settings ไม่ชน `relation "shipping_providers" does not exist`
- query ฝั่ง PostgreSQL ที่ส่ง list ผ่าน Sequelize replacements ถูกเก็บแนวทางแล้วว่าให้ใช้ `in (:ids)` ไม่ใช้ `= any(:ids)` ถ้าไม่ได้ cast เป็น array จริง; ล่าสุดแก้เคส `product_units` ใน [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts) และ bulk COD reconcile lookup ใน [lib/orders/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/postgres-write.ts)
- หน้า orders list ถูกแก้ badge ซ้ำแล้วใน [components/app/orders-management.tsx](/Users/csl-dev/Desktop/alex/csb-pos/components/app/orders-management.tsx) โดย dedupe badge ตาม `label + className` เพื่อกัน React key collision กรณีได้ badge `ชำระแล้ว` ซ้ำ
- schema source of truth คือ [postgres/migrations/](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/)
- route handlers หลักเริ่มถูกจัดรูปแบบให้ไปทาง `parse -> build context -> call service -> map response`
- โปรเจกต์อยู่ในสถานะ `พร้อมพัฒนาฟีเจอร์ POS ต่อ`

## Recent Changes

- ลบ Turso/LibSQL/Drizzle runtime และ tooling ออกจาก repo
- ลบ legacy schema layer เดิมของ LibSQL/Drizzle ออกจาก repo แล้ว
- ถอด dependency `drizzle-orm`, `@libsql/client`, `drizzle-kit`
- ลด runbook หลักให้เป็น PostgreSQL-first และ mark เอกสาร migration เก่าเป็น historical
- เพิ่ม transport helper กลางที่ [lib/http/route-handler.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/http/route-handler.ts)
- เพิ่ม idempotency route helper กลางในไฟล์เดียวกัน เพื่อลด branch ซ้ำของ replay/processing/conflict
- refactor route ใหญ่ให้ใช้ helper นี้แล้วใน:
  - [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts)
  - [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts)
  - [app/api/stock/movements/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/movements/route.ts)
  - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
  - [app/api/settings/account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts)
- ใน [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts) แยก helper local สำหรับ `completeOrderAction(...)` และ `toOrderMutationItems(...)` เพื่อลดโค้ดซ้ำของ success/idempotency/cache invalidation
- ใน [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) แยก dispatch `patchStoreSettings(...)` และ helper audit กลาง เพื่อให้ route หลักเหลือการเลือก transport path (`json`/`multipart`) มากขึ้น
- ใน [app/api/stock/movements/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/movements/route.ts) แยก helper `failStockMovementRequest(...)` เพื่อรวม path ของ `safeMarkIdempotencyFailed + safeLogAuditEvent + error response` และทำให้ POST route เหลือ branch หลักอ่านง่ายขึ้น
- ใน [components/app/orders-cod-reconcile.tsx](/Users/csl-dev/Desktop/alex/csb-pos/components/app/orders-cod-reconcile.tsx) เพิ่ม quick action `ตีกลับ` รายออเดอร์แล้ว โดยใช้ `SlideUpSheet` ในหน้าเดียวสำหรับกรอก `ค่าตีกลับ` + `หมายเหตุ` และยิง `PATCH /api/orders/[orderId]` (`action=mark_cod_returned`) แทนการบังคับให้ผู้ใช้ไปหน้า order detail ก่อน
- ใน [components/app/orders-management.tsx](/Users/csl-dev/Desktop/alex/csb-pos/components/app/orders-management.tsx) เพิ่ม multi-select แบบจำกัดเฉพาะออเดอร์ออนไลน์ที่ `แพ็กได้จริง` แล้ว ทั้ง mobile card list และ desktop table พร้อม bulk action bar + `SlideUpSheet` ยืนยัน ก่อนยิง `PATCH /api/orders/[orderId]` (`action=mark_packed`) ทีละรายการจากหน้า `/orders`; เคส `ลูกค้าหน้าร้าน` จะไม่แสดง checkbox สำหรับแพ็ก
- ใน [components/app/orders-management.tsx](/Users/csl-dev/Desktop/alex/csb-pos/components/app/orders-management.tsx) ขยาย bulk action bar ให้รองรับ `จัดส่งแล้ว` แล้ว โดย reuse selection ชุดเดียวกับ bulk pack แต่จำกัดเฉพาะ `ออเดอร์ออนไลน์` ที่สถานะ `PACKED` และมี `shippingProvider/shippingCarrier + trackingNo` ครบ; ปุ่ม `แพ็ก` และ `จัดส่ง` จะทำงานเฉพาะ subset ที่พร้อมสำหรับ action นั้น ไม่ปะปนกับรายการที่เลือกไว้เพื่อ action อื่น
- ใน [components/app/orders-management.tsx](/Users/csl-dev/Desktop/alex/csb-pos/components/app/orders-management.tsx) เพิ่มเมนู `3 จุด` ต่อออเดอร์แล้วสำหรับ secondary actions บนหน้า `/orders` โดยใช้ print pages เดิม (`/orders/[orderId]/print/receipt`, `/orders/[orderId]/print/label`) แทนการ reuse preview state จาก success sheet; action ในเมนูคือ `เปิดรายละเอียด`, `พิมพ์ใบเสร็จ`, และ `พิมพ์สติ๊กเกอร์` (เฉพาะออเดอร์ออนไลน์)
- ใน [app/(app)/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/page.tsx) ลด overfetch ตอนเข้าเมนู stock แล้ว โดย server จะ fetch เฉพาะ data ของ active tab และใช้ `StockTabLoadingState` เป็น placeholder ให้แท็บอื่น จึงลด latency ตอนกด bottom nav เข้า `/stock`
- เพิ่ม request-scoped app shell helper ที่ [lib/app-shell/context.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/app-shell/context.ts) และให้ [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx), [app/(app)/dashboard/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/dashboard/page.tsx), [app/(app)/orders/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/orders/page.tsx), [app/(app)/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/page.tsx), และ [app/(app)/reports/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/reports/page.tsx) ใช้ก้อน `session/systemRole/permissionKeys/activeStoreProfile` ร่วมกันแล้ว เพื่อลด query ซ้ำเวลาเปลี่ยนเมนูหลัก
- ใน [lib/orders/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/queries.ts) แยก `getOrderCatalogForStore(...)` เป็น static cached payload + live balances แล้ว เพื่อให้ `/orders` ได้ประโยชน์จาก cache สำหรับ data ที่เปลี่ยนไม่บ่อย โดยไม่ทำให้ available stock stale

## Verification

- `npm run lint`
- `npm run build`

ทั้งสองคำสั่งผ่านหลัง phase ล่าสุด

## Historical Records

- handoff log เดิมถูก archive ไว้ที่ [docs/archive/HANDOFF_HISTORY.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/archive/HANDOFF_HISTORY.md)
- runbook/history ที่ยังคงไว้เป็น reference:
  - [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md)
  - [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md)
  - [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## Next Phase

- `Express readiness cleanup`
- เป้าหมายคือทำ route layer ให้บางลงอีก โดยคง business logic ไว้ใน service/repository:
  - parse request
  - build request context
  - call service/use-case
  - map domain error -> HTTP response
- ก้อนที่ควรเก็บต่อ:
  - [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts)
  - [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts)
  - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
  - phase ถัดไปที่คุ้มสุดคือเพิ่ม `domain error -> HTTP response` mapper กลาง แล้วค่อยเก็บ route ที่ยังหนาอยู่ฝั่ง orders/create และ settings/store ให้บางลงอีก
