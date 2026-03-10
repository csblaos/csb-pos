# PostgreSQL Stock Movement Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด stock movement write runtime บน staging จริง`
หลังจาก purchase rollout, inventory read rollout, และ orders write rollout ผ่านแล้ว

ก้อนนี้ครอบ:

- `POST /api/stock/movements`
- manual stock adjustment / stock in / stock out
- inventory movement producer นอก order/purchase lifecycle

## Scope

### อยู่ใน scope

- `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED`
- manual stock movement create
- inventory impact ที่หน้า `/stock`
- audit ที่ตามมากับ stock movement

### อยู่นอก scope

- purchase runtime rollout
- inventory read rollout
- orders write rollout
- remove fallback paths
- decommission Turso

## Success Criteria

ถือว่า stock movement rollout ผ่านเมื่อครบทุกข้อ:

1. manual stock movement ทุกประเภทสร้างได้จริง
2. หน้า `/stock` สะท้อน `on hand / reserved / available` ตรงหลังทำ movement
3. inventory parity ยังผ่านหลัง canary flows
4. ไม่มี fallback warnings ต่อเนื่องจาก `stock.write.pg`
5. audit และ movement history ยังครบและอ่านได้ปกติ

## Flag Used

### Wave 0

```env
POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=0
```

### Wave 1

```env
POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. purchase rollout ผ่าน
2. inventory read rollout ผ่าน
3. orders write rollout ผ่าน
4. `POSTGRES_INVENTORY_READ_ENABLED=1` ใช้งานนิ่งแล้ว
5. compare/smoke ของ inventory และ orders ยังผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run db:check:postgres
npm run db:migrate:postgres
npm run db:compare:postgres:inventory
npm run db:compare:postgres:reports-read
npm run smoke:postgres:stock-movement
npm run smoke:postgres:inventory-read-gate
npm run smoke:postgres:orders-write-suite
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
POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Stock In

ทำ manual stock movement แบบ `IN`

ตรวจ:
- movement สร้างสำเร็จ
- หน้า `/stock` เห็น `on hand` เพิ่ม
- history/movement list เห็นรายการใหม่

### Step 4: Canary Flow B - Stock Out

ทำ manual stock movement แบบ `OUT`

ตรวจ:
- movement สร้างสำเร็จ
- หน้า `/stock` เห็น `on hand` ลด
- ไม่มีค่า available ติดลบผิดปกติ

### Step 5: Canary Flow C - Adjust

ทำ manual stock movement แบบ `ADJUST`

ตรวจ:
- movement สร้างสำเร็จ
- stock balances สะท้อนตาม qty ที่ปรับ
- note/audit ถูกเก็บครบ

### Step 6: Compare Validation

รัน:

```bash
npm run db:compare:postgres:inventory
```

ต้องผ่านหลัง canary flows

### Step 7: Log Review

เช็ก server logs ว่ามีหรือไม่:
- `stock.write.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Manual In

1. เลือกสินค้าที่มี stock อยู่
2. บันทึก `IN`
3. refresh `/stock`
4. ตรวจ movement history

### UAT Set B: Manual Out

1. เลือกสินค้าที่ on-hand เพียงพอ
2. บันทึก `OUT`
3. refresh `/stock`
4. ตรวจ movement history

### UAT Set C: Adjust

1. เลือกสินค้าที่มี stock
2. บันทึก `ADJUST` แบบเพิ่ม
3. บันทึก `ADJUST` แบบลด
4. refresh `/stock`

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. manual movement save ไม่สำเร็จ
2. `/stock` แสดงค่าเพี้ยนหลัง manual movement
3. inventory parity fail
4. movement history หรือ audit หาย
5. มี `stock.write.pg fallback` ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=0
```

2. rerun:

```bash
npm run db:compare:postgres:inventory
npm run smoke:postgres:stock-movement
```

3. ตรวจเคสล่าสุดใน:
- `inventory_movements`
- `audit_events`
- stock balances ของสินค้าที่ทดสอบ

## After Stock Movement Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า movement producers หลักทั้งหมดใช้ PostgreSQL runtime แล้ว
2. ขยับไป phase `observe all-postgres runtime`
3. จากนั้นค่อยเริ่ม phase `remove fallback paths`

## Recommended Next Phase

หลัง stock movement rollout ผ่าน ควรทำ `all-postgres runtime observe + fallback removal plan`

เหตุผล:
- order, purchase, inventory, reports, และ stock movement จะครบ runtime stack หลักแล้ว
- จากนั้นเป้าหมายจะเปลี่ยนจาก “เปิด flag” เป็น “วัด fallback usage, observe traffic จริง, แล้วค่อยถอด Turso paths ออก”
