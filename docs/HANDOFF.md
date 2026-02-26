# Handoff

## Snapshot Date

- February 26, 2026

## Changed (ล่าสุด)

- ปรับฟอร์ม `แก้ไขสินค้า` ใน `/products`:
  - แสดงรูปสินค้าปัจจุบันก่อนเลือกไฟล์ใหม่
  - เมื่อเลือกไฟล์ใหม่จะแสดง preview รูปใหม่ทันที
  - หากลบไฟล์ใหม่ที่เลือก จะกลับไปแสดงรูปปัจจุบัน
  - เพิ่มปุ่ม `ยกเลิก` คู่กับปุ่ม `บันทึก` ใน footer ของฟอร์มเพิ่ม/แก้ไขสินค้า และย้าย action bar ไปอยู่ `SlideUpSheet.footer` เพื่อให้ชิดขอบล่าง
  - ย้ายปุ่ม action ใน Product Detail (`แก้ไข/สำเนา/เปิด-ปิดใช้งาน/พิมพ์บาร์โค้ด`) ไป footer ของ modal แบบ sticky
  - เพิ่ม custom confirm dialog ก่อนปุ่ม `ปิดใช้งาน` ใน Product Detail (ไม่ใช้ browser alert) พร้อม animation เปิด/ปิด และจัดวาง dialog กึ่งกลางจอ
  - ปรับขนาดรูปใน Product Detail ให้เล็กลง (mobile `96px`, sm `112px`) และรองรับแตะรูปเพื่อเปิด preview เต็มจอ (ปิดได้ด้วยพื้นหลัง/ปุ่ม X/ปุ่ม Esc)
  - Modal สแกนบาร์โค้ดใน `/products` เปลี่ยนจากปุ่ม `สลับกล้อง` เป็น dropdown `เลือกกล้อง` (แสดงเมื่อมีกล้องมากกว่า 1 ตัว) เพื่อเลือกกล้องที่ต้องการโดยตรง
  - หน้า `/products` เปลี่ยนรายการสินค้าเป็น server-side pagination/filter/sort โดย `โหลดเพิ่มเติม` จะเรียก `GET /api/products` หน้าถัดไปจริง (ไม่ slice array ฝั่ง client)
  - เพิ่มโครงสร้างฐานข้อมูลรองรับสินค้าแบบ Variant (Phase 1) แบบ additive:
    - ตารางใหม่: `product_models`, `product_model_attributes`, `product_model_attribute_values`
    - คอลัมน์ใหม่ใน `products`: `model_id`, `variant_label`, `variant_options_json`, `variant_sort_order`
    - เพิ่มเอกสารแผน rollout: `docs/product-variants-plan.md`
    - อัปเดต `scripts/repair-migrations.mjs` ให้รองรับ fallback ของตาราง/คอลัมน์ Variant Phase 1
  - เพิ่มการรองรับ Variant ใน flow สินค้า (Phase 2 เริ่มใช้งานจริง):
    - ฟอร์ม `เพิ่ม/แก้ไขสินค้า` มี section `Variant` (toggle, model name, variant label, sort order, options key/value)
    - `POST /api/products` และ `PATCH /api/products/[productId]` รองรับ payload `variant`
    - backend จะหา/สร้าง `product_models` อัตโนมัติ และเติม dictionary ใน `product_model_attributes` / `product_model_attribute_values`
    - list/detail สินค้าแสดงข้อมูล model/variant ที่บันทึกไว้
    - ปรับ copy ในฟอร์มเป็น `คุณสมบัติของ SKU นี้` และเพิ่ม helper text ว่า 1 ฟอร์มบันทึกได้ทีละ 1 SKU
    - ปรับ UX ช่อง Variant options: ค่าเริ่มต้นให้กรอกเฉพาะ `attributeName/valueName` และให้ระบบสร้าง code อัตโนมัติ (ช่อง `attributeCode/valueCode` ซ่อนไว้ในโหมดขั้นสูง)
    - ปรับ layout ส่วน Variant ใน create/edit modal ให้ mobile-first (ไม่ล้นจอมือถือ): เปลี่ยน grid ให้ responsive, แถว option รองรับจอแคบ, และเพิ่มปุ่มพับ/ขยาย Matrix
    - Matrix generator รองรับแบบ 1 แกนหรือ 2 แกน (มี preset `Color อย่างเดียว`, `Size อย่างเดียว`, `Color + Size` และ checkbox `ใช้แกนที่ 2`)
    - ปรับสไตล์ modal เป็น flat hierarchy ลดปัญหา card-in-card-in-card (ลดกรอบซ้อน เหลือ spacing + ring แบบเบา)
    - เพิ่มความกว้าง create/edit product modal บน desktop เป็น `max-w-3xl` (ผ่าน prop ใหม่ของ `SlideUpSheet`) เพื่อให้กรอก Matrix/Variant ได้สบายขึ้น
    - create/edit product modal ปิดการ close เมื่อกด backdrop (คลิกนอกกล่อง) เพื่อลดการสูญเสียข้อมูลจากการปิดฟอร์มโดยไม่ตั้งใจ
    - ช่อง `ชื่อสินค้าแม่ (Model)` เปลี่ยนจาก `datalist` เป็น auto-suggest dropdown ที่ดึงจาก DB ผ่าน `GET /api/products/models` (รองรับเลือกชื่อเดิมหรือพิมพ์ชื่อใหม่)
    - ช่อง `ลำดับแสดง` ใน create + variant เป็น auto by default ตาม `nextSortOrder` ของ Model และยังแก้เองได้ (เมื่อผู้ใช้แก้เองจะไม่ถูก auto override)
    - ช่อง `ชื่อ Variant` เป็น auto-suggest จากรุ่นย่อยเดิมของ Model เดียวกัน (`variantLabels`) แต่ไม่ auto-fill อัตโนมัติ เพื่อกันการบันทึกผิด
    - ช่อง `SKU` ใน create modal auto-generate จากชื่อสินค้าโดยแปลงเป็น Latin ก่อน (รองรับชื่อภาษาลาว/ไทย) และมีช่อง `ชื่ออ้างอิงอังกฤษ (optional)` + ปุ่ม `สร้างใหม่`; ช่องอ้างอิงอังกฤษพับไว้เป็นค่าเริ่มต้นและให้ผู้ใช้เปิดเองได้, เมื่อผู้ใช้แก้ `SKU` เอง ระบบจะไม่ auto ทับ
    - ฟอร์ม `แก้ไขสินค้า` ปรับให้ใช้ UX ช่วยสร้าง SKU แบบเดียวกับ create (เพิ่ม `ชื่ออ้างอิงอังกฤษ (optional)` และปุ่ม `สร้างใหม่`) โดยยังไม่ auto เปลี่ยน SKU เองในโหมด edit
    - ถ้าชื่อที่ใช้สร้าง SKU แปลงเป็น Latin ไม่ได้ ระบบจะ fallback เป็นรหัสรูปแบบ running (`P-000001` หรือ `CAT-000001`)
    - ถ้าบันทึก create แล้วเจอ `SKU` ซ้ำ ระบบจะ auto เติม suffix (`-2`, `-3`, ...) และ retry ให้จนบันทึกผ่าน (หรือครบจำนวนครั้ง)
    - ส่วน `การแปลงหน่วย` เพิ่ม quick templates (`PACK(12)` / `BOX(60)` เมื่อมีหน่วยในระบบ), ปุ่ม `+ เพิ่มหน่วย` เลือกหน่วยที่ยังไม่ถูกใช้อัตโนมัติ, และเพิ่ม helper text อธิบายว่าค่าตัวคูณต้องเทียบกับหน่วยหลักเสมอ
    - เพิ่มปุ่ม `บันทึกและเพิ่ม Variant ถัดไป` (เฉพาะ create + variant) เพื่อสร้างรุ่นย่อยต่อเนื่องโดยไม่ปิดฟอร์ม
    - เมื่อกด `บันทึกและเพิ่ม Variant ถัดไป` ระบบคงค่าหลักไว้ แต่เคลียร์ `SKU/Barcode/รุ่นย่อย` สำหรับกรอก SKU ถัดไป
    - เพิ่ม `Matrix Variant Generator` ใน create modal:
      - ระบุแกนตัวเลือก (เช่น Color/Size) แล้วสร้างตารางรุ่นย่อยอัตโนมัติ
      - ช่วยตั้งค่า `variant label` และ `SKU` ต่อแถว
      - รองรับปุ่มสร้างบาร์โค้ดสำหรับแถวที่ยังว่าง และบันทึกหลายรุ่นย่อยแบบ bulk ครั้งเดียว
    - เมื่อมีแถวใน Matrix แล้ว footer ของ modal จะสลับเป็น action หลักแบบเดียว `ตรวจสอบและบันทึกหลายรุ่นย่อย` และซ่อนปุ่มบันทึกทีละ SKU เพื่อลดการกดผิด flow
  - กรอบรูปสินค้า: `border-dashed` เฉพาะตอนยังไม่มีรูป และเป็น `border-solid` เมื่อมีรูปแล้ว
  - การลบรูปปัจจุบันทำงานแบบ pending และจะลบจริงเฉพาะตอนกด `บันทึก`
  - เอาปุ่ม quick action รูป (`เปลี่ยนรูป`/`ลบรูป`) ออกจาก Product Detail และให้จัดการรูปผ่านฟอร์ม `แก้ไข` เท่านั้น
  - Product Detail modal:
    - sanitize ข้อมูลก่อน inject เข้า popup พิมพ์บาร์โค้ด (ลดความเสี่ยง XSS)
    - sync สถานะ `active` ใน detail card แบบ optimistic ทันทีเมื่อกดเปิด/ปิดใช้งาน (และ rollback เมื่อ API fail)
    - เพิ่ม `role="dialog"`/`aria-modal` + keyboard focus trap/restore focus ให้ทั้ง image preview และ confirm ปิดใช้งาน
    - ปรับ grid ปุ่ม action ใน footer ให้ responsive ตามจำนวนปุ่มจริง (ลดช่องว่างเมื่อ permission ไม่ครบ)
    - ปุ่ม `ยืนยันปิดใช้งาน` เปลี่ยนไปใช้สี `primary` ของ theme (ไม่ hardcode amber)
    - ใน tab `ข้อมูล` เพิ่มปุ่ม `คัดลอก` สำหรับค่า `SKU` และ `บาร์โค้ด` (มี toast แจ้งผลคัดลอกสำเร็จ/ล้มเหลว)
    - แสดง `สต็อกคงเหลือปัจจุบัน` (`stockAvailable`) ใน card เกณฑ์เตือนสต็อก
    - ยกเลิกการ lock ทั้ง Product Detail modal ระหว่าง toggle active; loading จะเกิดเฉพาะปุ่ม `เปิด/ปิดใช้งาน` พร้อมข้อความ `กำลังอัปเดต...`
- อัปเดต `scripts/seed.mjs`:
  - เพิ่ม dummy data สินค้าแบบ variant สำหรับ demo (`กล่องอาหาร` และ `เสื้อยืด Basic`)
  - seed ตาราง `product_models`, `product_model_attributes`, `product_model_attribute_values`
  - seed สินค้า variant ใน `products` พร้อม opening stock
  - summary หลัง seed แสดงจำนวน `product_models` และ `variant_products`
- ปรับ `SlideUpSheet` ให้รองรับ mobile keyboard:
  - เพิ่ม keyboard-aware bottom inset เมื่อ virtual keyboard เปิด
  - เมื่อ focus `input/select/textarea` ใน sheet จะเลื่อนช่องกรอกมาอยู่ในมุมมองอัตโนมัติ
  - ติดตาม `visualViewport` resize/scroll เพื่อ re-align ช่องที่โฟกัสระหว่างคีย์บอร์ดกำลังเปิด/ปิด
  - รองรับ drag down เพื่อปิดจากทั้ง handle และแถบ header บน mobile (ไม่ชนกับปุ่มปิด X)
- ปรับปุ่ม `Full Screen` ที่ navbar:
  - Desktop (`lg` ขึ้นไป) แสดงปุ่มเมื่อ browser รองรับ fullscreen
  - Touch device (POS tablet/mobile) แสดงปุ่มได้เมื่อตั้ง `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=true`
  - ซ่อนปุ่มเมื่อ browser ไม่รองรับ fullscreen
- ปรับ UX หน้า `/products`:
  - เพิ่มปุ่ม `รีเฟรช` แบบ manual ในบรรทัดเดียวกับ title `สินค้า` และวางด้านขวา
  - ปุ่มมีสถานะ `กำลังรีเฟรช...` ระหว่างโหลด และยังไม่เปิด auto-refresh
- ปรับ UX หน้า `/stock`:
  - เพิ่มปุ่ม `รีเฟรช` แบบ manual ในบรรทัดเดียวกับ title `สต็อก` และวางด้านขวา
  - ปุ่มมีสถานะ `กำลังรีเฟรช...` ระหว่างโหลด และยังไม่เปิด auto-refresh
- ปรับ UX หน้า `/orders` บน Desktop:
  - ย้ายปุ่ม `Full Screen` ไปที่ navbar หลัก และปรับเป็นปุ่มไอคอน
  - กดซ้ำเพื่อออกจาก Full Screen ได้ และรองรับออกด้วยปุ่ม `Esc`
  - Desktop (`lg` ขึ้นไป) แสดงปุ่ม และ Touch device แสดงได้ผ่าน env flag สำหรับ POS
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

- ผู้ใช้รีโหลดข้อมูลสินค้าล่าสุดได้ทันทีจาก header โดยไม่ต้องรีโหลดทั้งหน้าเอง
- ผู้ใช้รีโหลดข้อมูลสต็อกล่าสุดได้ทันทีจาก header โดยไม่ต้องเปลี่ยนแท็บหรือรีโหลดทั้งหน้าเอง
- ลดการกดซ้ำด้วยสถานะโหลดบนปุ่มรีเฟรช
- ลดเคสช่องกรอกใน modal ถูกคีย์บอร์ดมือถือบัง โดยเฉพาะฟอร์มสร้าง/แก้ไขสินค้า
- ลดอาการช่องกรอกหลุดใต้คีย์บอร์ดระหว่าง animation ของคีย์บอร์ด (เช่น iOS/Android บางรุ่น)
- ใช้งานปิด modal ด้วยมือเดียวได้ง่ายขึ้น เพราะลากปิดได้จาก header ไม่ต้องเล็งเฉพาะ handle
- ผู้ใช้มีทางออกจากฟอร์มที่ชัดเจนขึ้นด้วยปุ่ม `ยกเลิก` ใน footer (ไม่ต้องพึ่ง X/ลากลงอย่างเดียว)
- ปุ่ม action หลักในฟอร์มสินค้าอยู่ตำแหน่งคงที่ชิดขอบล่างของ modal (ลดความรู้สึกว่าปุ่มลอย)
- ปุ่ม action หลักของ Product Detail อยู่ตำแหน่งคงที่ที่ footer ใช้งานง่ายขึ้นเมื่อเลื่อนดูข้อมูลยาว
- ลดความเสี่ยงกดปิดใช้งานผิดพลาดด้วย custom confirm dialog ก่อนทำรายการ และ feedback การเปิด/ปิดลื่นขึ้นจาก animation
- ลดพื้นที่รูปที่กินใน Product Detail และยังดูรายละเอียดรูปได้ด้วย full-screen preview เมื่อแตะรูป
- ลดความสับสนเวลาแก้ไขสินค้า เพราะผู้ใช้เห็นรูปปัจจุบันก่อนตัดสินใจเปลี่ยนรูป
- ทำให้ affordance ชัดขึ้นว่า “มีรูปแล้ว” vs “ยังไม่มีรูป”
- ลดความเสี่ยงลบรูปผิดพลาด เพราะการลบมีผลเมื่อผู้ใช้กดบันทึกเท่านั้น
- ลดความซ้ำซ้อนของปุ่มใน Product Detail โดยรวม action รูปไว้ใน Edit Modal จุดเดียว
- ลดจำนวนการกดซ้ำตอนเปลี่ยนกล้องใน scanner เพราะเลือกกล้องจาก dropdown ได้ทันทีแทนการกดวนทีละตัว
- ลด payload เริ่มต้นของหน้า `/products` และทำให้หน้ารองรับร้านที่มีสินค้าจำนวนมากได้ดีขึ้นด้วย server-side pagination
- วางฐาน schema สำหรับรองรับ variant โดยไม่กระทบ flow เดิมของ order/stock (ลดความเสี่ยง rollout แบบยกเครื่องครั้งเดียว)
- เริ่มใช้งาน variant ได้จากหน้า `/products` จริง โดยยังคงโครง `1 variant = 1 sellable SKU` เดิม (order/stock ไม่ต้องรื้อ)
- ลดงาน manual จัดการ dictionary variant เพราะระบบเติม attribute/value ให้จาก payload ตอนบันทึกสินค้า
- ลดความสับสนในการใช้งานฟอร์ม variant เพราะ UI สื่อชัดขึ้นว่าเพิ่มได้ทีละ SKU
- เพิ่มความเร็วตอนคีย์หลายรุ่นย่อยด้วยปุ่ม `บันทึกและเพิ่ม Variant ถัดไป` (ไม่ต้องเปิดฟอร์มใหม่ทุกครั้ง)
- เพิ่ม throughput การคีย์สินค้าแบบมีหลายรุ่นย่อยด้วย Matrix Generator (ลดการกรอกซ้ำแบบทีละ SKU)
- ลด error manual ตอนกรอกชื่อรุ่นย่อย/SKU ซ้ำ ๆ ด้วยการ generate ตารางเริ่มต้นให้จากแกนตัวเลือก
- ลดเวลาทดสอบ/เดโมระบบ เพราะรัน `db:seed` แล้วมีข้อมูล variant พร้อมใช้งานทันที
- ลดความเสี่ยงฐานข้อมูลบางสภาพแวดล้อมตก migration บางช่วง เพราะ `db:repair` รองรับเติมโครง Variant Phase 1 ได้
- ใช้พื้นที่หน้าจอเต็มบน Desktop ได้ทันที ลดสิ่งรบกวนระหว่างใช้งาน POS
- ผู้ใช้ยังคุม UX เองได้ (ไม่บังคับเข้าเต็มจออัตโนมัติ)
- เข้าถึงปุ่มเต็มจอได้สม่ำเสมอผ่าน navbar โดยไม่ผูกกับการ์ดเฉพาะหน้า
- รองรับ POS touch device ที่ต้องการ fullscreen จริงผ่าน env flag โดยไม่บังคับผู้ใช้มือถือทั่วไป
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
- `docs/product-variants-plan.md`
- `docs/HANDOFF.md`
- `app/api/orders/[orderId]/shipments/label/route.ts`
- `app/api/orders/[orderId]/shipments/upload-label/route.ts`
- `app/api/orders/[orderId]/send-shipping/route.ts`
- `server/services/order-shipment.service.ts`
- `server/repositories/order-shipment.repo.ts`
- `lib/shipping/provider.ts`
- `lib/storage/r2.ts`
- `components/app/order-detail-view.tsx`
- `components/app/app-top-nav.tsx`
- `components/ui/slide-up-sheet.tsx`
- `components/app/orders-management.tsx`
- `components/app/products-management.tsx`
- `app/(app)/products/page.tsx`
- `app/api/products/route.ts`
- `app/api/products/[productId]/route.ts`
- `lib/products/service.ts`
- `lib/products/validation.ts`
- `lib/products/variant-options.ts`
- `lib/products/variant-persistence.ts`
- `components/app/products-header-refresh-button.tsx`
- `components/app/stock-header-refresh-button.tsx`
- `lib/orders/messages.ts`
- `lib/orders/validation.ts`
- `app/(app)/stock/page.tsx`
- `app/api/orders/[orderId]/route.ts`
- `lib/db/schema/tables.ts`
- `drizzle/0027_tough_the_renegades.sql`
- `drizzle/0028_bouncy_justin_hammer.sql`
- `scripts/repair-migrations.mjs`
- `scripts/seed.mjs`

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
- เปิดหน้า `/products` แล้วตรวจว่ามีปุ่ม `รีเฟรช` อยู่ขวาบนบรรทัดเดียวกับ title `สินค้า`
- กดปุ่ม `รีเฟรช` และตรวจว่าปุ่มแสดง `กำลังรีเฟรช...` ระหว่างโหลด
- เปิดหน้า `/stock` แล้วตรวจว่ามีปุ่ม `รีเฟรช` อยู่ขวาบนบรรทัดเดียวกับ title `สต็อก`
- กดปุ่ม `รีเฟรช` และตรวจว่าปุ่มแสดง `กำลังรีเฟรช...` ระหว่างโหลด
- เปิด `/products` > เพิ่มสินค้าใหม่ บนมือถือ แล้วโฟกัสช่องกรอกล่าง ๆ (เช่น threshold/conversion) เพื่อตรวจว่าหน้าฟอร์มเลื่อนตามและไม่ถูกคีย์บอร์ดบัง
- เปิด `/products` > แก้ไขสินค้า บนมือถือ แล้วสลับโฟกัสช่องบน/ล่างซ้ำหลายครั้งขณะคีย์บอร์ดเปิดอยู่ เพื่อตรวจว่าช่องที่โฟกัสยังอยู่ในมุมมองเสมอ
- เปิด modal บนมือถือแล้วลองลากลงจากแถบ header: ต้องปิดได้เหมือนลากจาก handle และปุ่ม `X` ต้องกดปิดได้ปกติ
- เปิดฟอร์มเพิ่ม/แก้ไขสินค้าแล้วตรวจว่า footer มีปุ่ม `ยกเลิก` และ `บันทึก` ชิดขอบล่างของ modal; กด `ยกเลิก` แล้วต้องปิดฟอร์มได้ทันที
- เปิด Product Detail แล้วตรวจว่าปุ่ม `แก้ไข/สำเนา/เปิด-ปิดใช้งาน/พิมพ์บาร์โค้ด` อยู่ที่ footer แบบ sticky
- กด `ปิดใช้งาน` ใน Product Detail ต้องมี custom confirm dialog (ไม่ใช่ browser alert) พร้อม animation เปิด/ปิด และแสดงกึ่งกลางจอ; กดยืนยันแล้วสถานะต้องเปลี่ยนสำเร็จ
- เปิด Product Detail แล้วตรวจว่าขนาดรูปเล็กลง; แตะรูปแล้วต้องเปิด preview เต็มจอและกดปิดได้ทั้งพื้นหลัง, ปุ่ม `X`, และปุ่ม `Esc`
- เปิด modal สแกนบาร์โค้ดใน `/products` บนอุปกรณ์ที่มีกล้องมากกว่า 1 ตัว แล้วตรวจว่ามี dropdown `เลือกกล้อง`; เมื่อเปลี่ยนกล้องต้องสลับกล้องตามที่เลือกได้ทันที
- เปิด `/products` แล้วตรวจว่าเห็นรายการชุดแรก ~30 รายการ จากนั้นกด `โหลดเพิ่มเติม` ต้องดึงหน้าถัดไปเพิ่ม และจำนวนผลรวมข้าง filter ต้องอิง `total` จาก API
- ลองค้นหา/กรองหมวด/สถานะ/เรียงลำดับ แล้วกด `โหลดเพิ่มเติม` อีกครั้งเพื่อตรวจว่า API ยังคงใช้พารามิเตอร์เดิม (`q`,`categoryId`,`status`,`sort`) พร้อม `page` ที่ถูกต้อง
- เปิด `/products` > เพิ่มสินค้าใหม่ > เปิด toggle `Variant` แล้วกรอก `Model + Variant + options` จากนั้นบันทึก
- ใน create modal เมื่อเปิด `Variant` ต้องเห็น helper text ว่า "ฟอร์มนี้บันทึกได้ทีละ 1 SKU"
- ใน create modal เมื่อเปิด `Variant` ต้องเห็นปุ่ม `บันทึกและเพิ่ม Variant ถัดไป`; กดแล้วฟอร์มต้องไม่ปิด และเคลียร์ `SKU/Barcode/ชื่อรุ่นย่อย`
- ใน create modal เมื่อเปิด `Variant` ต้องเห็น section `สร้างหลายรุ่นย่อยอัตโนมัติ (Matrix)`:
  - กรอกแกนตัวเลือกแล้วกด `สร้างตารางรุ่นย่อย` ต้องได้รายการหลายแถว
  - กด `สร้างบาร์โค้ดที่ยังว่าง` แล้วแถวที่ยังไม่มีบาร์โค้ดต้องถูกเติมค่า
  - กด `บันทึกหลายรุ่นย่อย` แล้วต้องสร้างสินค้าได้ตามจำนวนแถวที่ valid
- เปิดสินค้าที่สร้างแล้วใน Product Detail ต้องเห็น `สินค้าแม่ (Model)`, `รุ่นย่อย`, และ chip ของตัวเลือก
- แก้ไขสินค้าเดิมแล้วปิด toggle `Variant` จากนั้นบันทึก และตรวจว่า detail แสดง `Model/Variant` เป็น `—` (เคลียร์ค่า variant ได้)
- ลองบันทึก variant เดิมซ้ำใน model เดียวกัน (options ชุดเดียวกัน) ต้องได้ข้อความ conflict (กันซ้ำระดับ model+options)
- รัน `npm run db:migrate` แล้วตรวจใน DB ว่ามีตาราง `product_models`, `product_model_attributes`, `product_model_attribute_values` และคอลัมน์ใหม่ใน `products` ครบ
- รัน `npm run db:repair` บนฐานที่ยังไม่ครบ migration เพื่อตรวจว่า script สามารถเติมตาราง/คอลัมน์ของ Variant Phase 1 ได้โดยไม่ error
- รัน `npm run db:seed` แล้วตรวจว่ามีสินค้า variant ตัวอย่าง:
  - `FBX-750`, `FBX-1000`
  - `SHT-WHT-M`, `SHT-BLK-L`
  และใน summary ต้องแสดง `product_models` กับ `variant_products` มากกว่า 0
- เปิด `/products` > รายละเอียดสินค้า > แก้ไขสินค้า แล้วตรวจว่าเห็นรูปปัจจุบันทันที ก่อนเลือกรูปใหม่
- เลือกรูปใหม่แล้วตรวจว่า preview เปลี่ยนเป็นรูปใหม่ และกดลบรูปที่เลือกแล้วกลับมาเห็นรูปปัจจุบัน
- ตรวจกรอบรูป: ไม่มีรูปต้องเป็นเส้น dashed และเมื่อมีรูปต้องเป็นเส้น solid
- ใน edit modal กดตั้งค่าลบรูปปัจจุบัน แล้วกดปิด/ยกเลิกฟอร์ม: กลับมาเปิดใหม่ต้องยังเห็นรูปเดิม (ยังไม่ถูกลบ)
- ใน edit modal กดตั้งค่าลบรูปปัจจุบัน แล้วกด `บันทึก`: รูปต้องถูกลบจริง
- ใน Product Detail ต้องไม่เห็นปุ่ม quick action รูป (`เปลี่ยนรูป`/`ลบรูป`)
- เปิดหน้าในโซนแอปบน Desktop แล้วตรวจว่ามีปุ่มไอคอน `Full Screen` ที่ navbar
- ตั้ง `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=false` แล้วเปิดหน้าในโซนแอปบน Mobile/Tablet เพื่อตรวจว่าไม่แสดงปุ่ม `Full Screen`
- ตั้ง `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=true` แล้วเปิดหน้าในโซนแอปบน POS tablet/mobile (browser ที่รองรับ fullscreen) เพื่อตรวจว่าแสดงปุ่ม `Full Screen`
- กดปุ่มเพื่อเข้าเต็มจอ และกดซ้ำ/กด `Esc` เพื่อออก
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
