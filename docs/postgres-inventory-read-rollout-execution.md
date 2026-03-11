# PostgreSQL Inventory Read Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด inventory read truth บน staging จริง`
หลัง purchase runtime rollout ผ่านแล้ว

ก้อนนี้ครอบ:

- stock balances ในหน้า `/stock`
- order stock state ในหน้า `/orders/[orderId]`
- inventory truth ที่ใช้ตัดสิน action reserve / out / release / return

## Scope

### อยู่ใน scope

- `POSTGRES_INVENTORY_READ_ENABLED`
- หน้า `/stock`
- stock balances (`onHand`, `reserved`, `available`)
- order stock state ในหน้า detail
- inventory visibility หลัง order/purchase canary flows

### ยังไม่อยู่ใน scope

- purchase runtime rollout
- order write rollout ที่ยังปิดอยู่
- stock manual movement write
- remove fallback paths

## Success Criteria

ถือว่า inventory read rollout ผ่านเมื่อครบทุกข้อ:

1. หน้า `/stock` แสดง `on hand / reserved / available` ตรงกับ baseline
2. หน้า `/orders/[orderId]` ยังตัดสิน stock state ได้ถูก
3. canary flows ของ order/purchase สะท้อน stock ใน UI ตรงกับ movement จริง
4. `db:compare:postgres:inventory` ยังผ่านหลังมี traffic จริง
5. ไม่มี fallback warnings ต่อเนื่องจาก `inventory.read.pg`

## Flag Used

### Wave 0

```env
POSTGRES_INVENTORY_READ_ENABLED=0
```

### Wave 1

```env
POSTGRES_INVENTORY_READ_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. purchase rollout ผ่านแล้ว
2. `POSTGRES_ORDERS_READ_ENABLED=1` ใช้งานนิ่ง
3. `POSTGRES_REPORTS_READ_ENABLED=1` หรืออย่างน้อย reports parity ผ่านแล้ว
4. compare/smoke ของ order + purchase + inventory ผ่านครบ
5. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:inventory-read-gate
```

ถ้า command ใด fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_INVENTORY_READ_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Stock Page Read

เปิดหน้า `/stock`

ตรวจ:
- stock list โหลดได้
- คอลัมน์ `on hand`, `reserved`, `available` ไม่ว่าง/ไม่เป็นค่าผิดปกติ
- search/filter ยังทำงาน
- low stock / threshold behavior ไม่เพี้ยน

### Step 4: Canary Flow B - Order Reserve

สร้างออเดอร์เคสที่ยัง `reserve`

ตัวอย่าง:
- `Walk-in ค้างจ่าย`
- online prepaid ที่ยังไม่ confirm paid

ตรวจ:
- หน้า `/stock` เห็น `reserved` เพิ่ม
- หน้า `/orders/[orderId]` ยังแสดง stock state ถูก
- ไม่มี action rail แสดง action ผิดจาก stock state

### Step 5: Canary Flow C - Order Out

ทำ flow ที่ทำให้เกิด `OUT`

ตัวอย่าง:
- `Walk-in จ่ายทันที`
- pickup unpaid
- confirm paid ใน flow ที่ต้องตัด stock

ตรวจ:
- `on hand` ลด
- `reserved` ถูกปล่อยตามกรณี
- หน้า detail ยังตีความว่า order นั้นเคย out แล้วถูก

### Step 6: Canary Flow D - Cancel / Return / Release

ทดสอบ:
- cancel จากออเดอร์ที่ยัง reserve
- cancel จากออเดอร์ที่ out ไปแล้ว
- COD returned ถ้ามีเคส

ตรวจ:
- reserve case => `reserved` ลด / release ถูก
- out case => `on hand` กลับ / return ถูก
- หน้า `/stock` กับหน้า order detail เห็นภาพเดียวกัน

### Step 7: Canary Flow E - Purchase Receive Impact

ทำ purchase canary อย่างน้อยหนึ่งเคส:
- create PO แบบ `receiveImmediately=true`
- หรือ receive existing PO

ตรวจ:
- stock เพิ่มใน `/stock`
- ค่าที่เพิ่มตรงกับ qty ที่รับจริง
- refresh หน้าแล้วยังตรง

### Step 8: Compare Validation

รัน:

```bash
npm run db:compare:postgres:inventory
```

ต้องผ่านหลัง canary flows

### Step 9: Log Review

เช็ก server logs ว่ามีหรือไม่:
- `inventory.read.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Stock Page

1. เปิด `/stock`
2. search product
3. เปรียบเทียบค่ากับ baseline ที่รู้แน่
4. ตรวจ low stock cases
5. เทียบ app shell/store context หลัง branch/session load

### UAT Set B: Order Reserve/Out

1. สร้าง `Walk-in ค้างจ่าย`
2. สร้าง `Walk-in จ่ายทันที`
3. online prepaid reserve flow
4. pickup unpaid flow

### UAT Set C: Cancel/Return

1. cancel reserve case
2. cancel out case
3. COD returned case ถ้ามี

### UAT Set D: Purchase Impact

1. create PO with `receiveImmediately=true`
2. receive existing PO
3. refresh `/stock`
4. compare with PO qty

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. หน้า `/stock` แสดงค่าผิดชัดเจน
2. หน้า `/orders/[orderId]` ตัดสิน stock state ผิด
3. reserve/out/release/return ทำแล้ว UI เห็นคนละโลก
4. inventory parity fail
5. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_INVENTORY_READ_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:inventory-read-gate
```

3. ตรวจเคสล่าสุดใน:
- `inventory_movements`
- `orders`
- `purchase_orders`
- `audit_events`

## After Inventory Read Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า inventory truth ใช้ PostgreSQL จริงแล้ว
2. ขยับไป phase order write rollout ที่ยังปิดอยู่
3. ใช้ `docs/postgres-full-cutover-checklist.md` เป็นเอกสารหลักต่อ

## Recommended Next Phase

หลัง inventory read rollout ผ่าน ควรทำ `orders write rollout execution`

เหตุผล:
- หลัง stock truth ย้ายแล้ว จึงควรค่อยเปิด order writes ที่ยังแตะ movement/state transition หนัก
- โดยเฉพาะ `POST /api/orders`, `submit_for_payment`, และ `confirm_paid` ซึ่งเสี่ยงสุดและควรใช้ execution checklist แยกอีกชุด
