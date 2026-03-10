# PostgreSQL Orders Write Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด orders write runtime บน staging จริง`
หลังจาก purchase runtime และ inventory read truth ผ่านแล้ว

ก้อนนี้ครอบ:

- `POST /api/orders`
- `PATCH /api/orders/[orderId]` actions ที่ยังปิดอยู่
- order lifecycle transitions ที่แตะ state machine, stock movement, และ audit

## Scope

### อยู่ใน scope

- `POSTGRES_ORDERS_WRITE_CREATE_ENABLED`
- `POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED`
- `POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED`
- `POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED`
- `POSTGRES_ORDERS_WRITE_CANCEL_ENABLED`
- `POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED`
- `POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED`
- `POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED`

### อยู่นอก scope

- `update_shipping` และ `submit_payment_slip`
  - เปิดใช้งาน PostgreSQL อยู่แล้ว
- orders read
  - เปิดใช้งาน PostgreSQL อยู่แล้ว
- reports read
  - เปิดใช้งาน PostgreSQL อยู่แล้ว
- purchase rollout
- inventory read rollout
- stock manual movement rollout
- remove fallback paths

## Success Criteria

ถือว่า orders write rollout ผ่านเมื่อครบทุกข้อ:

1. create order ใช้งานได้จริงทั้งเคส reserve และ out
2. fulfillment transitions (`mark_packed`, `mark_shipped`) ใช้งานได้จริง
3. return/cancel/pickup transitions ใช้งานได้จริง
4. high-risk payment transitions (`submit_for_payment`, `confirm_paid`) ไม่ทำให้ stock/state เพี้ยน
5. `orders-write-suite` ยังผ่านหลังเปิดแต่ละ wave
6. ไม่มี fallback warnings ต่อเนื่องจาก `orders.write.pg`
7. order detail, stock state, reports และ inventory parity ยังสอดคล้องหลัง canary flows

## Flags Used

### Wave 0

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=0
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=0
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=0
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=0
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=0
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=0
POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=0
POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=0
```

### Wave 1: Low-Risk Create

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
```

### Wave 2: Fulfillment

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
```

### Wave 3: Return / Cancel / Pickup

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=1
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=1
```

### Wave 4: High-Risk Payment

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=1
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=1
POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=1
POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเริ่ม rollout:

1. purchase runtime rollout ผ่าน
2. inventory read rollout ผ่าน
3. `POSTGRES_ORDERS_READ_ENABLED=1` ใช้งานนิ่ง
4. `POSTGRES_REPORTS_READ_ENABLED=1` ใช้งานนิ่ง
5. `update_shipping` และ `submit_payment_slip` PostgreSQL path ไม่มีปัญหา

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run db:check:postgres
npm run db:migrate:postgres
npm run db:compare:postgres:orders-read
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
npm run smoke:postgres:orders-write-suite
npm run smoke:postgres:inventory-read-gate
npm run smoke:postgres:reports-read-gate
npm run lint
npm run build
```

ถ้า command ใด fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance

### Step 3: Canary Flow A - Walk-in Unpaid

สร้าง `Walk-in ค้างจ่าย`

ตรวจ:
- order สร้างสำเร็จ
- stock state เป็น reserve case ถูก
- หน้า detail เปิดได้
- `/stock` สะท้อน `reserved` เพิ่ม

### Step 4: Canary Flow B - Walk-in Paid

สร้าง `Walk-in จ่ายทันที`

ตรวจ:
- order สร้างสำเร็จ
- stock ถูก `OUT`
- `/stock` สะท้อน `on hand` ลด

### Step 5: Compare + Log Review

รัน:

```bash
npm run db:compare:postgres:inventory
```

เช็ก logs:
- `orders.write.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Wave 2 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
```

### Step 2: Canary Flow A - Online Prepaid Fulfillment

ทดสอบ:
- `PAID -> PACKED -> SHIPPED`

ตรวจ:
- status เปลี่ยนถูก
- audit events ถูก
- order detail แสดง next step ถูก

### Step 3: Canary Flow B - Online COD Fulfillment

ทดสอบ:
- order COD ที่แพ็กและจัดส่ง

ตรวจ:
- packed/shipped สำเร็จ
- stock ไม่เพี้ยน
- COD state ยังสอดคล้อง

### Step 4: Compare + Log Review

รัน:

```bash
npm run db:compare:postgres:inventory
```

เช็ก logs:
- `orders.write.pg fallback`

## Wave 3 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=1
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=1
```

### Step 2: Canary Flow A - Pickup Unpaid

ทดสอบ:
- `mark_picked_up_unpaid`

ตรวจ:
- status = `PICKED_UP_PENDING_PAYMENT`
- stock ถูก `RELEASE + OUT`
- หน้า detail แสดง next step ถูก

### Step 3: Canary Flow B - Cancel Reserve

ทดสอบ:
- cancel order ที่ยัง reserve อยู่

ตรวจ:
- movement เป็น `RELEASE`
- stock กลับถูก
- order status/paymentStatus ถูก

### Step 4: Canary Flow C - Cancel After Out

ทดสอบ:
- cancel order ที่ out ไปแล้ว

ตรวจ:
- movement เป็น `RETURN`
- stock กลับถูก

### Step 5: Canary Flow D - COD Returned

ทดสอบ:
- `mark_cod_returned`

ตรวจ:
- status = `COD_RETURNED`
- paymentStatus = `FAILED`
- stock return ถูก
- `codReturnedAt`, `codFee`, `shippingCost`, `codReturnNote` ถูก

### Step 6: Compare + Log Review

รัน:

```bash
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
```

เช็ก logs:
- `orders.write.pg fallback`

## Wave 4 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=1
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=1
POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=1
POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=1
```

### Step 2: Canary Flow A - Online Prepaid Payment

ทดสอบ:
- `submit_for_payment -> confirm_paid`

ตรวจ:
- reserve/out movement ถูก
- status/paymentStatus ถูก
- `/stock` และ order detail ยังเห็นตรงกัน

### Step 3: Canary Flow B - Pickup Payment

ทดสอบ:
- `READY_FOR_PICKUP -> confirm_paid`
- หรือ `PICKED_UP_PENDING_PAYMENT -> confirm_paid`

ตรวจ:
- ไม่ตัด stock ซ้ำ
- payment close ถูก

### Step 4: Canary Flow C - COD Settlement

ทดสอบ:
- flow COD ที่จัดส่งแล้วและปิดยอด

ตรวจ:
- payment status เปลี่ยนถูก
- reports COD ไม่เพี้ยน

### Step 5: Final Compare + Log Review

รัน:

```bash
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
npm run smoke:postgres:orders-write-suite
```

เช็ก logs:
- `orders.write.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Create

1. Walk-in unpaid
2. Walk-in paid
3. online prepaid create
4. online COD create

### UAT Set B: Fulfillment

1. prepaid packed/shipped
2. COD packed/shipped

### UAT Set C: Return / Cancel / Pickup

1. pickup unpaid
2. cancel reserve
3. cancel out
4. COD returned

### UAT Set D: Payment

1. submit_for_payment
2. confirm_paid prepaid
3. confirm_paid pickup unpaid
4. COD settlement

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. order state machine เพี้ยน
2. stock movement ไม่ตรง
3. `/stock` กับ order detail เห็นคนละโลก
4. reports numbers เพี้ยนหลัง canary flow
5. smoke suite fail
6. มี `orders.write.pg fallback` ต่อเนื่อง

### Rollback Command Checklist

1. ปิดเฉพาะ flags ของ wave ล่าสุดกลับเป็น `0`
2. rerun:

```bash
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
npm run smoke:postgres:orders-write-suite
```

3. ตรวจเคสล่าสุดใน:
- `orders`
- `order_items`
- `inventory_movements`
- `audit_events`

## After Orders Write Rollout Passes

ถ้า rollout ผ่านครบทุก wave:

1. บันทึกว่า order lifecycle runtime ใช้ PostgreSQL จริงแล้ว
2. ขยับไป phase stock manual movement rollout
3. หลังจากนั้นจึงค่อยทำ observe all-postgres runtime และ remove fallback

## Recommended Next Phase

หลัง orders write rollout ผ่าน ควรทำ `stock movement rollout execution`

เหตุผล:
- ยังเหลือ movement producer นอก order/purchase routes ที่ต้องปิด gap
- เมื่อ stock manual movement ย้ายแล้ว จึงจะเข้าใกล้จุด `all-postgres runtime` และ phase ถอด fallback ได้จริง
