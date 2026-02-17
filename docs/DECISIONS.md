# Decisions Log (ADR-lite)

ไฟล์นี้บันทึก "ทำไม" ของการออกแบบสำคัญ เพื่อให้ AI/คนทำงานต่อไม่เดาเอง

## ADR-001: ใช้ Idempotency กับ Write Endpoint หลัก

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - ใช้ `idempotency_requests` กับ `POST /api/orders`, `PATCH /api/orders/[orderId]`, `POST /api/orders/[orderId]/shipments/label`
- Reason:
  - ลดปัญหายิงซ้ำจาก network retry/timeout
- Consequence:
  - ต้องส่ง `Idempotency-Key` ฝั่ง client เมื่อ action critical

## ADR-002: เก็บ Audit Event ทั้ง Success และ Fail

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - action สำคัญต้อง log `audit_events` ทั้งสำเร็จและล้มเหลว
- Reason:
  - ตรวจสอบย้อนหลังด้าน security และ debugging
- Consequence:
  - ทุก route/service critical ต้องมี audit context

## ADR-003: ผูก Business + Audit + Idempotency ใน Transaction เดียว (flow critical)

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - ใน flow สำคัญให้รวมการเขียนข้อมูลหลัก + audit + idempotency result ใน transaction
- Reason:
  - ลดสถานะครึ่งสำเร็จครึ่งล้มเหลว
- Consequence:
  - service/repository ต้องรองรับ tx object

## ADR-004: Shipping Label ใช้ Provider Abstraction (STUB/HTTP)

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - สร้าง layer `lib/shipping/provider.ts` รองรับ `STUB` และ `HTTP`
- Reason:
  - dev/test ได้เร็ว และสลับ provider จริงได้โดยไม่รื้อ service
- Consequence:
  - ต้องมี env config สำหรับ HTTP provider

## ADR-005: ต้องมี Manual Fallback สำหรับ Shipping Communication

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - อนุญาตให้กรอก `shippingLabelUrl`/tracking แบบ manual และมีปุ่มส่งข้อมูลจัดส่ง + คัดลอกข้อความ
- Reason:
  - เมื่อ provider/API ส่งข้อความล้มเหลว ผู้ใช้ต้องทำงานต่อได้ทันที
- Consequence:
  - order detail ต้องมี UX สำหรับ manual send และบันทึกข้อมูลจัดส่งให้ครบก่อนส่ง

## Template สำหรับ ADR ใหม่

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Deprecated
- Decision:
- Reason:
- Consequence:
