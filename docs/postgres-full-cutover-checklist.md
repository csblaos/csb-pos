# PostgreSQL Full Cutover Checklist

> Historical reference: cutover checklist นี้ถูกเก็บไว้เป็นบันทึก migration แล้ว ปัจจุบัน runtime/tooling ของ repo เป็น PostgreSQL-only

เอกสารนี้เคยเป็น source of truth สำหรับการย้าย runtime จาก `Turso/LibSQL` ไป `Aiven PostgreSQL`
แบบครบระบบ โดยแยกชัดว่า:

- อะไร `รองรับ PostgreSQL แล้ว`
- อะไร `เปิดใช้งาน PostgreSQL แล้ว`
- อะไร `ยังใช้ Turso อยู่จริง`
- ต้องเปิด flag อะไรใน phase ถัดไป
- เมื่อไรถึงควรถอด fallback/Turso ออก

## เป้าหมาย

- ให้ order / purchase / inventory / reports ใช้ PostgreSQL เป็น source of truth
- ลดบทบาท Turso เหลือ fallback ชั่วคราว
- ปิด fallback ทีละก้อนหลัง observe ผ่านจริง
- ใช้ `npm run smoke:postgres:all-postgres-observe-gate` เป็น gate กลางก่อนเริ่ม zero-fallback observe และก่อนถอด fallback แต่ละ wave
- เตรียมทางสำหรับ decommission `Drizzle + Turso` ในโดเมนหลัก

## Runtime Note (ล่าสุด)

- dev machine นี้อยู่ในสถานะ `PostgreSQL-first`
- top-level import ของ `@/lib/db/client` ใน runtime ถูกเก็บจนเหลือ `0` ไฟล์แล้ว
- [server/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/db/client.ts) ถูกลบแล้ว
- [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) ยังอยู่เป็น lazy legacy path สำหรับ fallback/tooling บางส่วน แต่ไม่ยิง health probe ตอน import แล้ว
- phase cutover ฝั่ง runtime จบแล้ว; sections ด้านล่างถูกคงไว้เป็น migration history

## Current Runtime Status

### เปิด PostgreSQL ใช้งานแล้วบนเครื่องนี้

| Domain | Flow / Endpoint | Status |
| --- | --- | --- |
| Orders Read | `/orders`, `/orders/[orderId]`, QR accounts ในหน้า detail | `POSTGRES_ORDERS_READ_ENABLED=1` |
| Reports Read | `/reports`, AP summary/statement, outstanding CSV export | `POSTGRES_REPORTS_READ_ENABLED=1` |
| Orders Write | `PATCH /api/orders/[orderId]` action `update_shipping` | `POSTGRES_ORDERS_WRITE_UPDATE_SHIPPING_ENABLED=1` |
| Orders Write | `PATCH /api/orders/[orderId]` action `submit_payment_slip` | `POSTGRES_ORDERS_WRITE_SUBMIT_PAYMENT_SLIP_ENABLED=1` |

### รองรับ PostgreSQL แล้ว แต่ยังปิดอยู่

| Domain | Flow / Endpoint | Flag |
| --- | --- | --- |
| Auth / RBAC Read | app shell, session membership, system role, permission checks, branches access | `POSTGRES_AUTH_RBAC_READ_ENABLED=0` |
| Branches / Branch Policy | global branch policy, branch creation policy, branch list/create, branch switch, member branch access | `POSTGRES_BRANCHES_ENABLED=0` |
| Settings / System Admin Read | system-admin dashboard, superadmin list, store creation policy, superadmin overview/global-config helpers | `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=0` |
| Settings / System Admin Write | superadmin create/update, system-admin config users/stores update, session/logo/payment policy update | `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=0` |
| Store Settings / Payment Accounts Read | store profile/financial/pdf reads, store payment accounts list, payment account QR image metadata | `POSTGRES_STORE_SETTINGS_READ_ENABLED=0` |
| Store Settings Write | store profile multipart/logo update, financial JSON update, PDF config update | `POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0` |
| Store Payment Accounts Write | store payment accounts create/update/delete | `POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0` |
| Notifications | inbox read/actions, mute-snooze rules, AP reminder cron sync | `POSTGRES_NOTIFICATIONS_ENABLED=0` |
| Products / Units / Onboarding Read | products page, units/categories list, onboarding channel status + store-type read | `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=0` |
| Products / Units / Onboarding Low-Risk Write | units, product categories, onboarding channel connect | `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=0` |
| Products Write | product CRUD, variant persistence, image url update/remove, cost update audit | `POSTGRES_PRODUCTS_WRITE_ENABLED=0` |
| Purchase Read | purchase list/detail/pending-rate | `POSTGRES_PURCHASE_READ_ENABLED=0` |
| Inventory Read | stock balances / order stock state | `POSTGRES_INVENTORY_READ_ENABLED=0` |
| Stock Write | `POST /api/stock/movements` | `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=0` |
| Purchase Write | create PO with `receiveImmediately=true` | `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=0` |
| Purchase Write | receive PO via status transition `RECEIVED` | `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0` |
| Orders Write | `POST /api/orders` | `POSTGRES_ORDERS_WRITE_CREATE_ENABLED=0` |
| Orders Write | `submit_for_payment` | `POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=0` |
| Orders Write | `confirm_paid` | `POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=0` |
| Orders Write | `mark_picked_up_unpaid` | `POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=0` |
| Orders Write | `cancel` | `POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=0` |
| Orders Write | `mark_cod_returned` | `POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=0` |
| Orders Write | `mark_packed` | `POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=0` |
| Orders Write | `mark_shipped` | `POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=0` |

### ยังใช้ Turso อยู่จริงใน runtime ตอนนี้

สิ่งต่อไปนี้ยังถือว่า Turso เป็น source of truth เพราะ flag PostgreSQL ยังไม่ถูกเปิด:

1. purchase read ทั้งหมด
2. inventory read ทั้งหมด
3. products/units/onboarding read ทั้งหมด
4. branches runtime ทั้งหมด
5. notifications runtime ทั้งหมด
6. settings/system-admin write ทั้งหมด
7. products write หลัก (`products`, `variant persistence`) และ onboarding/store create
8. manual stock movement write
9. PO receive writes
10. order create
11. order lifecycle writes เกือบทั้งหมด ยกเว้น `update_shipping` กับ `submit_payment_slip`

## Phase Plan

### Phase 1: Purchase Runtime Rollout

เป้าหมาย:
- ทำให้ purchase read/write ใช้ PostgreSQL จริง

เปิด flags:

```env
POSTGRES_PURCHASE_READ_ENABLED=1
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1
```

ต้องผ่าน:
- `npm run smoke:postgres:purchase-suite`
- `npm run db:compare:postgres:purchase-read`
- purchase canary บน staging:
  - create PO with `receiveImmediately=true`
  - receive existing PO
  - pending-rate queue
  - purchase detail / print

เสร็จแล้วจะลด Turso ในโดเมน:
- purchase read
- purchase receive write

### Phase 1.4: Branches Runtime Rollout

เป้าหมาย:
- ทำให้ branch policy + branches runtime ใช้ PostgreSQL จริงก่อน rollout store/platform domains ที่พึ่งสาขาโดยตรง

เปิด flag:

```env
POSTGRES_BRANCHES_ENABLED=1
```

ต้องผ่าน:
- `npm run db:compare:postgres:branches`
- canary บน staging:
  - GET/PATCH `/api/system-admin/config/branch-policy`
  - GET/POST `/api/stores/branches`
  - POST `/api/stores/branches/switch`
  - PATCH `/api/settings/users/[userId]` action `set_branch_access`

เสร็จแล้วจะลด Turso ในโดเมน:
- branch policy read/write
- branches read/write
- member branch access runtime

### Phase 1.5: Products/Units/Onboarding Low-Risk Write Rollout

เป้าหมาย:
- ทำให้ `units`, `product categories`, และ onboarding channel connect ใช้ PostgreSQL write path จริง

เปิด flag:

```env
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=1
```

ต้องผ่าน:
- `npm run smoke:postgres:products-units-onboarding-write-gate`
- canary บน staging:
  - units create/update/delete
  - categories create/update/delete
  - onboarding Facebook/WhatsApp connect

เสร็จแล้วจะลด Turso ในโดเมน:
- units write
- category write
- onboarding channel connect write

### Phase 1.6: Products Write Rollout

เป้าหมาย:
- ทำให้ product CRUD + variant persistence ใช้ PostgreSQL write path จริง

เปิด flag:

```env
POSTGRES_PRODUCTS_WRITE_ENABLED=1
```

ต้องผ่าน:
- `npm run smoke:postgres:products-write-gate`
- `npm run smoke:postgres:products-write`
- `npm run db:compare:postgres:product-variants-foundation`
- canary บน staging:
  - create product
  - update product + variant
  - set active
  - update cost
  - remove/update image url

เสร็จแล้วจะลด Turso ในโดเมน:
- product CRUD write
- variant persistence write

### Phase 2: Inventory Read Truth

เป้าหมาย:
- ให้ stock state ที่หน้า `/stock` และ `/orders/[orderId]` อ่านจาก PostgreSQL จริง

เปิด flag:

```env
POSTGRES_INVENTORY_READ_ENABLED=1
```

ต้องผ่าน:
- `npm run smoke:postgres:inventory-read-gate`
- `npm run db:compare:postgres:inventory`
- canary UAT:
  - reserve / out / release / return
  - stock list
  - order stock state
  - PO receive impact on stock

เสร็จแล้วจะลด Turso ในโดเมน:
- inventory read
- order stock-state reads

### Phase 3: Orders Write Rollout

เป้าหมาย:
- ให้ order lifecycle ใช้ PostgreSQL transaction path เป็นหลัก

ลำดับที่แนะนำ:

#### Wave A

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
```

#### Wave B

```env
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
```

#### Wave C

```env
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=1
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=1
```

#### Wave D

```env
POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=1
POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=1
```

เหตุผล:
- `confirm_paid` และ `submit_for_payment` แตะ stock movement และ state transition หนักสุด
- จึงควรเปิดหลัง purchase + inventory truth นิ่งแล้ว

ต้องผ่าน:
- `npm run smoke:postgres:orders-write-suite`
- canary flows:
  - online prepaid
  - online COD
  - pickup unpaid
  - cancel reserve
  - cancel after out

เสร็จแล้วจะลด Turso ในโดเมน:
- order create
- order lifecycle write ส่วนใหญ่

### Phase 4: Stock Movement Runtime Rollout

เป้าหมาย:
- ปิด gap ของ movement producer นอก order/purchase routes

เปิด flag:

```env
POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1
```

ต้องผ่าน:
- `npm run smoke:postgres:stock-movement`
- manual UAT ของ stock adjustment / in / out

เสร็จแล้วจะลด Turso ในโดเมน:
- manual stock movement write

### Phase 5: Observe All-Postgres Runtime

เงื่อนไข:
- flags ของ purchase, inventory, reports, และ orders write ถูกเปิดครบตาม phase ข้างต้น
- compare scripts ทุกก้อนยังผ่าน
- smoke suites ทุกก้อนยังผ่าน
- ไม่มี fallback warnings ต่อเนื่องจาก:
  - `orders.read.pg`
  - `purchase.read.pg`
  - `inventory.read.pg`
  - `reports.read.pg`
  - `orders.write.pg`
  - `purchase.write.pg`
  - `stock.write.pg`

สิ่งที่ต้องทำ:
- observe log ภายใต้ traffic จริง
- snapshot ตัวเลข `/reports`
- re-run compare scripts หลังมี canary traffic

### Phase 6: Remove Fallback Paths

เริ่มถอด fallback ในลำดับนี้:

1. reports read fallback
   สถานะล่าสุด: เริ่มแล้วใน dev และ [lib/reports/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/reports/queries.ts) ไม่ใช้ Turso runtime branch แล้ว
2. purchase read fallback
   สถานะล่าสุด: เริ่มแล้วใน dev และ [lib/purchases/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/purchases/queries.ts) / [server/services/purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts) ไม่ใช้ Turso read fallback แล้ว
3. inventory read fallback
   สถานะล่าสุด: เริ่มแล้วใน dev และ [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts) ไม่ใช้ Turso read fallback แล้วใน inventory balances + order stock state path
4. order read fallback
   สถานะล่าสุด: เริ่มแล้วใน dev และ [lib/orders/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/queries.ts) ไม่ใช้ Turso read fallback แล้วใน orders list/detail และ QR accounts path
5. stock/purchase/order write fallback
   สถานะล่าสุด: เริ่มแล้วใน dev ที่ `stock movement write`, `purchase write`, และ `orders write`; [server/services/stock.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/stock.service.ts) ไม่ fallback กลับ Turso transaction path แล้วใน `postStockMovement()`, purchase receive branches ไม่ fallback แล้ว, และ [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts) / [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts) ไม่ fallback กลับ Turso แล้วเมื่อเข้า PostgreSQL write branches

ไฟล์หลักที่ต้องทยอย clean:
- `lib/reports/queries.ts`
- `lib/purchases/queries.ts`
- `lib/inventory/queries.ts`
- `lib/orders/queries.ts`
- `lib/orders/postgres-write.ts`
- `lib/purchases/postgres-write.ts`
- `lib/inventory/postgres-write.ts`

### Phase 7: Turso Retirement

ทำเมื่อ:
- runtime หลักไม่พึ่ง Turso แล้ว
- fallback usage เป็นศูนย์หรือใกล้ศูนย์ต่อเนื่อง
- compare scripts และ smoke suite ผ่านหลังปิด fallback

งานใน phase นี้:
1. ปิด env Turso ใน runtime environments
2. ถอด Drizzle/Turso read-write paths ในโดเมนหลัก
3. เก็บ Turso/Drizzle ไว้เฉพาะ migration legacy ชั่วคราวถ้ายังจำเป็น
4. วางแผน cleanup dependencies และ docs

## Recommended Command Checklist

ก่อนเปิดแต่ละ phase ให้รันอย่างน้อย:

```bash
npm run db:check:postgres
npm run db:migrate:postgres
npm run db:compare:postgres:orders-read
npm run db:compare:postgres:purchase-read
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
npm run smoke:postgres:orders-write-suite
npm run smoke:postgres:purchase-suite
npm run smoke:postgres:inventory-read-gate
npm run smoke:postgres:reports-read-gate
npm run lint
npm run build
```

## Practical Recommendation

ถ้าจะขยับจากสถานะปัจจุบันไป `all PostgreSQL` อย่างปลอดภัย ให้ทำตามลำดับนี้:

1. purchase runtime rollout
2. inventory read rollout
3. order write rollout ที่ยังปิด
4. stock movement rollout
5. observe ทั้งระบบ
6. remove fallback paths
7. retire Turso

ลำดับนี้สำคัญกว่า “เปิดให้หมดเร็ว” เพราะถ้าเปิด order/payment writes ก่อน inventory truth นิ่ง จะเกิดปัญหา data คนละโลกและ rollback ยากมาก
