# PostgreSQL Inventory Movement Producers Audit

เอกสารนี้สรุป runtime paths ที่ยังเขียน `inventory_movements` อยู่ เพื่อใช้วางลำดับ migration หลังจบ order-route write rollout

## สถานะปัจจุบัน

### ครอบแล้วบน PostgreSQL path

ผ่าน `POST /api/orders`, `PATCH /api/orders/[orderId]`, `POST /api/stock/movements`, และ helper PostgreSQL ของแต่ละโดเมน

- `create order`
- `submit_for_payment`
- `confirm_paid`
- `mark_picked_up_unpaid`
- `cancel`
- `mark_cod_returned`
- `mark_packed`
- `manual stock movement`

หมายเหตุ:

- `mark_shipped`, `update_shipping`, `submit_payment_slip` เป็น order writes ที่ไม่มี movement ใหม่ แต่ถูกย้าย path แล้วเช่นกัน
- flags ของ stock/order หลายตัวยังปิดอยู่ใน `.env.local` เพื่อรอ rollout บน staging

## Remaining Runtime Producers

หมายเหตุ:

- ในเชิงโค้ด PO receive ทั้งสอง flow มี PostgreSQL write path แล้ว
- purchase read parity พร้อมแล้ว แต่ใน runtime ปัจจุบันยังถือว่า "ค้างบน Turso" เพราะ flags ยังปิด

### 1. Purchase Order Create with `receiveImmediately=true`

- Route: `POST /api/stock/purchase-orders`
- Files:
  - `app/api/stock/purchase-orders/route.ts`
  - `server/services/purchase.service.ts`
  - `server/repositories/purchase.repo.ts`
- Movement:
  - `IN`
- Ref type: `PURCHASE`
- ความเสี่ยง: สูง

เหตุผล:

- นอกจาก insert movement ยังอัปเดต weighted average cost ของสินค้า
- ถ้า dual-write ไม่ครบจะเสี่ยงให้ stock กับ cost เพี้ยนคนละฐาน

### 2. Purchase Order Status -> `RECEIVED`

- Route: `PATCH /api/stock/purchase-orders/[poId]`
- Files:
  - `app/api/stock/purchase-orders/[poId]/route.ts`
  - `server/services/purchase.service.ts`
  - `server/repositories/purchase.repo.ts`
- Movement:
  - `IN`
- Ref type: `PURCHASE`
- ความเสี่ยง: สูง

เหตุผล:

- มี logic `receivedItems`, landed cost allocation, และ weighted average cost
- เป็น flow รับสินค้าเข้าจริงของ PO เดิม จึงกระทบ stock truth โดยตรง

## Non-Producers ที่ตรวจแล้ว

runtime paths เหล่านี้ไม่สร้าง `inventory_movements` ใหม่

- `POST /api/orders` เมื่อเปิด `POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1`
- `POST /api/stock/movements` เมื่อเปิด `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1`
- `POST /api/stock/purchase-orders/[poId]/settle`
- `POST /api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse`
- `PUT /api/stock/purchase-orders/[poId]` (แก้ข้อมูล PO)
- `mark_shipped`
- `update_shipping`
- `submit_payment_slip`

## Recommended Migration Order

### Wave A: Purchase Staging Rollout

1. เปิด `POSTGRES_PURCHASE_READ_ENABLED=1` บน staging พร้อม `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1`
2. ทำ canary flow สร้าง PO แบบ `receiveImmediately=true`
3. เปิด `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1`
4. ทำ canary flow รับ PO จาก `ORDERED/SHIPPED -> RECEIVED`
5. รัน compare inventory parity ซ้ำหลังมี traffic จริง

เหตุผล:

- read/write ของ purchase พร้อมแล้วในระดับ code + parity baseline
- ต้อง rollout read/write พร้อมกันเพื่อกันหน้า PO เห็นข้อมูลคนละฐาน
- ยังต้องเฝ้า movement และ weighted average cost หลังมี traffic จริง

## Gate ก่อนเปิด `POSTGRES_INVENTORY_READ_ENABLED=1`

ต้องครบทุกข้อ:

- purchase read flag และ PO receive write flags ถูกเปิดบน staging แล้ว
- ไม่มี fallback warnings ต่อเนื่องใน purchase routes
- compare inventory parity ยังผ่านหลังรัน traffic จริง

## Recommendation

phase ถัดไปควรเริ่มที่ inventory read rollout

เหตุผล:

- manual stock movement, order writes, และ purchase receive flows ถูกย้ายครบแล้วในระดับ code
- purchase/order parity baseline พร้อมแล้ว
- จุดเสี่ยงถัดไปคือการเปลี่ยน stock truth ฝั่ง UI/read layer ไปพึ่ง PostgreSQL จริง
- ถ้า `POSTGRES_INVENTORY_READ_ENABLED=1` rollout ผ่าน จะเข้าใกล้ cutover ของ inventory/reporting มากที่สุด
