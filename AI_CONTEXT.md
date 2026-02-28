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
  - modal `Product Detail` ตั้งค่าไม่ให้ปิดเมื่อกด backdrop แล้ว (`closeOnBackdrop=false`) เพื่อลดการปิดรายละเอียดสินค้าโดยไม่ตั้งใจ
  - modal `Product Detail` เพิ่ม inner spacing ของเนื้อหาอีกเล็กน้อย (`+4px` ต่อด้านจากค่า base ของ `SlideUpSheet`) เพื่อให้ช่องว่างอ่านง่ายขึ้นโดยไม่กระทบ modal อื่น
  - modal `เพิ่ม/แก้ไขสินค้า` และ `Product Detail` (ตอนแก้ต้นทุน) เพิ่ม custom confirm ก่อนปิดด้วยปุ่ม `ยกเลิก`/`X` เมื่อมีข้อมูลค้างที่ยังไม่บันทึก
  - ปุ่ม `ยืนยันปิดใช้งาน` ใน confirm dialog ใช้สี `primary` ของ theme (เอา style สีส้มแบบ hardcode ออก)
  - หน้า Product Detail ปรับรูปตัวอย่างให้เล็กลง (mobile `96px`, sm `112px`) และรองรับแตะรูปเพื่อเปิด preview เต็มจอ (ปิดได้ด้วยพื้นหลัง/ปุ่ม X/ปุ่ม Esc)
  - ใน Product Detail tab `ข้อมูล` เพิ่มปุ่ม `คัดลอก` สำหรับ `SKU` และ `บาร์โค้ด` พร้อม toast แจ้งผล
  - หน้า Product Detail แสดง `สต็อกคงเหลือปัจจุบัน` (จาก `stockAvailable`) คู่กับเกณฑ์เตือนสต็อกเพื่อประเมินเร็วขึ้น
  - หน้า Product Detail ปรับ loading state ของ footer เป็นรายปุ่ม: ปุ่ม `เปิด/ปิดใช้งาน` จะแสดง `กำลังอัปเดต...` และไม่ล็อกทั้ง modal อีกต่อไป
  - ปรับ Product Detail เพิ่มความปลอดภัย/การเข้าถึง: sanitize ข้อมูลก่อน inject เข้า popup พิมพ์บาร์โค้ด, sync สถานะ active ของ detail แบบ optimistic ทันที, และเพิ่ม `role="dialog"` + focus trap/restore focus ให้ image preview และ confirm modal
  - Modal สแกนบาร์โค้ดใน `/products` เปลี่ยนจากปุ่ม `สลับกล้อง` เป็น dropdown `เลือกกล้อง` (กรณีมีกล้องมากกว่า 1 ตัว) เพื่อเลือกกล้องที่ต้องการได้ตรง ๆ และจดจำกล้องล่าสุด
  - แก้ต้นทุนใน Product Detail (`update_cost`) ต้องกรอก `เหตุผล` เสมอ และระบบจะบันทึก audit action `product.cost.manual_update`
  - เมื่อรับสินค้าเข้า PO แล้วต้นทุนเปลี่ยน ระบบจะบันทึก audit action `product.cost.auto_from_po` อัตโนมัติ
  - Product payload (`GET /api/products`) มี `costTracking` เพิ่มเพื่อใช้แสดงที่มาของต้นทุนล่าสุด (source/time/actor/reason/reference)
  - การสลับแท็บสถานะสินค้า (`ทั้งหมด/ใช้งาน/ปิดใช้งาน`) ในหน้า `/products` ปรับให้ตอบสนองเร็วขึ้นด้วย client cache + request abort และมี skeleton loading ระหว่างรอผลหน้าแรกของ filter ใหม่ (แยกจาก loading ของปุ่ม `โหลดเพิ่มเติม`)
  - หน้า `/products` ผูกแท็บสถานะกับ URL query `status` แล้ว (เช่น `?status=inactive`) เพื่อให้ hard refresh / back-forward คงแท็บเดิม
- Stock/Purchase:
  - stock movement และ purchase order flow ผ่าน service/repository
  - หน้า `/stock` ใช้ปุ่ม `รีเฟรชแท็บนี้` ในแต่ละแท็บเป็นหลัก (ไม่มีปุ่มรีเฟรชรวมที่ header)
  - ฟอร์มบันทึกสต็อก manual ไม่ส่ง field `cost` ไป backend แล้ว (ลดความเข้าใจผิดว่ามีผลต่อต้นทุนสินค้า)
  - ใน PO detail sheet (`/stock` tab purchase) ปรับ error handling ให้แสดงข้อความจริงจาก API (เช่น 404/403) แทนการ fallback ว่า `ไม่พบข้อมูล` เสมอ และยกเลิก request เก่าเมื่อเปลี่ยนรายการ PO เร็ว ๆ
  - `scripts/repair-migrations.mjs` รองรับเติมคอลัมน์ `purchase_orders.updated_by/updated_at` (compat สำหรับฐานที่เคยข้าม migration 0025) เพื่อกัน 500 ใน `GET /api/stock/purchase-orders/[poId]`
  - หน้า `/stock` tab `สั่งซื้อ (PO)` เอาปุ่มลัด `ตั้งค่า PDF` ออกจาก header แล้ว (ไปตั้งค่าที่หน้า `/settings/pdf?tab=po` แทน)
  - หน้า `/stock?tab=purchase` แยกการทำงานเป็น 3 workspace ในหน้าเดียว: `PO Operations` (งานรายวัน), `Month-End Close` (pending rate + bulk settle), `AP by Supplier` (statement/filter/export)
  - ใน Create PO (Step 1) ช่อง `ชื่อซัพพลายเออร์` เป็น hybrid input แล้ว: พิมพ์ชื่อใหม่ได้ และมีปุ่ม `ดูซัพพลายเออร์ทั้งหมด` เปิด list picker (ค้นหา/แตะเลือกจากประวัติ PO) เพื่อให้ใช้งานบน mobile ได้เสถียรกว่า `datalist`
  - ช่อง `เบอร์ติดต่อ` ใน Create/Edit PO ใช้ `type="tel"` + `inputMode="tel"` แล้ว เพื่อให้มือถือเปิด numeric/tel keyboard โดยตรง
  - ใน Create PO (Step 2) ส่วน `เพิ่มสินค้า` เพิ่มปุ่ม `ดูสินค้าทั้งหมด/ซ่อนรายการสินค้า` แล้ว: ผู้ใช้เลือกสินค้าได้ทันทีจาก list picker โดยไม่ต้องพิมพ์ค้นหาก่อน และยังค้นหาด้วยชื่อ/SKU ได้เหมือนเดิม
  - ใน Create PO (Step 2/3) ช่องตัวเลข `ราคา/₭`, `ค่าขนส่ง`, `ค่าอื่นๆ` ปรับเป็นค่าว่างเริ่มต้น + `placeholder: 0`; ถ้าไม่กรอกระบบจะตีความเป็น `0` ตอนคำนวณและตอนบันทึกอัตโนมัติ
  - ใน Create PO/แก้ไข PO ช่องวันที่ `คาดว่าจะได้รับ` และ `ครบกำหนดชำระ` ปรับ responsive ใหม่: mobile แสดงแยกบรรทัด (1 คอลัมน์), จอใหญ่ค่อยจัด 2 คอลัมน์ และเพิ่ม `min-w-0/max-w-full` กัน date input ล้นจอ
  - เนื่องจาก `input[type=date]` บนมือถือไม่รองรับ placeholder สม่ำเสมอ จึงเพิ่ม helper text + quick actions (`วันนี้`, `+7 วัน`, `สิ้นเดือน`, `ล้างค่า`) สำหรับช่องวันที่ใน Create PO และ Edit PO
  - เพิ่ม hardening บน mobile สำหรับ PO detail/edit: `SlideUpSheet` content กัน overflow แนวนอน (`overflow-x-hidden`) และ date input ใน Edit PO ใช้ฟอนต์ 16px บนมือถือ (`text-base`) เพื่อลด iOS auto-zoom/อาการล้นจอ
  - เพิ่มคลาส `po-date-input` + global CSS (coarse pointer) เพื่อบังคับ `width/max-width/min-width` และควบคุม `::-webkit-datetime-edit` สำหรับ native date input ลดเคสล้นจอบนมือถือจริง (Create/Edit PO + Month-End filters)
  - ช่อง `คาดว่าจะได้รับ` / `ครบกำหนดชำระ` ใน Create PO และ Edit PO เปลี่ยนเป็น custom datepicker (calendar popover + เก็บค่า `YYYY-MM-DD`) แล้ว เพื่อลด dependency กับ native date control บน iOS
  - ใน modal `คิว PO รอปิดเรท` (Month-End bulk) ช่องตัวเลข `อัตราแลกเปลี่ยนจริง` และ `ยอดชำระรวมตาม statement` ใช้ placeholder `0` โดยไม่ prefill ค่า `0` ลง input
  - modal `Create PO` ตั้งค่าไม่ให้ปิดเมื่อกด backdrop แล้ว (`closeOnBackdrop=false`) และเพิ่มปุ่ม `ยกเลิก` ที่ footer เพื่อปิดฟอร์มอย่างชัดเจน
  - modal `Create PO` เพิ่ม custom confirm ก่อนปิดเมื่อมีข้อมูลค้าง (ทั้งกดปุ่ม `ยกเลิก` และปุ่ม `X`) เพื่อลดการทิ้งฟอร์มโดยไม่ตั้งใจ
  - workspace tabs (`PO Operations`/`Month-End Close`/`AP by Supplier`) ถูกแยกเป็นบล็อกนำทางเฉพาะและแสดงใต้บล็อก KPI เพื่อคง hierarchy `summary ก่อน action`
  - ใน workspace `PO Operations` ค่าเริ่มต้นของรายการเปลี่ยนเป็น `งานเปิด (OPEN)` แทน `ทั้งหมด` เพื่อลด noise ตอนเข้าแท็บ และยังสลับ `ทั้งหมด` ได้จาก filter chip
  - หน้า `/stock?tab=purchase` ปรับลำดับ section ให้ `ตัวชี้วัดและทางลัด` แสดงก่อน แล้วค่อย `โหมดการทำงาน`; การ์ด KPI ใช้โทนสีปกติ (neutral slate) ทั้งหมด
  - summary strip ด้านบน (`Open PO`, `Pending Rate`, `Overdue AP`, `Outstanding`) เป็น KPI summary-only (ไม่คลิก) และใช้สีคงที่ไม่เปลี่ยนตาม preset; shortcut ใช้ saved preset chip ด้านล่างเพื่อพาไป workspace + ตัวกรองด่วน พร้อมแถบ `Applied filter` สำหรับล้าง/บันทึก preset
  - จำ workspace ล่าสุดด้วย `workspace` query + localStorage และ sync ตัวกรองหลักลง URL (`poStatus`, `due`, `payment`, `sort`) เพื่อแชร์ลิงก์มุมมองเดียวกันในทีมได้
  - ปรับ UX ตอนสลับ workspace/filter ที่ sync ลง URL: ฝั่ง client เก็บ/restore scroll position (best-effort) หลัง `router.replace` เพื่อลดอาการเด้งขึ้นบนระหว่างเปลี่ยนโหมดการทำงาน
  - `poStatus` จะไม่ถูกใส่ใน URL เมื่อเป็นค่า default (`OPEN`); ถ้าผู้ใช้เลือก `ทั้งหมด` หรือสถานะอื่น ระบบจะเก็บค่าใน URL เพื่อคงมุมมองเดิมหลัง refresh/share link
  - แก้ race condition ตอนเข้า `AP by Supplier` แล้วเด้งกลับ workspace เดิม: การ sync filter ฝั่ง AP จะยึด query ล่าสุดจาก URL และบังคับคง `workspace=SUPPLIER_AP` ระหว่างอัปเดต `due/payment/sort`
  - รองรับ Saved preset ต่อผู้ใช้ (เก็บใน localStorage) สำหรับเรียก shortcut ที่ใช้บ่อย และลบ preset ได้จากหน้าเดียวกัน
  - localStorage ของ workspace/preset ในแท็บ PO ผูก key ราย `storeId + userId` แล้ว (ลดโอกาส preset ปนกันเมื่อใช้เครื่องร่วมกัน); มี fallback migrate จาก key เก่าอัตโนมัติ
  - ตอน logout (รวมกรณี relogin หลังเปลี่ยนรหัสผ่าน) ระบบจะล้าง localStorage กลุ่ม `csb.stock.purchase.*` เพื่อไม่ทิ้ง preset/workspace ค้างข้ามผู้ใช้บนเครื่องเดียว
  - PO สกุลเงินต่างประเทศรองรับโหมด `รอปิดเรท`: ตอนสร้าง PO สามารถไม่กรอก `exchangeRate` ได้ และไปปิดเรทจริงภายหลังผ่าน `POST /api/stock/purchase-orders/[poId]/finalize-rate`
  - PO detail แสดงสถานะเรท (`รอปิดเรท`/`ปิดเรทแล้ว`) และมี action `ปิดเรท` เมื่อ PO อยู่สถานะ `RECEIVED` และยังไม่ล็อกเรท
  - เพิ่มคิว `PO รอปิดเรท` ผ่าน `GET /api/stock/purchase-orders/pending-rate` (filter ซัพพลายเออร์/ช่วงวันที่รับของ) เพื่อไล่งานค้างปลายงวด
  - เพิ่ม action `บันทึกชำระ PO` ผ่าน `POST /api/stock/purchase-orders/[poId]/settle` รองรับยอดชำระบางส่วน (`amountBase`) และบังคับว่าถ้า PO ต่างสกุลเงินต้อง `ปิดเรท` ก่อน
  - เพิ่ม action `อัปเดตค่าขนส่ง/ค่าอื่นหลังรับสินค้า` ผ่าน `POST /api/stock/purchase-orders/[poId]/apply-extra-cost`:
    - ใช้ได้เฉพาะ PO สถานะ `RECEIVED` ที่ยังไม่ `PAID`
    - รองรับเคสสร้าง PO ก่อน (ค่าส่งยังไม่มา) แล้วค่อยใส่ยอดจริงปลายเดือน
    - อัปเดตยอด AP/Outstanding ทันที และคำนวณ `landedCostPerUnit` ในรายการ PO ใหม่จาก `qtyReceived` โดยไม่ recost ย้อนย้อนหลังสินค้า
  - เพิ่ม action `ย้อนรายการชำระ` ผ่าน `POST /api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse` (idempotent)
  - เพิ่ม export `เจ้าหนี้ค้างจ่าย + FX delta` ผ่าน `GET /api/stock/purchase-orders/outstanding/export-csv`
  - เพิ่ม AP ราย supplier แบบ drill-down ในแท็บ PO:
    - summary supplier ผ่าน `GET /api/stock/purchase-orders/ap-by-supplier`
    - statement ราย supplier ผ่าน `GET /api/stock/purchase-orders/ap-by-supplier/statement` (filter: `paymentStatus/dueFilter/dueFrom/dueTo/q`)
    - export statement ราย supplier ผ่าน `GET /api/stock/purchase-orders/ap-by-supplier/export-csv`
    - ใน panel `AP ราย supplier` รองรับเลือกหลาย PO แล้ว `บันทึกชำระแบบกลุ่ม` ได้แล้ว (reuse `POST /api/stock/purchase-orders/[poId]/settle` รายรายการแบบลำดับ)
    - รองรับกรอก `ยอดชำระรวมตาม statement` (optional) เพื่อ auto-allocate แบบ `oldest due first`; ถ้าไม่กรอกจะชำระเต็มยอดค้างของรายการที่เลือก
  - หน้า `/stock?tab=purchase` เพิ่ม panel `AP ราย supplier` (ค้นหา supplier, เลือก supplier, ดู statement และกดเปิด PO detail ต่อได้ทันที)
  - คิว `PO รอปิดเรท` รองรับ workflow ปลายเดือนแบบกลุ่ม:
    - เลือกหลาย PO แล้ว `ปิดเรท + ชำระปลายเดือน` ได้ในครั้งเดียว
    - บังคับเลือก PO สกุลเดียวกันต่อรอบ และใส่ `paymentReference` รอบบัตรเดียวกัน
    - ฝั่ง client จะเรียก `finalize-rate` และ `settle` ราย PO แบบลำดับ พร้อมรายงานรายการที่ไม่สำเร็จ
    - รองรับ `manual-first reconcile`: กรอก `ยอด statement` ได้ครั้งเดียวต่อรอบ แล้วระบบจะ auto-match ยอดลง PO ตาม `dueDate` เก่าสุดก่อน (oldest due first); ถ้าไม่กรอกยอด statement จะชำระเต็มยอดค้างของรายการที่เลือก
  - `purchase_orders` เก็บ baseline เรท (`exchangeRateInitial`) + due date (`dueDate`) + summary ชำระ (`paymentStatus/paidAt/paidBy/paymentReference/paymentNote`)
  - ledger การชำระอยู่ที่ `purchase_order_payments` (`PAYMENT`/`REVERSAL`) และคำนวณยอด `totalPaidBase/outstandingBase` จาก ledger
  - แท็บ `สั่งซื้อ (PO)` เพิ่ม cache รายละเอียด PO ต่อ `poId` และ prefetch แบบ intent-driven (hover/focus/touch) เพื่อเปิด detail ได้เร็วขึ้น พร้อม invalidate cache เมื่อมีการแก้ไข/เปลี่ยนสถานะ
  - หน้า `/stock` ใช้ `StockTabs` แบบ keep-mounted (mount ครั้งแรกตามแท็บที่เข้าแล้วคง state เดิมไว้) ลดการรีเซ็ตฟอร์ม/รายการเมื่อสลับแท็บ
  - ทั้ง 3 แท็บหลัก (`สั่งซื้อ`, `บันทึกสต็อก`, `ประวัติ`) มี toolbar มาตรฐาน: `รีเฟรชแท็บนี้` + เวลา `อัปเดตล่าสุด HH:mm`
  - เพิ่ม state มาตรฐานต่อแท็บ: loading skeleton / empty state / error + ปุ่ม retry
  - `บันทึกสต็อก` เพิ่ม quick preset (`รับเข้า`, `ปรับยอด`, `ของเสีย`) พร้อม note template และส่ง `Idempotency-Key` ตอน `POST /api/stock/movements` จาก client
  - ลิงก์ `ดูประวัติทั้งหมด` ในแท็บบันทึกสต็อก เปลี่ยนเป็น `router.push(?tab=history)` (ไม่ hard reload)
  - แท็บ `ประวัติ` ใช้ server-side pagination/filter ผ่าน `GET /api/stock/movements?view=history` รองรับกรอง `ประเภท/สินค้า/ช่วงวันที่`
  - รายการในแท็บ `ประวัติ` ใช้ windowed virtualization เพื่อลดภาระ render เมื่อจำนวนรายการต่อหน้าสูง
- Reports:
  - `grossProfit` ใน reports มีทั้ง realized (`cogs` + `grossProfit`) และ current-cost preview (`currentCostCogs` + `currentCostGrossProfit` + `grossProfitDeltaVsCurrentCost`)
  - มีสรุป `FX delta (PO)` และ `AP Aging` (`0-30 / 31-60 / 61+`) พร้อม export CSV PO ค้างชำระ (`/api/stock/purchase-orders/outstanding/export-csv`)
  - แก้ query `getOutstandingPurchaseRows` ให้ `totalPaidBase` ปิดวงเล็บ SQL ครบแล้ว (ป้องกัน 500 ใน endpoint กลุ่ม AP supplier/aging/export)
- Dashboard:
  - ใช้ `getDashboardViewData` ฝั่ง server query (ไม่มี browser call ตรงไป `/api`)
  - เพิ่ม reminder งาน AP ค้างชำระใน dashboard (`overdue` / `due soon`) โดย reuse due-status logic เดียวกับ `purchase-ap.service`
  - แสดงรายการเตือนสูงสุด 5 PO พร้อมยอดค้าง และลิงก์ไป `/stock?tab=purchase` เพื่อตามงานต่อ
- Notifications:
  - เพิ่ม in-app inbox สำหรับ AP due/overdue ที่หน้า `/settings/notifications`
  - เพิ่ม quick inbox ใน navbar (`AppTopNav`) พร้อม bell badge + action `อ่านแล้ว` และ deep-link ไป `/stock?tab=purchase` / `/settings/notifications`
  - quick inbox บนจอ non-desktop (`<1024px`) ใช้ popover card แบบเดียวกับ desktop แต่ render แบบ fixed-centered (ผ่าน portal) เพื่อกันการล้นซ้าย และจำกัดความสูง (`~68dvh`)
  - navbar คงปุ่ม `เปลี่ยนร้าน` แต่ปรับเป็น compact (icon-first) และซ่อนปุ่มเมื่ออยู่หน้า `/settings/stores`
  - เพิ่ม API inbox:
    - `GET/PATCH /api/settings/notifications/inbox` (list + mark read/unread/resolve)
    - ถ้า schema notification ยังไม่พร้อม (`notification_inbox`/`notification_rules` ยังไม่มี) `GET` จะ fallback เป็นรายการว่างพร้อม `warning` แทนการ 500; `PATCH` จะตอบ 503 พร้อมข้อความแนะนำให้รัน `db:repair` + `db:migrate`
    - `PATCH /api/settings/notifications/rules` (mute/snooze/clear ราย PO)
  - เพิ่ม cron endpoint `GET /api/internal/cron/ap-reminders` (ใช้ `CRON_SECRET`) เพื่อ sync แจ้งเตือนจาก `getPurchaseApDueReminders`
  - เพิ่ม GitHub Actions workflow `.github/workflows/ap-reminders-cron.yml` เป็น external scheduler fallback (เหมาะกับ Vercel Free) โดยยิง endpoint เดิมด้วย secret
  - sync ใช้ dedupe key ต่อ PO+dueStatus+dueDate และจะ resolve อัตโนมัติเมื่อ PO ไม่เข้าเงื่อนไขเตือนแล้ว
  - เพิ่มตาราง `notification_inbox` + `notification_rules` (รองรับ mute/snooze ต่อ PO)
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
  - สำหรับ GitHub Actions fallback ให้ตั้ง repository secrets เพิ่ม: `CRON_ENDPOINT`, `CRON_SECRET`
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
