# PostgreSQL Inventory/Reporting Cutover Plan

เอกสารนี้ใช้วางแผน cutover หลังจาก phase `orders write`, `purchase read/write`, และ `inventory read` พร้อมใช้งานบน PostgreSQL แล้ว

## เป้าหมาย

- ทำให้ inventory/reporting ใช้ PostgreSQL เป็น read truth หลัก
- ลดการพึ่ง Turso สำหรับโดเมน stock/order/purchase ลงทีละก้อน
- หลีกเลี่ยง big-bang cutover ที่ทำให้ rollback ยาก

## หลักการ

1. ไม่ถอด Turso ทันทีหลังเปิด `POSTGRES_INVENTORY_READ_ENABLED=1`
2. ใช้ `shadow + compare + canary` ก่อนเปลี่ยน source of truth ต่อโดเมน
3. ตัดก้อน `inventory/reporting` ก่อน แล้วค่อยไปก้อน read อื่นที่ยังไม่ critical น้อยกว่า
4. คง fallback warnings และ compare scripts ไว้จนกว่าจะผ่านช่วง observe หลัง cutover

## Preconditions

ต้องครบทุกข้อ:

- `POSTGRES_ORDERS_READ_ENABLED=1` ใช้งานจริงนิ่งแล้ว
- purchase rollout ผ่านครบ:
  - `POSTGRES_PURCHASE_READ_ENABLED=1`
  - `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1`
  - `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1`
- inventory read rollout ผ่านแล้ว:
  - `POSTGRES_INVENTORY_READ_ENABLED=1`
- `npm run smoke:postgres:cutover-gate` ผ่าน
- ไม่มี fallback warnings ต่อเนื่องจาก:
  - `orders.read.pg`
  - `purchase.read.pg`
  - `inventory.read.pg`
- compare parity ยังผ่านหลังมี traffic จริง

## Scope ของ Cutover นี้

### รวมอยู่ในก้อนนี้

- stock inventory list / stock state reads
- order stock state ที่หน้า detail ใช้ตัดสิน action
- purchase pending-rate queue
- reports ที่พึ่ง order/purchase/inventory aggregates

### ยังไม่รวมในก้อนนี้

- auth/session
- settings/read paths ที่ยังไม่ migrate
- notification/inbox flows
- system-admin/config reads
- การ decommission Drizzle/Turso ทั้งระบบ

## Cutover Waves

### Wave 1: Inventory Read Truth

สถานะเป้าหมาย:

```env
POSTGRES_INVENTORY_READ_ENABLED=1
```

สิ่งที่ต้องเฝ้า:

- หน้า `/stock`
- หน้า `/orders/[orderId]`
- PO receive flows ที่กระทบ stock/cost

exit criteria:

- ไม่มี fallback warnings ต่อเนื่อง
- manual UAT ผ่าน
- compare inventory parity ยังผ่าน

### Wave 2: Reporting Read Validation

ก่อนถือว่า report cutover พร้อม ต้องตรวจ:

1. `/reports` ตรงกับ baseline เดิมในตัวเลขหลัก
2. summary COD และ cost/profit ที่แตะ order/purchase state ยังไม่เพี้ยน
3. export/report endpoints ที่พึ่ง purchase/order aggregates ยังตอบข้อมูลตรง

สิ่งที่แนะนำ:

- ใช้ `npm run db:compare:postgres:reports-read` เป็น parity gate หลักของ `/reports` overview และ `outstanding PO/AP`
- ทำ snapshot ตัวเลขรายวันจาก Turso เทียบ PostgreSQL ในช่วง observe หลังเปิด flag

### Wave 3: Reporting Source Flip

เมื่อ report parity พร้อม:

- เปิด report/read paths ที่เหลือให้ใช้ PostgreSQL
- คง compare scripts ไว้ช่วง observe
- ยังไม่ลบ Turso fallback ทันที

### Wave 4: Turso Retirement Prep

หลัง inventory/reporting นิ่งแล้ว:

1. inventory/reporting routes ไม่พึ่ง Turso อีก
2. fallback paths ถูกนับ usage ได้ว่าแทบไม่เกิด
3. ค่อยทำแผนถอด:
   - Turso read helpers
   - Drizzle repositories ที่โดเมน inventory/order/purchase ไม่ใช้แล้ว
   - env/ops docs ที่ผูก Turso เกินจำเป็น

## Pre-Cutover Commands

```bash
npm run db:check:postgres
npm run db:migrate:postgres
npm run smoke:postgres:cutover-gate
npm run smoke:postgres:reports-read-gate
npm run lint
npm run build
```

## Manual UAT Checklist

1. สร้าง `Walk-in ค้างจ่าย` แล้วเช็ก reserved stock
2. สร้าง `Walk-in จ่ายทันที` แล้วเช็ก on-hand stock
3. ทำ pickup unpaid แล้วปิดยอด
4. ทำ cancel ทั้งเคส reserve และ out
5. สร้าง PO แบบ `receiveImmediately=true`
6. รับ PO จาก `ORDERED/SHIPPED -> RECEIVED`
7. เปิด `/reports` แล้วเช็ก metric หลักเทียบ baseline
8. export CSV/AP statement แล้วเช็ก totals เทียบหน้า `/reports`

## Rollback Strategy

ถ้า inventory/reporting เริ่มเพี้ยนหลัง cutover:

1. ปิด `POSTGRES_INVENTORY_READ_ENABLED=0`
2. ถ้า report path ใหม่ถูกเปิดแล้ว ให้ปิด report flags กลับ
3. rerun:

```bash
npm run db:compare:postgres:inventory
npm run smoke:postgres:inventory-read-gate
```

4. ตรวจ movement refs ล่าสุดใน:
   - `inventory_movements`
   - `orders`
   - `purchase_orders`

## Exit Criteria

ถือว่า cutover phase นี้สำเร็จเมื่อ:

- inventory read ใช้ PostgreSQL ได้จริงภายใต้ traffic จริง
- purchase/order flows ที่แตะ stock ยังไม่เพี้ยน
- reporting parity พร้อมหรือถูก validate จนเชื่อถือได้
- Turso ถูกลดบทบาทเหลือ fallback/legacy path เท่านั้นในโดเมน inventory/reporting

## Recommended Next Phase

หลังจบ phase นี้ ควรทำ `reports staging rollout + observe`

เหตุผล:

- reporting parity และ reports PostgreSQL read migration ถูกทำแล้ว
- มี gate รวมแล้วที่ `npm run smoke:postgres:reports-read-gate`
- ยังต้องเปิด `POSTGRES_REPORTS_READ_ENABLED=1` แบบ canary/observe ก่อนถือว่า report cutover สำเร็จ
- `/reports`, AP summary/statement และ CSV export พึ่งก้อน `outstanding PO/AP` เดียวกัน จึงควร observe ภายใต้ traffic จริงก่อนเริ่มลดบทบาท Turso ต่อ
