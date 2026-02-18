# AI Context - CSB POS

ไฟล์นี้เป็นจุดเริ่มต้นสำหรับ AI ทุกตัวที่เข้ามาทำงานต่อในโปรเจกต์นี้

อ่านตามลำดับแนะนำใน `docs/CONTEXT_INDEX.md`

## 1) Quick Start (ต้องอ่านก่อนแก้โค้ด)

1. โหลด env ก่อนรันคำสั่ง DB

```bash
set -a
source .env.local
set +a
```

2. คำสั่งมาตรฐานที่ใช้ตรวจงาน

```bash
npm run lint
npm run build
```

3. คำสั่งฐานข้อมูล

```bash
npm run db:repair
npm run db:migrate
```

## 2) Engineering Rules (บังคับใช้)

- ตอบผู้ใช้เป็นภาษาไทย
- แนะนำแนวทางก่อนลงมือแก้ใหญ่
- ห้ามใช้คำสั่งทำลายสถานะ git โดยไม่ได้รับอนุมัติ
- ถ้าแก้ `schema` ต้องมี migration และ snapshot/meta ให้ครบ
- ถ้าแก้ behavior/API/schema/env ต้องอัปเดตไฟล์ context:
  - `AI_CONTEXT.md`
  - `docs/HANDOFF.md`
  - `docs/UI_ROUTE_MAP.md` (เมื่อ flow หน้า -> API เปลี่ยน)
  - (ถ้ามีผลเชิงสถาปัตยกรรม) `docs/DECISIONS.md`

## 3) Project Layout (สำคัญ)

- `app/` Next.js App Router (UI + API routes)
- `app/api/` API endpoints
- `components/` React UI components
- `lib/` shared logic และ query helper
- `lib/db/schema/tables.ts` DB schema หลัก (Drizzle)
- `server/services/` business service layer
- `server/repositories/` data access layer
- `drizzle/` SQL migrations + meta
- `scripts/repair-migrations.mjs` repair/compat script

เอกสาร inventory:
- `docs/CODEBASE_MAP.md` แผนที่โค้ดทั้งระบบ (domain ownership)
- `docs/UI_ROUTE_MAP.md` แผนที่หน้า UI -> component -> API
- `docs/API_INVENTORY.md` รายการ API ทั้งระบบ
- `docs/SCHEMA_MAP.md` แผนผังตารางและความสัมพันธ์

## 4) Current Core Flows

- Orders:
  - `POST /api/orders`
  - `PATCH /api/orders/[orderId]`
  - `POST /api/orders/[orderId]/send-qr`
  - `POST /api/orders/[orderId]/send-shipping`
  - `POST /api/orders/[orderId]/shipments/label`
  - `POST /api/orders/[orderId]/shipments/upload-label`
  - UX `/orders`:
    - ใช้ `SlideUpSheet` ตัวเดียวกันทั้งสองอุปกรณ์
    - Mobile = slide-up sheet (ปัดลง/กดนอกกล่อง/กด X เพื่อปิด)
    - Desktop = centered modal (กดนอกกล่อง/กด X/Escape เพื่อปิด)
    - Mobile/Desktop มีปุ่มไอคอน `Full Screen` แบบ toggle ที่ navbar (กดซ้ำเพื่อออก หรือกด `Esc`)
    - ในฟอร์มสร้างออเดอร์รองรับสแกนบาร์โค้ดเพิ่มสินค้าอัตโนมัติ และ fallback ค้นหาเองเมื่อไม่พบ barcode
- Products:
  - หน้า `/products` มีปุ่ม `รีเฟรช` แบบ manual ที่ header (ไม่มี auto-refresh)
- Stock/Purchase:
  - stock movement และ purchase order flow ผ่าน service/repository
  - หน้า `/stock` มีปุ่ม `รีเฟรช` แบบ manual ที่ header (ไม่มี auto-refresh)
- Audit:
  - ใช้ `audit_events` และ `safeLogAuditEvent`
- Idempotency:
  - ใช้ `idempotency_requests` กับ action สำคัญ

## 5) Shipping Label (สถานะล่าสุด)

- มี schema `order_shipments` และคอลัมน์ใหม่ใน `orders`
- provider layer อยู่ที่ `lib/shipping/provider.ts`
- รองรับ 2 mode:
  - `SHIPPING_PROVIDER_MODE=STUB` (default)
  - `SHIPPING_PROVIDER_MODE=HTTP` (เรียก provider จริง)
- service หลัก:
  - `server/services/order-shipment.service.ts`
- manual fallback:
  - ผู้ใช้สามารถกรอก `shippingLabelUrl` เองในหน้า order detail
  - ผู้ใช้สามารถอัปโหลดรูปบิล/ป้ายจากเครื่องหรือถ่ายรูปจากกล้องมือถือได้
  - กดส่งข้อมูลจัดส่งผ่าน `send-shipping` หรือคัดลอกข้อความส่งมือได้
  - `shippingLabelUrl` รองรับทั้ง `https://...` และลิงก์ภายใน `/orders/...`

## 6) Required Environments (เฉพาะที่ใช้บ่อย)

- DB: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- Auth: `AUTH_JWT_SECRET`
- Cron: `CRON_SECRET`
- Shipping provider:
  - `SHIPPING_PROVIDER_MODE`
  - `SHIPPING_PROVIDER_HTTP_ENDPOINT`
  - `SHIPPING_PROVIDER_HTTP_TOKEN`
  - `SHIPPING_PROVIDER_HTTP_AUTH_SCHEME`
  - `SHIPPING_PROVIDER_TIMEOUT_MS`
- R2 upload (optional prefix):
  - `R2_ORDER_SHIPPING_LABEL_PREFIX`

## 7) Update Contract (Definition of Done)

ทุกงานที่เปลี่ยนพฤติกรรมระบบต้องมีหัวข้อต่อไปนี้ใน `docs/HANDOFF.md`:

- Changed
- Impact
- Files
- How to verify
- Next step
