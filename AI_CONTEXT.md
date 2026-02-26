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
    - Mobile = slide-up sheet (ปัดลงจาก handle หรือ header/กดนอกกล่อง/กด X เพื่อปิด)
    - Desktop = centered modal (กดนอกกล่อง/กด X/Escape เพื่อปิด)
    - มีปุ่มไอคอน `Full Screen` แบบ toggle ที่ navbar:
      - Desktop (`lg` ขึ้นไป) แสดงเสมอเมื่อ browser รองรับ fullscreen
      - Touch device (POS tablet/mobile) แสดงได้เมื่อเปิด `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=true`
      - กดซ้ำเพื่อออก หรือกด `Esc`
    - ในฟอร์มสร้างออเดอร์รองรับสแกนบาร์โค้ดเพิ่มสินค้าอัตโนมัติ และ fallback ค้นหาเองเมื่อไม่พบ barcode
- Products:
  - หน้า `/products` มีปุ่ม `รีเฟรช` แบบ manual ที่ header (ไม่มี auto-refresh)
  - หน้า `/products` ใช้ server-side pagination สำหรับรายการสินค้า (รองรับ `q/category/status/sort/page/pageSize`) และปุ่ม `โหลดเพิ่มเติม` จะดึงหน้าถัดไปจาก API จริง
  - เพิ่มโครงสร้างฐานข้อมูล Variant แบบ Phase 1 แล้ว (`product_models`, `product_model_attributes`, `product_model_attribute_values` + คอลัมน์เชื่อมใน `products`) โดยยังไม่บังคับเปลี่ยน UX เดิมทันที
  - ฟอร์ม `เพิ่ม/แก้ไขสินค้า` ใน `/products` รองรับโหมด Variant แล้ว (กำหนด `model`, `variant label`, `sort order`, และ option key/value) โดย backend จะผูก `products.model_id` และเติม dictionary ใน `product_model_attributes`/`product_model_attribute_values` ให้อัตโนมัติ
  - ปรับ UX ฟอร์ม Variant ให้ชัดว่า "1 ฟอร์ม = 1 SKU" โดยเปลี่ยนคำเป็น `คุณสมบัติของ SKU นี้` และเพิ่มปุ่ม `บันทึกและเพิ่ม Variant ถัดไป` สำหรับสร้างรุ่นย่อยต่อเนื่อง
  - ในฟอร์ม Variant ผู้ใช้กรอกเฉพาะ `ชื่อคุณสมบัติ/ค่า` ได้เลย (ระบบสร้าง `attributeCode/valueCode` อัตโนมัติ); ช่องรหัสถูกย้ายไปปุ่ม `แสดงช่องรหัส (ขั้นสูง)`
  - ปรับ layout ส่วน Variant เป็น mobile-first: ลด grid ที่ล้นจอบนมือถือ, ปรับแถว option ให้ซ้อนในจอเล็ก, และเพิ่มปุ่มพับ/ขยาย Matrix เพื่อไม่ให้ modal ยาวเกินจำเป็น (รองรับ tablet/desktop ด้วย)
  - ปรับ visual hierarchy ของ create/edit modal (Variant/Matrix) ให้เป็นแนว flat UI ลด card ซ้อนหลายชั้น ใช้ spacing/ring เบา ๆ แทนกรอบหนาหลายชั้น เพื่ออ่านง่ายขึ้นบน mobile/tablet
  - เพิ่ม Matrix Variant Generator ใน create modal: ระบุแกน (เช่น Color/Size) แล้วระบบสร้างตารางหลายรุ่นย่อยพร้อมช่วยตั้ง SKU และรองรับบันทึกแบบ bulk ในครั้งเดียว
  - เมื่อ Matrix มีรายการแล้ว ระบบจะซ่อนปุ่มบันทึกแบบทีละ SKU (`บันทึกสินค้า` / `บันทึกและเพิ่ม Variant ถัดไป`) และใช้ปุ่มหลักที่ footer สำหรับ `ตรวจสอบและบันทึกหลายรุ่นย่อย`
  - Matrix รองรับทั้งแบบแกนเดียว (เช่น Color อย่างเดียว/Size อย่างเดียว) และ 2 แกน (เช่น Color + Size) โดยมี preset ปุ่มด่วน + checkbox `ใช้แกนที่ 2`
  - ปรับความกว้าง create/edit product modal บน desktop เป็น `max-w-3xl` เพื่อให้ Matrix และฟอร์ม Variant อ่านง่ายขึ้น (mobile/tablet ยังเป็น sheet responsive เดิม)
  - create/edit product modal ตั้งค่าไม่ให้ปิดเมื่อกด backdrop (กดนอกกล่อง) เพื่อลดการปิดฟอร์มโดยไม่ตั้งใจ
  - ช่อง `ชื่อสินค้าแม่ (Model)` ในฟอร์มสินค้าเป็นแบบ auto-suggest จากฐานข้อมูลจริง (`GET /api/products/models`) และยังพิมพ์ชื่อใหม่ได้หากไม่พบรายการ
  - ช่อง `ลำดับแสดง` ในโหมด Variant (create) ตั้งค่าอัตโนมัติจากลำดับถัดไปของ Model (`nextSortOrder`) และยังแก้เองได้; หากผู้ใช้แก้เอง ระบบจะหยุด override อัตโนมัติ
  - ช่อง `ชื่อ Variant` ในฟอร์ม Variant เป็นแบบ auto-suggest จาก Model เดียวกัน (`variantLabels`) แต่ไม่ auto-fill ทันที เพื่อหลีกเลี่ยงการกรอกผิดโดยไม่ตั้งใจ
  - ช่อง `SKU` ใน create modal จะ auto-generate จากชื่อสินค้า โดยทำ transliteration (ลาว/ไทย/อังกฤษ -> Latin) ก่อน และมีช่อง `ชื่ออ้างอิงอังกฤษ (optional)` + ปุ่ม `สร้างใหม่`; ช่องอ้างอิงอังกฤษพับไว้เป็นค่าเริ่มต้นและผู้ใช้กดเปิดได้เอง (ถ้ามีค่าแล้วจะแสดงค้าง)
  - ฟอร์มแก้ไขสินค้าใช้โครงเดียวกับ create ในส่วนช่วยสร้าง SKU แล้ว (มี `ชื่ออ้างอิงอังกฤษ (optional)` + ปุ่ม `สร้างใหม่`) แต่ยังคง policy ว่า edit ไม่ auto เปลี่ยน SKU เอง
  - ตอนสร้างสินค้าใหม่ หาก `SKU` ซ้ำ ระบบจะเติม suffix (`-2`, `-3`, ...) แล้วลองบันทึกใหม่อัตโนมัติจนได้ SKU ที่ไม่ซ้ำ (ภายในจำนวนครั้งที่กำหนด)
  - ส่วน `การแปลงหน่วย` ใน create/edit product มีปุ่มลัดเพิ่มหน่วย (`PACK(12)` / `BOX(60)` เมื่อมีหน่วยนั้นในระบบ), ปุ่ม `+ เพิ่มหน่วย` จะเลือกหน่วยที่ยังไม่ถูกใช้ก่อน และมี helper text ย้ำว่าตัวคูณต้องเทียบหน่วยหลักเสมอ
  - `scripts/repair-migrations.mjs` รองรับ fallback สำหรับโครงสร้าง Variant Phase 1 แล้ว (ใช้ได้กับฐานที่ขาดบาง migration)
  - `scripts/seed.mjs` เติม dummy data สำหรับสินค้าแบบ variant แล้ว (เช่น กล่องอาหารหลายขนาด, เสื้อยืดหลายสี/ไซซ์) เพื่อ demo flow ได้ทันทีหลัง `npm run db:seed`
  - รายการสินค้าในหน้า `/products` รองรับ swipe-left action บน mobile/tablet เพื่อเปิดปุ่ม `ปิดใช้งาน/เปิดใช้งาน` แบบรวดเร็ว
  - ฟอร์มใน `SlideUpSheet` รองรับ keyboard-aware บนมือถือ (เพิ่ม bottom inset ตาม virtual keyboard + ติดตาม viewport resize/scroll เพื่อเลื่อนช่องที่โฟกัสให้อยู่ในจอ)
  - ฟอร์มเพิ่ม/แก้ไขสินค้าใน `/products` มีปุ่ม `ยกเลิก` คู่กับ `บันทึก` ที่ footer ของ `SlideUpSheet` (ชิดล่างและไม่ลอยจากขอบ)
  - ฟอร์มแก้ไขสินค้าแสดงรูปปัจจุบันก่อน และจะสลับเป็น preview รูปใหม่เมื่อผู้ใช้เลือกรูปใหม่
  - ปุ่มรูปสินค้าใช้ `border-dashed` เฉพาะตอนยังไม่มีรูป และสลับเป็น `border-solid` เมื่อมีรูปแล้ว
  - การลบรูปสินค้าเป็นแบบ pending ในฟอร์มแก้ไข (ลบจริงเมื่อกด `บันทึก` เท่านั้น; กดยกเลิก/ปิดฟอร์มจะไม่ลบ)
  - หน้า Product Detail ไม่แสดงปุ่ม quick action เกี่ยวกับรูปแล้ว (จัดการรูปผ่านปุ่ม `แก้ไข` ในฟอร์มเดียว)
  - หน้า Product Detail ย้าย action หลัก (`แก้ไข/สำเนา/เปิด-ปิดใช้งาน/พิมพ์บาร์โค้ด`) ไป footer ของ `SlideUpSheet` แบบ sticky และเพิ่ม custom confirm dialog ก่อน `ปิดใช้งาน` (ไม่ใช้ browser alert) พร้อม animation เปิด/ปิด และจัดวางกล่องยืนยันกึ่งกลางจอ
  - ปุ่ม `ยืนยันปิดใช้งาน` ใน confirm dialog ใช้สี `primary` ของ theme (เอา style สีส้มแบบ hardcode ออก)
  - หน้า Product Detail ปรับรูปตัวอย่างให้เล็กลง (mobile `96px`, sm `112px`) และรองรับแตะรูปเพื่อเปิด preview เต็มจอ (ปิดได้ด้วยพื้นหลัง/ปุ่ม X/ปุ่ม Esc)
  - ใน Product Detail tab `ข้อมูล` เพิ่มปุ่ม `คัดลอก` สำหรับ `SKU` และ `บาร์โค้ด` พร้อม toast แจ้งผล
  - หน้า Product Detail แสดง `สต็อกคงเหลือปัจจุบัน` (จาก `stockAvailable`) คู่กับเกณฑ์เตือนสต็อกเพื่อประเมินเร็วขึ้น
  - หน้า Product Detail ปรับ loading state ของ footer เป็นรายปุ่ม: ปุ่ม `เปิด/ปิดใช้งาน` จะแสดง `กำลังอัปเดต...` และไม่ล็อกทั้ง modal อีกต่อไป
  - ปรับ Product Detail เพิ่มความปลอดภัย/การเข้าถึง: sanitize ข้อมูลก่อน inject เข้า popup พิมพ์บาร์โค้ด, sync สถานะ active ของ detail แบบ optimistic ทันที, และเพิ่ม `role="dialog"` + focus trap/restore focus ให้ image preview และ confirm modal
  - Modal สแกนบาร์โค้ดใน `/products` เปลี่ยนจากปุ่ม `สลับกล้อง` เป็น dropdown `เลือกกล้อง` (กรณีมีกล้องมากกว่า 1 ตัว) เพื่อเลือกกล้องที่ต้องการได้ตรง ๆ และจดจำกล้องล่าสุด
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
- Frontend:
  - `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH` (default: `false`)
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
