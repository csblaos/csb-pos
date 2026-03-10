# All-Postgres Runtime Observe And Fallback Removal

เอกสารนี้ใช้สำหรับ phase หลังจากเปิด PostgreSQL runtime flags ครบตาม rollout plan แล้ว
โดยเน้น 2 เรื่อง:

1. observe ว่า runtime จริงนิ่งพอหรือยัง
2. ถอด Turso fallback paths ออกทีละก้อนอย่างปลอดภัย

## เป้าหมาย

- ทำให้ PostgreSQL เป็น runtime truth หลักของ `orders`, `purchase`, `inventory`, `reports`, และ `stock movements`
- กำหนดเกณฑ์ `zero fallback` ให้ชัดก่อนเริ่มลบ Turso paths
- ลดความเสี่ยงจากการถอด fallback เร็วเกินไป
- เตรียมทางไปสู่ phase `retire Turso/Drizzle runtime`

## Preconditions

ต้องครบทุกข้อ:

- purchase rollout ผ่านแล้ว:
  - `POSTGRES_PURCHASE_READ_ENABLED=1`
  - `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1`
  - `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1`
- inventory read rollout ผ่านแล้ว:
  - `POSTGRES_INVENTORY_READ_ENABLED=1`
- reports read rollout ผ่านแล้ว:
  - `POSTGRES_REPORTS_READ_ENABLED=1`
- orders read rollout ใช้งานจริงอยู่แล้ว:
  - `POSTGRES_ORDERS_READ_ENABLED=1`
- orders write rollout ผ่านครบทุก wave ที่ [docs/postgres-orders-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-orders-write-rollout-execution.md)
- stock movement rollout ผ่านแล้ว:
  - `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1`
- smoke / compare gates ผ่านครบ:
  - `npm run smoke:postgres:orders-write-suite`
  - `npm run smoke:postgres:purchase-suite`
  - `npm run smoke:postgres:inventory-read-gate`
  - `npm run smoke:postgres:reports-read-gate`
  - `npm run db:compare:postgres:orders-read`
  - `npm run db:compare:postgres:purchase-read`
  - `npm run db:compare:postgres:inventory`
  - `npm run db:compare:postgres:reports-read`

## สิ่งที่ต้อง Observe

### 1. Fallback Warnings

ต้องเฝ้าดู log ต่อไปนี้:

- `orders.read.pg`
- `purchase.read.pg`
- `inventory.read.pg`
- `reports.read.pg`
- `orders.write.pg`
- `purchase.write.pg`
- `stock.write.pg`

หลักการ:

- ถ้ามี fallback warning เกิดซ้ำใน canary traffic ถือว่ายังไม่พร้อมลบ fallback ของโดเมนนั้น
- ถ้ามี fallback warning ครั้งเดียว ให้หาต้นเหตุและ rerun smoke/compare ก่อนเดินต่อ

### 2. Data Parity

ต้อง rerun compare scripts หลังมี traffic จริง:

```bash
npm run db:compare:postgres:orders-read
npm run db:compare:postgres:purchase-read
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
```

ควรรัน:

- ก่อนเริ่ม observe window
- หลังเปิด runtime flags ครบ
- หลัง canary/UAT ชุดใหญ่
- ก่อนเริ่ม remove fallback ของแต่ละโดเมน

### 3. Business UAT

อย่างน้อยต้องมี canary flows จริง:

1. สร้าง `Walk-in จ่ายทันที`
2. สร้าง `Walk-in ค้างจ่าย`
3. online prepaid: `confirm_paid -> mark_packed -> mark_shipped`
4. online COD: `mark_packed -> mark_shipped -> confirm_paid`
5. COD return: `mark_cod_returned`
6. pickup unpaid: `mark_picked_up_unpaid -> confirm_paid`
7. cancel ทั้งเคส `RELEASE` และ `RETURN`
8. create PO แบบ `receiveImmediately=true`
9. receive PO จาก `ORDERED/SHIPPED -> RECEIVED`
10. manual stock movement แบบ `IN`, `OUT`, `ADJUST`
11. เปิด `/reports` และ export CSV/AP statement

## Zero-Fallback Criteria

ถือว่าโดเมนใดพร้อมลบ fallback เมื่อครบทุกข้อ:

1. ไม่มี fallback warning ของโดเมนนั้นต่อเนื่องตลอด observe window
2. compare script ของโดเมนนั้นผ่านหลังมี traffic จริง
3. manual UAT ของโดเมนนั้นผ่าน
4. ไม่มี incident เรื่อง state mismatch / stock mismatch / totals mismatch

observe window ที่แนะนำ:

- staging: อย่างน้อย 1 วันทำการหลังเปิดครบ
- production canary: อย่างน้อย 2-3 รอบงานจริงของทีม

## ลำดับ Remove Fallback ที่แนะนำ

### Wave 1: Reports Read

เริ่มจาก:

- [lib/reports/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/reports/queries.ts)

เหตุผล:

- เป็น read-only domain
- parity script ครอบอยู่แล้ว
- rollback ง่ายที่สุด

### Wave 2: Purchase Read

ถัดไป:

- [lib/purchases/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/purchases/queries.ts)

เงื่อนไขเพิ่ม:

- purchase list/detail/pending-rate ต้องนิ่ง
- PO print/detail ต้องไม่ stale

### Wave 3: Inventory Read

ถัดไป:

- [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts)

เงื่อนไขเพิ่ม:

- `/stock` และ stock state ใน order detail ต้องตรงกันตลอด
- inventory parity หลัง canary traffic ต้องนิ่ง

### Wave 4: Orders Read

ถัดไป:

- [lib/orders/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/queries.ts)

เงื่อนไขเพิ่ม:

- `/orders` และ `/orders/[orderId]` ต้องไม่เกิด fallback warning
- QR accounts ในหน้า detail ต้องยังโหลดได้ครบ

### Wave 5: Write Fallbacks

ปิดท้ายด้วย:

- [lib/orders/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/postgres-write.ts)
- [lib/purchases/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/purchases/postgres-write.ts)
- [lib/inventory/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/postgres-write.ts)

หลักการ:

- ถอดทีละกลุ่ม action
- หลังถอดแต่ละกลุ่ม ต้อง rerun smoke suite และ manual canary ซ้ำ
- อย่าถอด write fallbacks ทั้งหมดใน commit เดียว

## Suggested Execution Order

1. remove reports read fallback
2. observe 1 window
3. remove purchase read fallback
4. observe 1 window
5. remove inventory read fallback
6. observe 1 window
7. remove orders read fallback
8. observe 1 window
9. remove stock/purchase/orders write fallbacks เป็น wave

## Rollback Rules

ถ้าถอด fallback ของโดเมนใดแล้วมีปัญหา:

1. revert change ของโดเมนนั้นทันที
2. รัน smoke suite ที่เกี่ยวข้อง
3. รัน compare script ของโดเมนนั้น
4. ตรวจ log + record ids ของเคสที่ mismatch
5. อย่าถอด fallback ของ wave ถัดไปจนกว่าจะหาต้นเหตุได้

## Exit Criteria

phase นี้ถือว่าสำเร็จเมื่อ:

- runtime หลักทั้งหมดวิ่ง PostgreSQL โดยไม่ต้องใช้ Turso fallback paths
- compare scripts ยังผ่าน
- smoke suites ยังผ่าน
- `/orders`, `/stock`, `/reports`, `/stock?tab=purchase` ใช้งานจริงได้ปกติ
- Turso เหลือบทบาทเฉพาะ legacy/runtime ที่ยังไม่ได้ decommission อย่างชัดเจน

## Recommended Next Phase

หลังจาก phase นี้ ควรทำ `Turso/Drizzle retirement plan`

ขอบเขตที่ควรรวม:

- ถอด env/runtime dependency ของ Turso ออกจาก production path
- แยกว่าตาราง/queries ไหนยังต้องพึ่ง Drizzle อยู่
- วางแผนลบ fallback code, legacy repository paths, และ migration tooling ที่ไม่ใช้แล้ว
- เตรียมเส้นทางย้าย transport layer ต่อไปสำหรับ `Express + TypeScript`
