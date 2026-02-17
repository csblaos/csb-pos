# Architecture Overview

## System Shape

- Framework: Next.js App Router
- Database: Turso/LibSQL + Drizzle ORM
- Cache: Redis/Upstash (ตาม env)
- Runtime layering:
  - Route handlers (`app/api/*`)
  - Services (`server/services/*`)
  - Repositories (`server/repositories/*`)
  - DB schema (`lib/db/schema/tables.ts`)

## Key Domains

- `orders`: สร้างออเดอร์, จอง/ตัดสต็อก, ชำระเงิน, จัดส่ง
- `stock`: movement + balance
- `purchase_orders`: receiving + cost update
- `audit_events`: security/traceability log
- `idempotency_requests`: กันคำขอซ้ำ
- `order_shipments`: shipment label/tracking

## Order Flow (Current)

1. Create order: `POST /api/orders`
2. Submit for payment: `PATCH /api/orders/[orderId]` action `submit_for_payment`
3. Confirm paid: action `confirm_paid`
4. Pack/Ship: action `mark_packed`, `mark_shipped`
5. Generate label: `POST /api/orders/[orderId]/shipments/label`
6. Upload manual label image (optional): `POST /api/orders/[orderId]/shipments/upload-label`
7. Send shipping update: `POST /api/orders/[orderId]/send-shipping`

## Reliability Patterns

- Idempotency สำหรับ endpoint สำคัญ:
  - `POST /api/orders`
  - `PATCH /api/orders/[orderId]`
  - `POST /api/orders/[orderId]/shipments/label`
- Audit log ทั้ง success/fail สำหรับ action สำคัญ
- ใช้ transaction ผูก business write + audit + idempotency update ใน flow critical

## Shipping Provider Integration

- Provider abstraction: `lib/shipping/provider.ts`
- Modes:
  - `STUB`: สร้าง tracking/label ในระบบ (dev-friendly)
  - `HTTP`: เรียก API provider จริงผ่าน env config
- Service orchestrator: `server/services/order-shipment.service.ts`
- Manual fallback:
  - อัปโหลดรูปบิล/ป้ายจากเครื่องหรือกล้องมือถือ แล้วได้ URL กลับมา
  - ผู้ใช้ใส่ `shippingLabelUrl`/tracking ในหน้า order detail ได้
  - มีปุ่มส่งอัตโนมัติ/คัดลอกข้อความส่งมือไป social

## Access Control

- RBAC check ผ่าน `enforcePermission` / `hasPermission`
- Permission ที่เกี่ยวข้องกับ orders:
  - `orders.view`
  - `orders.create`
  - `orders.update`
  - `orders.mark_paid`
  - `orders.pack`
  - `orders.ship`
  - `orders.cancel` / `orders.delete`

## Data/Migration Discipline

- แก้ schema ที่ `lib/db/schema/tables.ts`
- generate migration ด้วย `npm run db:generate`
- apply ด้วย `npm run db:migrate`
- ถ้า DB drift ใช้ `npm run db:repair`
