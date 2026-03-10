# PostgreSQL Purchase Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด purchase runtime บน staging จริง`
โดยแยกจากแผนรวม เพื่อให้ operator / developer ทำตามทีละข้อได้โดยไม่ต้องตีความเอง

ก้อนนี้ครอบ:

- purchase list / detail / pending-rate reads
- create PO แบบ `receiveImmediately=true`
- receive PO ผ่าน status transition `RECEIVED`

## Scope

### อยู่ใน scope

- `POSTGRES_PURCHASE_READ_ENABLED`
- `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED`
- `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED`
- หน้า `/stock?tab=purchase`
- purchase detail / print
- pending-rate queue
- inventory impact จาก PO receive

### ยังไม่อยู่ใน scope

- inventory read truth ทั้งระบบ
- order lifecycle write flags
- stock manual movement write
- remove fallback paths

## Success Criteria

ถือว่า purchase rollout ผ่านเมื่อครบทุกข้อ:

1. หน้า purchase list/detail ใช้ได้ปกติหลังเปิด read flag
2. create PO แบบ `receiveImmediately=true` ใช้งานได้จริง
3. receive existing PO จาก `ORDERED/SHIPPED -> RECEIVED` ใช้งานได้จริง
4. pending-rate queue และ purchase print/detail ยังตรง
5. inventory parity ยังผ่านหลัง canary flows
6. ไม่มี fallback warnings ต่อเนื่องจาก `purchase.read.pg` หรือ `purchase.write.pg`

## Flags Used

### Wave 0

```env
POSTGRES_PURCHASE_READ_ENABLED=0
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=0
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0
```

### Wave 1

```env
POSTGRES_PURCHASE_READ_ENABLED=1
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0
```

### Wave 2

```env
POSTGRES_PURCHASE_READ_ENABLED=1
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1
```

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run db:check:postgres
npm run db:migrate:postgres
npm run db:backfill:postgres:purchase-read
npm run db:compare:postgres:purchase-read
npm run smoke:postgres:purchase-suite
npm run db:compare:postgres:inventory
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
POSTGRES_PURCHASE_READ_ENABLED=1
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow 1

ทดสอบที่หน้า `/stock?tab=purchase`

ตรวจ:
- list โหลดได้
- pagination/filter/search ยังตรง
- opening purchase detail ไม่ error
- print page เปิดได้

### Step 4: Canary Flow 2

สร้าง PO ใหม่แบบ `receiveImmediately=true`

ตรวจ:
- create สำเร็จ
- refresh list แล้วเห็น record ใหม่ทันที
- detail ของ PO ใหม่นี้ตรงกับที่กรอก
- status / item totals / payment status ถูกต้อง
- inventory เปลี่ยนตามที่คาด

### Step 5: Log Review

เช็ก server logs ว่ามีหรือไม่:
- `purchase.read.pg fallback`
- `purchase.write.pg fallback`

ถ้ามีซ้ำ:
- rollback wave นี้ทันที

### Step 6: Post-Wave Validation

รันซ้ำ:

```bash
npm run db:compare:postgres:purchase-read
npm run db:compare:postgres:inventory
```

ต้องผ่านทั้งคู่

## Wave 2 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_PURCHASE_READ_ENABLED=1
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance

### Step 3: Canary Flow 1

เลือก PO ที่อยู่สถานะ `ORDERED` หรือ `SHIPPED`

ทำ action รับเข้า `RECEIVED`

ตรวจ:
- status เปลี่ยนถูก
- received timestamp ถูก
- received items / landed cost ถูก
- payment status ยังสอดคล้อง

### Step 4: Canary Flow 2

เปิด pending-rate queue

ตรวจ:
- queue ยังตรง
- PO ที่เพิ่ง receive มีผลใน queue ตามกติกาเดิม

### Step 5: Canary Flow 3

เปิด purchase detail / print ของ PO ที่เพิ่ง receive

ตรวจ:
- totals ตรง
- qty received ตรง
- currency / exchange-rate data ตรง

### Step 6: Inventory Validation

รัน:

```bash
npm run db:compare:postgres:inventory
```

ต้องผ่านหลัง receive canary flow แล้ว

### Step 7: Log Review

เช็ก server logs ว่ามีหรือไม่:
- `purchase.read.pg fallback`
- `purchase.write.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Read

1. เปิด purchase list
2. เปิด purchase detail เดิม
3. เปิด print page
4. เปิด pending-rate queue

### UAT Set B: Create Received

1. สร้าง PO แบบ `receiveImmediately=true`
2. เช็ก list/detail/print
3. เช็ก inventory ที่ได้รับผล

### UAT Set C: Receive Existing

1. รับ PO จาก `ORDERED`
2. รับ PO จาก `SHIPPED`
3. เช็ก cost / qty / status / queue

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. หน้า `/stock?tab=purchase` stale หรือข้อมูลหาย
2. receive แล้ว inventory/cost ไม่ตรง
3. print/detail ของ PO เพี้ยน
4. parity compare fail
5. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flags กลับเป็น:

```env
POSTGRES_PURCHASE_READ_ENABLED=0
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=0
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0
```

2. rerun:

```bash
npm run db:compare:postgres:purchase-read
npm run db:compare:postgres:inventory
npm run smoke:postgres:purchase-suite
```

3. ตรวจเคสล่าสุดในตาราง:
- `purchase_orders`
- `purchase_order_items`
- `purchase_order_payments`
- `inventory_movements`
- `audit_events`

## After Purchase Rollout Passes

ถ้า Wave 1 + Wave 2 ผ่านครบ:

1. บันทึกว่า purchase runtime ใช้ PostgreSQL จริงแล้ว
2. ย้าย focus ไป phase `POSTGRES_INVENTORY_READ_ENABLED=1`
3. ใช้ `docs/postgres-full-cutover-checklist.md` เป็นเอกสารหลักสำหรับ phase ถัดไป

## Recommended Next Phase

หลัง purchase rollout ผ่าน ควรทำ `inventory read rollout execution`

เหตุผล:
- purchase receive เป็น movement producer หลักที่ต้องนิ่งก่อน
- เมื่อ purchase runtime ย้ายแล้ว จึงค่อยเปลี่ยน stock truth ของ `/stock` และ order stock state ไป PostgreSQL ได้อย่างปลอดภัย
