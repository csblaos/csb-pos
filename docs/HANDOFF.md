# Handoff

## Snapshot Date

- February 17, 2026

## Changed (ล่าสุด)

- เพิ่มระบบ context กลาง:
  - `AI_CONTEXT.md`
  - `docs/CONTEXT_INDEX.md`
  - `docs/CODEBASE_MAP.md`
  - `docs/UI_ROUTE_MAP.md`
  - `docs/API_INVENTORY.md`
  - `docs/SCHEMA_MAP.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DECISIONS.md`
  - `docs/HANDOFF.md`
- เพิ่ม order shipping label flow:
  - route: `POST /api/orders/[orderId]/shipments/label`
  - service: `server/services/order-shipment.service.ts`
  - repository: `server/repositories/order-shipment.repo.ts`
  - provider abstraction: `lib/shipping/provider.ts`
- เพิ่ม payment/shipping status fields และ `order_shipments` schema/migration
- ปรับ UI order detail ให้สร้าง label ได้
- เพิ่ม env + README สำหรับ shipping provider
- เพิ่ม manual shipping fallback:
  - รองรับการกรอกลิงก์รูปบิล/ป้าย (`shippingLabelUrl`) ผ่าน `update_shipping`
  - เพิ่ม endpoint `POST /api/orders/[orderId]/send-shipping`
  - เพิ่ม endpoint `POST /api/orders/[orderId]/shipments/upload-label` สำหรับอัปโหลดรูปบิล/ป้ายขึ้น R2
  - รองรับปุ่มอัปโหลดจากเครื่อง + เปิดกล้องมือถือเพื่อถ่ายรูป (`capture=environment`)
  - เพิ่มปุ่ม `ส่งข้อมูลจัดส่งให้ลูกค้า` + `คัดลอกข้อความ` + quick link WhatsApp/Facebook
  - ปรับ validation ของ `shippingLabelUrl` ให้รองรับทั้ง `https://...` และลิงก์ภายใน `/orders/...`
- ปรับ UX หน้า `/orders` สำหรับสร้างออเดอร์:
  - ใช้ `SlideUpSheet` เดียวกันทั้งระบบ
  - Mobile: slide-up sheet (ปัดลง, กดนอกกล่อง, กด X ปิดได้)
  - Desktop: centered modal (กดนอกกล่อง, กด X, กด Escape ปิดได้)
  - ปุ่มสร้างออเดอร์ sticky ด้านล่างในฟอร์มเพื่อใช้งานง่ายบนจอเล็ก
  - ปรับฟอร์มส่วนตัวเลขให้ responsive (`grid-cols-1` บนจอเล็ก)
  - เพิ่ม Phase 1 สแกนบาร์โค้ดในฟอร์มออเดอร์ (เพิ่มสินค้าอัตโนมัติ + fallback ค้นหาเองเมื่อไม่พบ)

## Impact

- รองรับการสร้าง shipping label ได้ทั้งโหมดทดสอบ (`STUB`) และโหมด provider จริง (`HTTP`)
- ลดความเสี่ยงยิงซ้ำด้วย idempotency
- เพิ่ม traceability ผ่าน audit log
- มีเอกสารส่งต่องานให้ AI/ทีมชัดเจนขึ้น
- มี inventory กลางสำหรับ API/Schema ทำให้ AI ตัวถัดไปตามงานได้เร็วขึ้น
- มี route map หน้า UI -> API สำหรับ debug และ onboarding dev/AI ได้เร็วขึ้น
- ถ้า auto messaging ใช้ไม่ได้ ผู้ใช้ยังส่งข้อมูลจัดส่งแบบ manual ได้ทันที (ลดงานค้าง)
- ลดงาน manual copy/paste URL เพราะผู้ใช้แนบรูปจากเครื่องหรือกล้องได้ทันที
- ลด friction ข้ามอุปกรณ์ เพราะพฤติกรรมเปิด/ปิดฟอร์มเหมือนกันทั้ง mobile และ desktop
- ลดโอกาสกดผิดระหว่างทำงาน เพราะมี close affordance ครบ (outside click, X, swipe down, Escape)
- ลดเวลาสร้างออเดอร์หน้าร้านด้วยการสแกนบาร์โค้ดและ auto add รายการสินค้า

## Files (สำคัญ)

- `AI_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTEXT_INDEX.md`
- `docs/CODEBASE_MAP.md`
- `docs/UI_ROUTE_MAP.md`
- `docs/API_INVENTORY.md`
- `docs/SCHEMA_MAP.md`
- `docs/DECISIONS.md`
- `docs/HANDOFF.md`
- `app/api/orders/[orderId]/shipments/label/route.ts`
- `app/api/orders/[orderId]/shipments/upload-label/route.ts`
- `app/api/orders/[orderId]/send-shipping/route.ts`
- `server/services/order-shipment.service.ts`
- `server/repositories/order-shipment.repo.ts`
- `lib/shipping/provider.ts`
- `lib/storage/r2.ts`
- `components/app/order-detail-view.tsx`
- `components/app/orders-management.tsx`
- `lib/orders/messages.ts`
- `lib/orders/validation.ts`
- `app/api/orders/[orderId]/route.ts`
- `lib/db/schema/tables.ts`
- `drizzle/0027_tough_the_renegades.sql`
- `scripts/repair-migrations.mjs`

## How To Verify

1. โหลด env

```bash
set -a
source .env.local
set +a
```

2. DB

```bash
npm run db:repair
npm run db:migrate
```

3. Quality checks

```bash
npm run lint
npm run build
```

4. Functional check
- เปิด order ที่สถานะ `PACKED` หรือ `SHIPPED`
- กด `สร้าง Shipping Label`
- ตรวจว่ามี `trackingNo`/`labelUrl` และมี audit event
- กรอก `ลิงก์รูปบิล/ป้ายจัดส่ง` ด้วยมือ และกด `บันทึกข้อมูลจัดส่ง`
- ทดสอบปุ่ม `อัปโหลดรูปจากเครื่อง` และ `ถ่ายรูปจากกล้อง` ในหน้า order detail
- ยืนยันว่าอัปโหลดสำเร็จแล้ว `shippingLabelUrl` ถูกเติมอัตโนมัติ และกด `บันทึกข้อมูลจัดส่ง` ได้
- กด `ส่งข้อมูลจัดส่งให้ลูกค้า` และทดสอบปุ่ม `คัดลอกข้อความ`

## Known Issues / Notes

- build อาจเจอข้อผิดพลาด `.next ... [turbopack]_runtime.js` แบบชั่วคราวได้บางครั้ง (rerun แล้วผ่าน)
- ใน environment นี้มี DNS warning ไป Turso ระหว่าง build แต่ build จบได้

## Next Step (แนะนำลำดับ)

1. เพิ่ม outbox worker สำหรับส่งข้อความ shipping label ไป Facebook/WhatsApp
2. เพิ่ม retry/backoff/dead-letter สำหรับ provider HTTP
3. เพิ่ม webhook endpoint รับ tracking update จาก provider
4. เพิ่ม dashboard metric: label success rate, provider latency, fail reasons
