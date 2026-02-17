# Order System Design (Walk-in + Online + COD/Transfer + Auto Shipping Label)

เอกสารนี้เป็นแบบออกแบบระบบ `/orders` สำหรับร้านที่ขายหลายช่องทาง:
- หน้าร้าน (Walk-in)
- Online (Facebook / WhatsApp)
- ชำระเงินแบบ COD และโอนเงิน
- สร้าง Shipping Label อัตโนมัติ และส่งรูป/ลิงก์ให้ลูกค้าผ่าน API

## 1) ข้อเสนอเชิง UX (สรุปที่แนะนำ)

แนวทางที่แนะนำ:
- ใช้หน้า Order เดียว แต่แยก `Order Type` ชัดเจนตั้งแต่ต้น: `Walk-in`, `Online-Transfer`, `Online-COD`
- ใช้ state machine เดียวในระบบ แต่เงื่อนไขการเปลี่ยนสถานะต่างกันตาม payment method
- เมื่อกดจัดของเสร็จ (`PACKED`) ให้ระบบสร้าง label แบบ async ทันที และแจ้งผลในหน้า order detail
- ปุ่มหลักในฟอร์มควรเป็น sticky ด้านล่างบน mobile และแสดงสถานะล่าสุดในแถบเดียวกัน (ลดการเลื่อนขึ้นลง)

เหตุผล:
- ผู้ใช้เข้าใจ flow เร็ว ลดกดผิดขั้น
- รองรับทุกช่องทางขายโดยไม่แยกหน้าให้ซับซ้อน
- งานภายนอก (shipping API, message API) ไม่บล็อก request หลัก ทำให้ระบบลื่นและเสถียรกว่า

## 2) สิ่งที่มีแล้วในโค้ดปัจจุบัน

จากโค้ดปัจจุบัน:
- มี `orders`, `order_items`, `inventory_movements`, `idempotency_requests`, `audit_events` แล้ว
- มี idempotency ใน `/api/orders` และ `/api/orders/[orderId]`
- มี audit log และผูก transaction ใน flow สำคัญของ orders แล้ว
- มีช่องทาง `WALK_IN`, `FACEBOOK`, `WHATSAPP`
- มี payment `CASH`, `LAO_QR`

ช่องว่างที่ควรเพิ่ม:
- `COD` ยังไม่ครบ flow
- ยังไม่มีโมเดลและ job สำหรับ shipping label/provider
- ยังไม่มี outbox สำหรับส่ง message แบบ retry-safe

## 3) สถานะแนะนำ (State Model)

แนะนำใช้ 2 แกนสถานะ (แยกชัด):
- `fulfillmentStatus`: `DRAFT -> PENDING_PAYMENT -> PAID -> PACKED -> SHIPPED -> DELIVERED -> CANCELLED`
- `paymentStatus`: `UNPAID -> PENDING_PROOF -> PAID -> COD_PENDING_SETTLEMENT -> COD_SETTLED -> FAILED`

ถ้ายังไม่อยาก refactor ใหญ่ในเฟสแรก:
- คง `orders.status` เดิมไว้
- เพิ่มคอลัมน์ `payment_status` และ map logic ทีละจุด

## 4) Data Model ที่ควรเพิ่ม

### 4.1 ตาราง `orders` (เพิ่มคอลัมน์)
- `payment_method`: เพิ่ม `COD`, `BANK_TRANSFER` (นอกเหนือจาก `CASH`, `LAO_QR`)
- `payment_status`
- `delivery_status` (optional ถ้ายังไม่แยกเต็ม)
- `shipping_provider`
- `shipping_label_status` (`NONE|REQUESTED|READY|FAILED`)
- `shipping_label_url`
- `shipping_label_file_key`
- `shipping_request_id` (idempotency key ที่ส่งไป provider)
- `cod_amount`, `cod_fee`, `cod_settled_at`

### 4.2 ตารางใหม่ `order_shipments` (แนะนำ)
- `id`, `order_id`, `provider`, `tracking_no`
- `label_url`, `label_file_key`, `status`
- `provider_request_id`, `provider_response`
- `last_error`, `created_at`, `updated_at`

### 4.3 ตารางใหม่ `message_outbox`
- `id`, `store_id`, `order_id`, `channel` (`FACEBOOK|WHATSAPP`)
- `message_type` (`PAYMENT_QR|SHIPPING_LABEL|TRACKING_UPDATE|COD_CONFIRM`)
- `payload_json`, `status` (`PENDING|SENT|FAILED|DEAD`)
- `attempt_count`, `next_retry_at`, `last_error`
- `idempotency_key`, `created_at`, `sent_at`

## 5) API Design ที่ควรมี

### Core
- `POST /api/orders` สร้าง order
- `PATCH /api/orders/:id` เปลี่ยนสถานะ/อัปเดตข้อมูล
- `POST /api/orders/:id/shipments/label` สร้าง label (manual trigger)
- `POST /api/orders/:id/messages/send` trigger ส่งข้อความทันที (admin action)

### Webhook/Internal
- `POST /api/webhooks/shipping/:provider` รับ tracking update
- `POST /api/internal/jobs/orders` worker endpoint (ถ้าไม่ใช้ queue infra ภายนอก)

## 6) Business Flow (แนะนำ)

### 6.1 Walk-in
1. สร้าง order + รับเงินทันที (`CASH/QR`)
2. ตัดสต็อกทันที
3. สถานะไป `PAID` หรือ `SHIPPED` (ถ้าไม่มีขนส่ง)

### 6.2 Online + Transfer (QR/Bank)
1. สร้าง order => `PENDING_PAYMENT`
2. ส่ง QR/บัญชีให้ลูกค้า
3. ลูกค้าแนบหลักฐาน/แอดมิน confirm
4. ตัดสต็อก, `PAID -> PACKED`
5. สร้าง shipping label อัตโนมัติ (async)
6. ส่งรูปลิงก์ label/เลขพัสดุให้ลูกค้า

### 6.3 Online + COD
1. สร้าง order => `PACKED` ได้โดยไม่ต้อง paid
2. สร้าง label + ส่งข้อมูล COD ไป provider
3. `SHIPPED -> DELIVERED`
4. เมื่อได้รับเงิน COD จากขนส่ง => `COD_SETTLED`

## 7) Label Automation + Messaging (โครงสร้างที่แนะนำ)

ใช้รูปแบบ Outbox + Worker:
- ใน transaction ที่เปลี่ยน order เป็น `PACKED`:
  - update order
  - insert audit
  - insert `message_outbox` (event `CREATE_SHIPPING_LABEL`)
- Worker อ่าน outbox แล้ว:
  - เรียก shipping provider API แบบ idempotent
  - เก็บ label/tracking ลง `order_shipments`
  - update `orders.shipping_label_status`
  - insert outbox แถวใหม่เพื่อส่ง message หาลูกค้า

ข้อดี:
- request user ตอบเร็ว
- retry ได้
- ไม่ส่งซ้ำเมื่อ timeout

## 8) Idempotency / Audit / Transaction Rule

### Idempotency
- บังคับใช้กับ endpoint ที่เสี่ยงยิงซ้ำ:
  - `POST /api/orders`
  - `PATCH /api/orders/:id`
  - `POST /api/orders/:id/shipments/label`
  - webhook provider (ใช้ provider event id เป็น dedupe key)

### Audit
- log ทั้ง `SUCCESS` และ `FAIL` สำหรับ:
  - create order
  - confirm paid / COD settled
  - create label
  - send message
- metadata ต้องมี `orderNo`, `paymentMethod`, `trackingNo`, `providerRequestId`

### Transaction
- action critical ต้องอยู่ tx เดียว:
  - เปลี่ยน order status + inventory movement + audit + outbox enqueue

## 9) Performance / Cost / Security

### Performance
- ใช้ cursor pagination สำหรับ order list/audit log
- เพิ่ม index ที่คิวรีบ่อย:
  - `(store_id, status, created_at)`
  - `(store_id, payment_status, created_at)`
  - `(store_id, shipping_label_status, updated_at)`

### Cost
- External API ทั้ง shipping/message ทำ async + retry backoff
- เก็บไฟล์ label ใน object storage และเก็บ URL แบบ signed/short-lived
- ตั้ง retention สำหรับตาราง idempotency และ outbox ที่ส่งสำเร็จแล้ว

### Security
- แยกสิทธิ์ `orders.cod_settle`, `orders.create_label`, `orders.send_message`
- webhook ต้อง verify signature + replay protection
- ปิดข้อมูลอ่อนไหวใน metadata ที่แสดงบน UI

## 10) Rollout Plan (2 เฟส)

### Phase 1 (เร็วและคุ้ม)
- เพิ่ม `COD` ใน payment method
- เพิ่ม `payment_status` และ flow COD settle แบบ manual
- เพิ่ม `order_shipments` + endpoint สร้าง label
- เพิ่ม outbox worker สำหรับ label + ส่งข้อความ
- เพิ่ม audit/idempotency ในจุดใหม่

### Phase 2 (ขยายระบบ)
- webhook tracking auto update
- auto notify ลูกค้าเมื่อสถานะพัสดุเปลี่ยน
- dashboard SLA: label success rate, message success rate, COD aging
- แยก fulfillment/payment state machine เต็มรูปแบบ

## 11) KPI ที่ควรติดตาม

- เวลาจาก `PACKED -> LABEL_READY` (p95)
- อัตรา label fail ต่อ provider
- อัตรา message fail/retry
- % ออเดอร์ที่ยิงซ้ำแต่ idempotency ป้องกันได้
- COD ที่ค้างเกิน X วัน

## 12) แนวทางเริ่มลงมือในโค้ดนี้ (ขั้นต่ำ)

ลำดับแนะนำ:
1. เพิ่ม enum/คอลัมน์ใน `lib/db/schema/tables.ts` + migration
2. เพิ่ม validation ใน `lib/orders/validation.ts`
3. เพิ่ม action ใหม่ใน `app/api/orders/[orderId]/route.ts`
4. เพิ่ม `order_shipments` repository/service
5. เพิ่ม outbox worker และ cron/endpoint เรียก worker
6. เพิ่มหน้าจอ order detail ให้เห็นสถานะ label + ปุ่ม retry

