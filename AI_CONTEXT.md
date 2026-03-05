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
  - `GET /api/orders/cod-reconcile`
  - `POST /api/orders/cod-reconcile`
  - `POST /api/orders/[orderId]/send-qr`
  - `POST /api/orders/[orderId]/send-shipping`
  - `POST /api/orders/[orderId]/shipments/label`
  - `POST /api/orders/[orderId]/shipments/upload-label`
  - UX `/orders`:
    - หน้า `/orders` โฟกัสงานจัดการออเดอร์ที่สร้างแล้ว และใช้ CTA เดียว `เข้าโหมด POS` เพื่อไปหน้าเต็ม `/orders/new` (ถอดปุ่ม `สร้างด่วน` ออกจากหน้า manage)
    - ตารางรายการออเดอร์ใน `/orders` (desktop/tablet) คลิกได้ทั้งแถวเพื่อเข้า `/orders/[orderId]` แล้ว (ไม่จำกัดเฉพาะการกดเลข `SO-...`)
    - หน้า `/orders` แยกการมองสถานะรับที่ร้านชัดขึ้น: เคส `READY_FOR_PICKUP` จะแสดง badge รอง `ค้างจ่าย` หรือ `ชำระแล้ว` จาก `paymentStatus` (ทั้ง list มือถือและตาราง desktop/tablet)
    - ปรับถ้อยคำ badge สถานะค้างชำระจาก `รอชำระ` เป็น `ค้างจ่าย` ทั้งหน้า `/orders` และ `/orders/[orderId]` (รวม label `รับสินค้าแล้ว (...)`)
    - เพิ่มปุ่มลัด `ปิดยอด COD รายวัน` ไปหน้า `/orders/cod-reconcile` (แสดงเมื่อผู้ใช้มีสิทธิ์ `orders.mark_paid`)
    - ใช้ `SlideUpSheet` ตัวเดียวกันทั้งสามช่วงหน้าจอ
    - Mobile (`<768px`) = slide-up sheet (ปัดลงจาก handle หรือ header/กดนอกกล่อง/กด X เพื่อปิด)
    - Tablet (`768-1199px`) = centered sheet ขนาด `min(45rem, 100vw-2rem)` สูงสุด `92dvh`
    - Desktop (`>=1200px`) = centered modal (กดนอกกล่อง/กด X/Escape เพื่อปิด)
    - custom modal/sheet แบบ legacy ของ settings ถูก migrate เข้า `SlideUpSheet` กลางครบแล้ว:
      - migrate แล้ว: settings `categories`, `units`, `store payment accounts`, `users`, `stores`, และ force-change password modal ในหน้า `login`
    - นโยบาย responsive ของ overlay ทั้งระบบ: mobile `<768` ยังเป็น bottom sheet, และเริ่ม centered mode ที่ `>=768`
    - มีปุ่มไอคอน `Full Screen` แบบ toggle ที่ navbar:
      - Desktop (`>=1200px`) แสดงเสมอเมื่อ browser รองรับ fullscreen
    - Touch device (POS tablet/mobile) แสดงได้เมื่อเปิด `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=true`
    - กดซ้ำเพื่อออก หรือกด `Esc`
    - ฟอร์มสร้างออเดอร์ใน `/orders/new` รองรับสแกนบาร์โค้ดเพิ่มสินค้าอัตโนมัติ และ fallback ค้นหาเองเมื่อไม่พบ barcode
    - scanner ของ `/orders/new` ใช้คอมโพเนนต์กลาง `components/app/barcode-scanner-panel.tsx` แล้ว พร้อม permission sheet มาตรฐาน (`ยกเลิก` + `อนุญาตและสแกน`) แบบเดียวกับ `/products` และ `/stock`
    - ฟอร์มสร้างออเดอร์ใน `/orders/new` เริ่มต้นด้วยตะกร้าว่าง (`items: []`) ไม่ preload สินค้าอัตโนมัติ
  - UX `/orders/new`:
    - หน้าเต็มแบบ POS layout (ตัด heading/description หน้า create ออก): แถบ `ค้นหา + สแกน` ด้านบน, product card grid ตรงกลาง, และ cart action bar ด้านล่าง
    - อัปเดตดีไซน์เป็น `Scan-First POS` แบบ adaptive: Desktop (`>=1200px`) ใช้ 3 คอลัมน์ (`หมวด/ทางลัด` + `รายการสินค้า` + `ตะกร้า`), Tablet (`768-1199px`) ใช้ 2 คอลัมน์ (`สินค้า` + `ตะกร้า`), Mobile (`<768px`) ใช้ 1 คอลัมน์ + sticky checkout bar
    - ตะกร้าในจอ tablet/desktop ปรับเป็น inline editor (เปลี่ยนหน่วย, +/- จำนวน, ลบรายการ) จาก panel ด้านขวาโดยตรง เพื่อลดการเปิด modal ซ้ำ
    - desktop app shell ใช้ความกว้างมาตรฐาน `80rem` (และรองรับโหมดกว้าง `90rem` สำหรับหน้าข้อมูลหนาแน่นในอนาคต)
    - ซ่อน bottom tab navigation อัตโนมัติเมื่ออยู่หน้า `/orders/new` เพื่อให้โหมดสร้างออเดอร์แบบโฟกัสและได้พื้นที่แนวตั้งมากขึ้นบนมือถือ
    - ปุ่ม back บน navbar ใช้ label `กลับรายการออเดอร์` และมี custom confirm dialog ก่อนออกเมื่อมี draft ที่ยังไม่บันทึกในหน้า create order (เลิกใช้ browser `window.confirm`)
    - product card แสดงรูปย่อสินค้า (`imageUrl`) พร้อม fallback placeholder เมื่อไม่มีรูป
    - product card ในหน้า POS ถูกย่อให้ compact ขึ้นบนมือถือ (padding/thumbnail/typography เล็กลงเล็กน้อย) เพื่อให้เห็นสินค้าได้ต่อหน้าจอมากขึ้น
    - product picker มี category chips ใต้ search (`ทั้งหมด` + หมวดหมู่สินค้า) และใช้งานร่วมกับ filter `เฉพาะมีสต็อก`
    - เอา filter เรียงสินค้า (`แนะนำ/ชื่อ A-Z/ราคาต่ำ-สูง/ราคาสูง-ต่ำ`) ออกจาก flow create order แล้วทั้งหน้า `/orders/new` และ quick add POS-lite ในหน้า `/orders` เพื่อลดการตัดสินใจหน้าแคชเชียร์
    - ยกเลิก sidebar `เลือกหมวดเร็ว` ในหน้า `/orders/new`; เหลือการเลือกหมวดผ่าน chips ใต้ search เพียงจุดเดียวเพื่อลดความซ้ำซ้อนของตัวกรอง
    - ปุ่ม `สแกนบาร์โค้ด` ในแถบค้นหาหน้า `/orders/new` ปรับเป็น icon-only button (มี `aria-label`/`title`) เพื่อลดพื้นที่หัวแถบค้นหา
    - แถวควบคุมด้านบนของ search (`ค้นหา + สแกน + filter สต็อก`) ปรับเป็น 3 คอลัมน์บรรทัดเดียวบนมือถือ และย่อข้อความ filter จาก `เฉพาะมีสต็อก` เป็น `มีสต็อก`/`มีสต็อก✓`
    - บล็อกค้นหาด้านบนของหน้า `/orders/new` (search + filter + category chips + scanner helper) เป็น sticky แบบ full-width แล้ว (ถอดกรอบการ์ดออก) เพื่อใช้พื้นที่คอนเทนต์ได้เต็มและค้นหา/สแกนได้ตลอดระหว่างเลื่อนรายการสินค้า
    - ปรับ sticky search ลงอีกเล็กน้อยเป็น `top-[3.8rem]` ทั้ง mobile/desktop และคง `border-b` ใต้บล็อกค้นหา เพื่อลดอาการชิดเกินไปและยังแยกเลเยอร์กับรายการสินค้าให้ชัดขึ้น
    - ดึงคอนเทนต์หน้า `/orders/new` ขึ้นด้วย `-mt-4` เพื่อปิดช่องว่างระหว่าง navbar กับ search section (ไม่เหลือ empty gap ตอนหน้าเริ่มแสดง)
    - หน้า `/orders/new` รองรับ draft persistence ใน `sessionStorage` แล้ว: ถ้ารีเฟรชหน้า ระบบจะกู้คืนตะกร้า/ข้อมูล checkout ล่าสุดอัตโนมัติ (TTL 60 นาที)
    - เมื่อกดยืนยันออกจากหน้า `/orders/new` ผ่านปุ่ม back (`กลับรายการออเดอร์`) หรือ logout ระบบจะล้าง draft ค้างของหน้า create order ทันที
    - modal `ชำระเงินและรายละเอียดออเดอร์` ตั้งค่าไม่ให้ปิดเมื่อกด backdrop แล้ว (`closeOnBackdrop=false`)
    - เมื่อกดปิด modal `ชำระเงินและรายละเอียดออเดอร์`:
      - ถ้ามีข้อมูลในขั้นตอน checkout ที่ถูกกรอก/ปรับจากค่าเริ่มต้น จะขึ้น custom confirm ก่อนปิด
      - ถ้ายังไม่มีข้อมูลในขั้นตอน checkout จะปิดได้ทันที (ไม่ขึ้น confirm)
    - การ์ดรายการในตะกร้า (ทั้ง panel ด้านขวาและ `ตะกร้าสินค้า` sheet) ปรับเป็น minimal: ลดข้อความรอง, ลด padding, เน้นแถว `หน่วย + จำนวน +/- + ยอดบรรทัด` เพื่อเห็นรายการได้มากขึ้นต่อจอ
    - panel ตะกร้าใน tablet/desktop ปรับ footer ให้ติดล่างตลอด (ยอดรวม + ปุ่ม `ถัดไป: ชำระเงิน`) และให้เฉพาะรายการสินค้าเป็นโซน scroll เพื่อลดการเลื่อนหาปุ่มเมื่อรายการยาว
    - โครง `สินค้า + ตะกร้า` ของหน้า `/orders/new` ตั้ง `md:items-start` และปรับ cart rail ให้คำนวณ `top`/`height` แบบไดนามิกจากความสูงจริงของ search sticky (`ResizeObserver`) โดยจูนค่าคงที่ปัจจุบันเป็น `CREATE_ONLY_CART_STICKY_GAP_FALLBACK_PX=13` และ `CREATE_ONLY_CART_STICKY_EXTRA_TOP_PX=13`
    - breakpoint sticky ปัจจุบันตั้ง `TABLET_MIN_WIDTH_PX` เท่ากับ `DESKTOP_MIN_WIDTH_PX` (`1200`) แบบ intentional เพื่อให้ tablet/desktop ใช้สูตร sticky เดียวกัน
    - ปุ่มลบสินค้าในตะกร้าอนุญาตให้ลบได้จนตะกร้าเหลือ `0` รายการแล้ว (ไม่บังคับต้องเหลือรายการสุดท้าย)
    - การ์ดสินค้าในตะกร้า (panel และ cart sheet) แสดงข้อความ `คงเหลือ ...` ต่อรายการ เพื่อให้เช็กสต็อกได้ระหว่างปรับจำนวน
    - แถวตะกร้า lock ความกว้างคอลัมน์ `ยอดบรรทัด` แล้ว เพื่อให้ช่อง `select หน่วย` มีความกว้างสม่ำเสมอทุกบรรทัด (ไม่แกว่งตามจำนวนหลักของราคา)
    - สรุปตะกร้า (จำนวนชิ้น/ยอดรวม) ในหน้า create order เปลี่ยนไปอ่านค่าด้วย `useWatch` และคำนวณ subtotal/cartQty แบบตรงจาก state ปัจจุบัน เพื่อให้ค่า update ตามการแก้ qty/หน่วยแบบ real-time ทุกมุมมอง
    - บังคับ stock guard ฝั่ง UI ตอนเพิ่มสินค้าแล้ว: ถ้า `available <= 0` (รวมเคสของคงเหลือติดจอง) จะเพิ่มสินค้าไม่ได้ และปุ่ม `+` ในตะกร้าจะเพิ่มได้ไม่เกิน `available`
    - sticky checkout bar บนมือถือปรับเป็น flow เดียว `ตะกร้า` + ปุ่มหลัก `ถัดไป: ชำระเงิน` พร้อมสรุปจำนวนรายการ/ชิ้น เพื่อลดความสับสนจากหลายปุ่ม action
    - ปุ่ม `ตะกร้า` ใน sticky bar มือถือขยาย tap target และตัวอักษร (`h-9`, `text-sm`, `font-semibold`) เพื่อกดง่ายขึ้น
    - ปุ่มลัดตะกร้า/ชำระเงินบนมือถือในหน้า `/orders/new` ปรับตำแหน่งเป็นชิดก้นจอ (`bottom: env(safe-area-inset-bottom) + 0.75rem`) เพื่อลดช่องว่างลอยด้านล่าง
    - เมื่อผู้ใช้กดสินค้า `หมดสต็อก/ติดจอง` ในหน้า POS ระบบจะแจ้ง toast error ทันทีว่าเพิ่มไม่ได้ (พร้อม throttle กัน toast ซ้ำรัว)
    - modal checkout ของหน้า `/orders/new` ย้ายปุ่ม `สร้างออเดอร์` ไป `SlideUpSheet.footer` (แทน sticky ในเนื้อหา form) เพื่อให้พื้นหลังส่วนปุ่มชิดขอบล่างสม่ำเสมอและไม่เห็นเนื้อหาใต้ปุ่มตอน scroll
    - เอาการ์ดหัวบนของหน้า POS ที่มี `step 1-3 + สรุปตะกร้า` ออกแล้ว (รวมทั้ง heading ซ้ำ) เพื่อให้ส่วนบนกระชับและเห็นรายการสินค้าได้เร็วขึ้น
    - checkout เพิ่มตัวเลือก `ประเภทออเดอร์` 3 flow (`Walk-in ทันที` / `มารับที่ร้านภายหลัง` / `สั่งออนไลน์/จัดส่ง`) และแสดง field แบบ dynamic ตาม flow
    - flow `สั่งออนไลน์/จัดส่ง` ปรับ `เลือกลูกค้า` เป็น optional แล้ว (ไม่บังคับ `contactId`) เพื่อรองรับช่วงที่ยังไม่เชื่อม API รายชื่อลูกค้า; ผู้ใช้สามารถกรอกชื่อ/เบอร์เองได้
    - flow `สั่งออนไลน์/จัดส่ง` ปรับ UX กรอกลูกค้า/ที่อยู่:
      - ช่องทางออเดอร์ออนไลน์เปลี่ยนจาก dropdown เป็นปุ่ม grid 3 ตัวเลือก (`Facebook`, `WhatsApp`, `อื่นๆ`)
      - ถ้าเลือก `อื่นๆ` จะแสดง input ชื่อแพลตฟอร์มแบบไม่บังคับ (ใช้เป็นข้อมูลช่วยกรอกชั่วคราวก่อนเชื่อม API เต็ม)
      - `เลือกลูกค้า (ไม่บังคับ)` เป็น section พับ/เปิด และแสดงสรุปลูกค้าที่เลือก
      - เพิ่มช่อง `เติมข้อมูลลูกค้าแบบเร็ว` (paste ข้อความแล้วกดเติมอัตโนมัติ) เพื่อช่วยแยก `ชื่อ/เบอร์/ที่อยู่` เบื้องต้น
      - เพิ่ม section `ข้อมูลขนส่ง` สำหรับ online flow: เริ่มต้นค่า `ผู้ให้บริการขนส่ง` เป็นว่างเสมอ (ไม่ auto select), ผู้ใช้ต้องเลือกเองก่อนสร้างออเดอร์; UI เป็นปุ่ม grid จาก master table `shipping_providers` ของร้าน + ปุ่ม `อื่นๆ` (กรอกชื่อผู้ให้บริการเพิ่มเองได้), และระบบ seed ค่าเริ่มต้น (`Houngaloun`, `Anousith`, `Mixay`) ให้ร้านใหม่/ฐานเดิมอัตโนมัติ
      - เพิ่มหน้า settings `/settings/store/shipping-providers` และ API `/api/settings/store/shipping-providers` สำหรับจัดการรายการขนส่ง (เพิ่ม/แก้ไข/ปิดใช้งาน/ลบ) โดยรายการนี้ถูกนำไปใช้ใน POS flow ออนไลน์ทันที
    - โหมด `Walk-in ทันที` ซ่อนช่อง `ชื่อลูกค้า` และ `เบอร์โทร` เพื่อเร่งการขายหน้าร้าน; ถ้าสลับกลับเข้า Walk-in จาก flow อื่น ระบบจะล้างค่าลูกค้าที่เคยกรอกไว้ในฟอร์ม checkout ให้อัตโนมัติ
    - โหมด `มารับที่ร้านภายหลัง` พับฟิลด์ `ชื่อลูกค้า`/`เบอร์โทร` เป็นค่าเริ่มต้น และให้ผู้ใช้กดปุ่ม `+ เพิ่มข้อมูลผู้รับ (ไม่บังคับ)` เพื่อเปิดกรอกเมื่อจำเป็น พร้อมแสดงสถานะสรุปเมื่อยังพับฟิลด์ไว้
    - UI `ส่วนลด` ใน checkout ปรับเป็น action panel: มีปุ่ม `เปิด/ปิดส่วนลด`, quick preset (`5%/10%/20%`), สลับโหมดกรอก `%` หรือ `จำนวนเงิน`, และแสดง `คิดส่วนลดจริง` แบบทันที (ยังคงเก็บค่า `discount` เดิมฝั่ง API) โดยแถว `จำนวนเงิน/%/preset` อยู่บรรทัดเดียวและเลื่อนแนวนอนในจอแคบเพื่อประหยัดพื้นที่ พร้อมเส้นคั่นกลางแยกกลุ่มโหมดกับ preset ให้มอง flow ชัดขึ้น
    - ช่อง `ค่าขนส่ง` ใน checkout ออนไลน์ (`ค่าส่งที่เรียกเก็บ` + `ต้นทุนค่าส่ง`) เปลี่ยนเป็น section พับ/เปิดแบบเดียวกับส่วนลดและ default ปิด; เมื่อกดปิดจะรีเซ็ตทั้งสองค่าเป็น `0`
    - layout desktop ของ checkout ออนไลน์ปรับให้การ์ด `ส่วนลด` และ `ค่าขนส่ง` อยู่บรรทัดเดียวแบบ 2 คอลัมน์ความกว้างเท่ากัน (1:1) เพื่อลดความรู้สึกว่า panel ค่าขนส่งใหญ่กว่า
    - `วิธีรับชำระ` ใน checkout เปลี่ยนจาก dropdown เป็นปุ่มเลือก (chips) แล้ว: หน้าร้าน/รับที่ร้านใช้ `เงินสด`, `QR`, `ค้างจ่าย`; ออนไลน์ใช้ `เงินสด`, `QR`, `ค้างจ่าย`, `COD` (เพิ่ม enum `ON_CREDIT` สำหรับค้างจ่าย และบังคับว่า `COD` ใช้ได้เฉพาะ `ONLINE_DELIVERY`)
    - `สกุลที่รับชำระในออเดอร์นี้` ใน checkout ปรับเป็น adaptive UI: ถ้าร้านรองรับเพียง 1 สกุล ระบบเลือกให้อัตโนมัติและแสดงแบบอ่านอย่างเดียว; ถ้ารองรับหลายสกุลจะแสดงเป็น chips ให้เลือกเร็ว (แทน dropdown)
    - validation ฝั่ง client ใน checkout เป็นแบบตาม flow: `Walk-in ทันที` และ `มารับที่ร้านภายหลัง` ไม่บังคับชื่อ/เบอร์ (แต่แนะนำให้กรอกอย่างน้อย 1 อย่างถ้าทราบ), ส่วน `สั่งออนไลน์/จัดส่ง` ยังบังคับเบอร์โทรและที่อยู่จัดส่ง และเปิดตัวเลือก COD เฉพาะ flow ออนไลน์
    - matrix create order ล่าสุด:
      - `Walk-in ทันที + เงินสด/QR/โอน` -> สร้างเป็น `PAID` พร้อมตัดสต็อก (`OUT`) ทันที
      - `Walk-in ทันที + ค้างจ่าย` -> สร้างเป็น `PENDING_PAYMENT` พร้อมจองสต็อก (`RESERVE`)
      - `มารับที่ร้านภายหลัง` -> สร้างเป็น `READY_FOR_PICKUP` พร้อมจองสต็อก (`RESERVE`) เสมอ; ถ้าชำระแล้วจะตั้ง `paymentStatus=PAID` แต่ยังไม่ตัดสต็อกจนกดยืนยันรับสินค้า
      - pickup flow รองรับสถานะกลาง `PICKED_UP_PENDING_PAYMENT` เมื่อยืนยันรับสินค้าไปก่อนแต่ยังไม่ชำระ
      - `สั่งออนไลน์/จัดส่ง` -> คง flow เดิมเริ่มที่ `DRAFT`
    - อัปเดต flow COD ในหน้า detail:
      - `mark_packed` รองรับออเดอร์ COD จากสถานะ `PENDING_PAYMENT` ได้ และจะปล่อยจอง+ตัดสต็อกทันทีตอนแพ็ก
      - `confirm_paid` สำหรับ COD เปลี่ยนเป็นปุ่ม `ยืนยันรับเงินปลายทาง (COD)` และใช้ได้หลังสถานะ `SHIPPED` เท่านั้น (อัปเดต `paymentStatus` เป็น `COD_SETTLED` โดยไม่เปลี่ยน `status`) และรองรับส่ง `codAmount` เพื่อบันทึกยอดโอนจริงจากขนส่ง
      - เพิ่ม action แยก `mark_cod_returned` สำหรับ COD ตีกลับจาก `SHIPPED + COD_PENDING_SETTLEMENT`: คืนสต็อกเป็น `RETURN`, เปลี่ยนสถานะออเดอร์เป็น `COD_RETURNED`, และตั้ง `paymentStatus` เป็น `FAILED`
      - `mark_cod_returned` รองรับ payload `codFee` (ค่าตีกลับ) + `codReturnNote` (หมายเหตุสาเหตุตีกลับ): ระบบจะบวกค่าเข้า `shippingCost`, สะสมที่ `codFee`, และเก็บหมายเหตุลง `orders.cod_return_note`
      - เพิ่ม permission ใหม่ `orders.cod_return` สำหรับ action `mark_cod_returned` และบังคับใช้แบบ strict แล้ว (เลิก fallback `orders.ship`)
      - เพิ่มคอลัมน์ `orders.cod_returned_at` และบันทึกเวลาเมื่อ action `mark_cod_returned` สำเร็จ
      - เพิ่มคอลัมน์ `orders.cod_return_note` เพื่อใช้บันทึกเหตุผล/หมายเหตุตีกลับ
    - หน้า `/reports` เพิ่มการ์ด `สรุป COD` (ค้างเก็บ, ปิดยอดวันนี้, ตีกลับวันนี้, COD สุทธิสะสม) และตารางย่อย `แยกตามขนส่ง` โดย metric รายวันของการตีกลับอ้างอิง `cod_returned_at`; เพิ่ม metric `ค่าตีกลับ (codFee)` ทั้งระดับรวมและแยกขนส่ง
    - การยืนยันชำระ (`confirm_paid`) ของออเดอร์ทั่วไปรองรับสถานะ `PENDING_PAYMENT`, `READY_FOR_PICKUP`, และ `PICKED_UP_PENDING_PAYMENT`
      - `READY_FOR_PICKUP + paymentStatus!=PAID` = ยืนยันรับชำระอย่างเดียว (ยังไม่ตัดสต็อก)
      - `READY_FOR_PICKUP + paymentStatus=PAID` = ยืนยันรับสินค้า (ปล่อยจอง+ตัดสต็อก)
      - `PICKED_UP_PENDING_PAYMENT` = ปิดยอดชำระหลังลูกค้ารับสินค้าไปแล้ว (ไม่ตัดสต็อกซ้ำ)
    - เพิ่ม action ใหม่ `mark_picked_up_unpaid` (หน้า `/orders/[orderId]`) สำหรับเคสลูกค้ารับสินค้าไปก่อน: จะปล่อยจอง+ตัดสต็อก และเปลี่ยนสถานะเป็น `PICKED_UP_PENDING_PAYMENT`
    - การยกเลิกออเดอร์ (`cancel`) รองรับแยกเคสสต็อกแล้ว:
      - ถ้ายังเป็นจองอยู่ (`READY_FOR_PICKUP` หรือ `PENDING_PAYMENT` ที่ยังไม่ OUT) จะ `RELEASE`
      - ถ้ารับสินค้าไปแล้ว (`PICKED_UP_PENDING_PAYMENT` หรือ `PENDING_PAYMENT` ที่มี OUT ไปแล้ว) จะ `RETURN`
    - การยกเลิกออเดอร์ (`cancel`) ในหน้า `/orders/[orderId]` ใช้ policy 2 โหมด:
      - `Owner/Manager`: ยืนยันเองด้วย `เหตุผล + สไลด์ยืนยัน` (`approvalMode=SELF_SLIDE`)
      - role อื่น: ใช้ `อีเมล + รหัสผ่าน Manager` + `เหตุผล` (`approvalMode=MANAGER_PASSWORD`)
      - ทั้งสองโหมดต้องมีสิทธิ์ส่งคำขอยกเลิก (`orders.update`/`orders.cancel`/`orders.delete`)
    - หน้า `/orders/[orderId]` เปลี่ยน UI ยกเลิกจาก inline form เป็น modal กลางแบบ adaptive ตาม role และมี throttle ฝั่ง UI: ถ้ายืนยันแบบรหัสผ่านไม่ผ่านติดกันหลายครั้งจะพักการลองชั่วคราว
    - หน้า `/orders/[orderId]` แสดงปุ่ม `ยกเลิกออเดอร์` บน action rail หลักโดยตรงแล้ว (ไม่ซ่อนใน `การทำงานเพิ่มเติม`) เพื่อให้เข้าถึงได้เร็วขึ้น
    - หน้า `/orders/[orderId]` แสดงสรุป `การอนุมัติยกเลิก` เมื่อออเดอร์ถูกยกเลิกแล้ว (เหตุผล, ผู้อนุมัติ, อีเมล, ผู้กดยกเลิก, เวลาอนุมัติ) โดยอ่านจาก `audit_events` action `order.cancel`
    - หน้า `/orders/[orderId]` ปรับเป็น flat layout แบบ no-card: ใช้เส้นคั่น section แทนกล่องการ์ดซ้อน เพื่อลดการกินพื้นที่และอ่านข้อมูลเร็วขึ้น
    - section `สถานะงาน` ในหน้า `/orders/[orderId]` ปรับเป็น responsive stepper:
      - Mobile: แสดง `ขั้นปัจจุบัน + progress bar` และ stepper แบบ compact 1 แถว (แต่ละขั้น `flex-1`) พร้อม label ตัดได้ 2 บรรทัดเพื่อกันล้นจอ
      - Desktop/Tablet: แสดง stepper แนวนอนบรรทัดเดียว พร้อมเส้นเชื่อมและสีสถานะ done/current/todo
      - แก้ mobile overflow ของ stepper แล้ว: ถอด negative margin, ใช้โครง `min-w-0 + flex-1` ต่อขั้น, และ truncate หัวข้อความขั้นปัจจุบัน
      - ใส่ guard ระดับหน้า detail (`overflow-x-hidden`) เพื่อกันกรณีข้อความยาวผิดปกติดัน layout ล้นจอ
    - หน้า `/orders/[orderId]` แยกการแสดงผลตาม flow มากขึ้น: ออเดอร์หน้าร้าน/รับที่ร้านจะซ่อนบล็อกจัดส่งถ้าไม่มีข้อมูลจัดส่ง, และจะแสดงบล็อกจัดส่งเต็มเมื่อเป็นออเดอร์ออนไลน์หรือมีข้อมูลจัดส่งจริง
    - หน้า `/orders/[orderId]` สำหรับเคส `Walk-in + ชำระแล้ว` ปรับเป็นโหมดจบงาน:
      - action rail แสดงสรุปว่าเสร็จสิ้น, ซ่อน action `แพ็ก/จัดส่ง` และซ่อนปุ่ม `ไม่มีป้าย`, พร้อมแสดง `พิมพ์ใบเสร็จ` และ `ยกเลิกออเดอร์` (เมื่อผู้ใช้มีสิทธิ์)
      - ซ่อน section `ข้อมูลลูกค้า` อัตโนมัติเมื่อเป็นข้อมูล default (`ลูกค้าหน้าร้าน`, โทร/ที่อยู่ว่าง) เพื่อลด noise
      - เงื่อนไขโหมดจบงานของ walk-in ใช้ `status=PAID` เท่านั้น เพื่อไม่ทับเคส `READY_FOR_PICKUP + PAID` ที่ต้องเห็นปุ่ม `ยืนยันรับสินค้า`
    - หน้า `/orders/[orderId]` สำหรับเคส `Walk-in + CANCELLED` ซ่อนเมนู `การทำงานเพิ่มเติม` เพื่อลด action ที่ไม่เกี่ยวข้องหลังยกเลิกแล้ว
    - หน้า `/orders/[orderId]` สำหรับเคส `Walk-in + PENDING_PAYMENT` ซ่อนเมนู `การทำงานเพิ่มเติม` เพื่อโฟกัส action หลัก (`ยืนยันชำระ/ยกเลิกออเดอร์`)
    - หน้า `/orders/[orderId]` สำหรับเคส pickup (`READY_FOR_PICKUP` และ `PICKED_UP_PENDING_PAYMENT`) ซ่อนเมนู `การทำงานเพิ่มเติม` เพื่อโฟกัส action หลัก (`ยืนยันชำระ/ยืนยันรับสินค้า/ยกเลิกออเดอร์`)
    - ปุ่ม `ยืนยันรับชำระ` และ `ยืนยันรับสินค้า` (เคส `READY_FOR_PICKUP + PAID`) ในหน้า `/orders/[orderId]` เพิ่ม custom confirm modal ก่อนบันทึกสถานะ (ลดการกดพลาดในงานหน้าร้าน)
    - section `รายการสินค้า` ใน `/orders/[orderId]` ปรับใหม่ให้อ่านเร็วขึ้น:
      - แต่ละสินค้าเป็น 2 แถว (ชื่อ+ยอดบรรทัด, และ SKU/จำนวน/หน่วยฐาน)
      - summary ยอดเงินจัดเป็นแถว label ซ้าย-ตัวเลขขวา พร้อม `tabular-nums` เพื่อสแกนตัวเลขเร็วขึ้น
      - บนจอกว้าง (`lg+`, รวม tablet แนวนอน) แสดงเป็นตารางแนวบิล `รายการ | จำนวน | รวม` เพื่อให้ desktop/tablet landscape อ่านแบบเดียวกัน
    - หน้า `/orders/[orderId]` ปรับ breakpoint layout หลักให้โหมด 2 คอลัมน์ (เนื้อหา + action rail) เริ่มที่ `lg` เพื่อให้ tablet แนวนอนใช้งานเหมือน desktop
    - หน้า `/orders/[orderId]` รวม action พิมพ์ใบเสร็จให้เหลือจุดเดียวใน action rail (ตัดปุ่มซ้ำบน header) และเปลี่ยนการพิมพ์ใบเสร็จ/ป้ายเป็น hidden iframe ในหน้าเดิม (ไม่เปิดแท็บใหม่) พร้อม cleanup iframe เก่าก่อนพิมพ์รอบใหม่เพื่อลดปัญหาพิมพ์ซ้ำ
    - หน้า `/orders/[orderId]` เอา text link `กลับไปหน้ารายการขาย` ออกแล้ว เพื่อลด action ซ้ำกับ navigation หลักของแอป
    - แก้เคสพิมพ์รอบแรกข้อมูลว่างใน `/orders/[orderId]`: iframe เปลี่ยนจากสั่ง `print()` จาก parent ทันที เป็นโหลดหน้า print พร้อม `autoprint=1` ให้หน้าปลายทางสั่งพิมพ์เองหลัง render เสร็จ
    - ปรับการแสดงสกุลเงินในหน้ารายละเอียด/หน้าพิมพ์ออเดอร์ให้ใช้สัญลักษณ์แล้ว (`LAK -> ₭`, `THB -> ฿`, `USD -> $`) โดยเฉพาะยอดเงินที่เคยต่อท้ายด้วยรหัส `LAK`
    - flow เป็น `เลือกสินค้าในหน้า POS` -> `เปิดตะกร้า/กดชำระเงิน` -> `Checkout sheet` เพื่อกรอกลูกค้า/ชำระเงิน/ที่อยู่ แล้วค่อยบันทึก
    - เพิ่มหน้า `/orders/cod-reconcile` สำหรับ `COD Reconcile Panel (MVP)`:
      - แสดงเฉพาะออเดอร์ `COD` ที่อยู่สถานะ `SHIPPED + COD_PENDING_SETTLEMENT`
      - กรองตาม `ช่วงวันที่ส่ง`, `ผู้ให้บริการขนส่ง`, และ `คำค้น (เลขออเดอร์/ชื่อลูกค้า)`
      - ปรับค่า `ยอดโอนจริง` และ `codFee` ต่อรายการได้ แล้วเลือกหลายรายการเพื่อปิดยอดแบบ batch
      - มี summary card แบบ real-time สำหรับยอดที่ต้องได้/ยอดโอนจริง/codFee/ส่วนต่าง (จากรายการที่เลือก) และสรุปร่างข้อมูลทั้งหน้าปัจจุบัน
      - ปิดยอดแบบ batch ผ่าน `POST /api/orders/cod-reconcile` (ใช้สิทธิ์ `orders.mark_paid`) พร้อมบันทึก audit action `order.confirm_paid.bulk_cod_reconcile`
      - endpoint ปิดยอด COD รองรับ `Idempotency-Key` เพื่อกันการกดยืนยันซ้ำ/เน็ตหน่วง และ replay response เดิมได้
    - หลังสร้างออเดอร์สำเร็จทุกหน้าจอ (`mobile/tablet/desktop`) แสดง success action sheet ในหน้าเดิม
    - success action sheet แสดงตัวอย่างบิลและปุ่มพิมพ์ผ่าน hidden iframe เหมือนกันทุกหน้าจอ (ไม่เปลี่ยนหน้า)
    - success action sheet ของ flow `ออนไลน์/จัดส่ง` เพิ่มบล็อก `ข้อมูลสติ๊กเกอร์จัดส่ง` (ผู้รับ/โทร/ที่อยู่/ขนส่ง/tracking/ต้นทุนค่าส่ง) และปุ่ม `พิมพ์สติ๊กเกอร์จัดส่ง`
    - success action sheet ของ flow `มารับที่ร้านภายหลัง` และ `ออนไลน์/จัดส่ง` มีปุ่ม `ออเดอร์ใหม่ต่อ` แล้ว เพื่อกลับไปเริ่มออเดอร์ถัดไปได้ทันทีหลังพิมพ์เอกสาร
    - ปุ่ม `พิมพ์สติ๊กเกอร์จัดส่ง` ใช้ hidden iframe เหมือนพิมพ์บิลแล้วทุกหน้าจอ (ไม่เปิดแท็บใหม่)
    - หน้า `/orders/new` เพิ่มปุ่ม `ล่าสุด` ใต้แถบค้นหา เปิด `SlideUpSheet` รายการออเดอร์ล่าสุด 8 รายการ (ดึงจาก `GET /api/orders?page=1&pageSize=8`) พร้อมปุ่ม `เปิดสรุป` เพื่อ reopen success action sheet ของออเดอร์เก่า
    - ในรายการ `ออเดอร์ล่าสุด` ของหน้า `/orders/new` เพิ่มปุ่ม `ยกเลิก` แล้ว (แสดงเฉพาะผู้มีสิทธิ์ส่งคำขอยกเลิก) โดยใช้ modal กลางตัวเดียวกับหน้า `/orders/[orderId]`:
      - `Owner/Manager` ใช้โหมดสไลด์ยืนยัน
      - role อื่นใช้โหมดยืนยันรหัสผ่าน Manager
    - หน้า print (`/orders/[orderId]/print/receipt` และ `/orders/[orderId]/print/label`) ยังรองรับ `autoprint=1&returnTo=...` สำหรับการเปิดพิมพ์ตรง/ภายนอก flow POS
    - ใน success modal ของ flow ออนไลน์ เปลี่ยนบล็อก `ข้อมูลสติ๊กเกอร์จัดส่ง` เป็น `ตัวอย่างสติ๊กเกอร์จัดส่ง` แบบ card preview ให้หน้าตาและลำดับการอ่านสอดคล้องกับ `ตัวอย่างบิล`
    - reuse logic validation/API ชุดเดียวกับฟอร์มสร้างออเดอร์เดิมเพื่อลด drift ระหว่าง quick mode กับ full mode
    - การคำนวณราคาในตะกร้า/ตอนสร้างออเดอร์ใช้ "ราคาต่อหน่วยที่เลือก" โดยรองรับราคาหน่วยแปลงแบบกำหนดเองจากสินค้า (ถ้าไม่กำหนดจะ fallback เป็น `ราคาหน่วยหลัก x ตัวคูณ`)
    - catalog หน่วยสินค้า (`units`) ใน `getOrderCatalogForStore` ถูก dedupe ตาม `unitId` แล้ว (คงค่า base unit เป็นหลัก) เพื่อกันปัญหา React key ซ้ำใน dropdown หน่วย
    - ฟอร์ม create order sync ค่า `checkoutFlow` เข้า `react-hook-form` แล้ว เพื่อให้ validation ของ `paymentMethod=COD` อ่าน flow ปัจจุบันถูกต้อง (แก้เคสเลือกออนไลน์แล้วแต่ยังขึ้น error ว่า COD ใช้ได้เฉพาะออนไลน์)
    - ในขั้นตอน checkout ถ้าไม่กรอกชื่อลูกค้า ระบบจะ fallback อัตโนมัติเป็น `ลูกค้าหน้าร้าน` หรือ `ลูกค้าออนไลน์` ตาม channel
- Products:
  - หน้า `/products` มีปุ่ม `รีเฟรช` แบบ manual ที่ header (ไม่มี auto-refresh)
  - หน้า `/products` ใช้ server-side pagination สำหรับรายการสินค้า (รองรับ `q/category/status/sort/page/pageSize`) และปุ่ม `โหลดเพิ่มเติม` จะดึงหน้าถัดไปจาก API จริง
  - เพิ่มโครงสร้างฐานข้อมูล Variant แบบ Phase 1 แล้ว (`product_models`, `product_model_attributes`, `product_model_attribute_values` + คอลัมน์เชื่อมใน `products`) โดยยังไม่บังคับเปลี่ยน UX เดิมทันที
  - ฟอร์ม `เพิ่ม/แก้ไขสินค้า` ใน `/products` รองรับโหมด Variant แล้ว (กำหนด `model`, `variant label`, `sort order`, และ option key/value) โดย backend จะผูก `products.model_id` และเติม dictionary ใน `product_model_attributes`/`product_model_attribute_values` ให้อัตโนมัติ
  - ฟอร์ม `เพิ่มสินค้า` ช่อง `ราคาขาย` ปรับเป็นค่าว่างเริ่มต้น + `placeholder: 0`; หากผู้ใช้ไม่กรอก ระบบยังตีความค่าเป็น `0` ตอน submit (ลดการต้องลบ `0` ก่อนพิมพ์)
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
  - หน่วยแปลงรองรับ `ราคาขายต่อหน่วยแปลง` แบบ optional (เช่น EA=1,000 แต่ PACK(12)=10,000 ได้) โดยถ้าไม่กรอกจะใช้สูตรอัตโนมัติจากหน่วยหลัก
  - UI ส่วน `การแปลงหน่วย` ปรับ mobile-first เป็น 2 แถวต่อรายการบนมือถือ (`หน่วย+ลบ` / `ตัวคูณ+ราคา`) และคงแถวเดียวบน tablet/desktop
  - `scripts/repair-migrations.mjs` รองรับ fallback สำหรับโครงสร้าง Variant Phase 1 แล้ว (ใช้ได้กับฐานที่ขาดบาง migration)
  - `scripts/repair-migrations.mjs` รองรับเติมคอลัมน์ `product_units.price_per_unit` (ราคาหน่วยแปลงแบบกำหนดเอง) สำหรับฐานเก่าที่ข้าม migration ล่าสุด
  - `scripts/seed.mjs` เติม dummy data สำหรับสินค้าแบบ variant แล้ว (เช่น กล่องอาหารหลายขนาด, เสื้อยืดหลายสี/ไซซ์) เพื่อ demo flow ได้ทันทีหลัง `npm run db:seed`
  - รายการสินค้าในหน้า `/products` รองรับ swipe-left action บน mobile/tablet เพื่อเปิดปุ่ม `ปิดใช้งาน/เปิดใช้งาน` แบบรวดเร็ว
  - ฟอร์มใน `SlideUpSheet` รองรับ keyboard-aware บนมือถือ (เพิ่ม bottom inset ตาม virtual keyboard + ติดตาม viewport resize/scroll เพื่อเลื่อนช่องที่โฟกัสให้อยู่ในจอ)
  - ฟอร์มเพิ่ม/แก้ไขสินค้าใน `/products` มีปุ่ม `ยกเลิก` คู่กับ `บันทึก` ที่ footer ของ `SlideUpSheet` (ชิดล่างและไม่ลอยจากขอบ)
  - ปุ่มลอย `เพิ่มสินค้า` (FAB) บนมือถือในหน้า `/products` ปรับตำแหน่งจากค่าคงที่เป็นค่าที่ผูกกับ `--bottom-tab-nav-height + safe-area` เพื่อลดเคสปุ่มทับ bottom tab bar ตอนเลื่อนหน้า
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
  - ตัวกรองวันที่ใน `คิว PO รอปิดเรท` (`receivedFrom/receivedTo`) เปลี่ยนเป็น custom datepicker แบบเดียวกับ Create PO แล้ว พร้อม quick actions (`วันนี้`, `+7 วัน`, `สิ้นเดือน`, `ล้างค่า`) เพื่อให้ UX วันที่สอดคล้องกันทั้ง flow
  - ตัวกรองวันที่ใน `AP by Supplier` (`dueFrom/dueTo`) เปลี่ยนเป็น custom datepicker แบบเดียวกับ Create PO แล้ว พร้อม quick actions (`วันนี้`, `+7 วัน`, `สิ้นเดือน`, `ล้าง`) โดยยังคง query contract เดิมเพื่อใช้กับทั้ง statement และ export CSV
  - นโยบาย UI วันที่ทั้งระบบ: ให้ใช้ custom datepicker มาตรฐานเดียวกัน (calendar popover + เก็บค่า `YYYY-MM-DD`) แทน native `input[type=date]` เป็นค่าเริ่มต้น; native ใช้ได้เฉพาะกรณี internal/admin ที่ไม่กระทบ UX ผู้ใช้ปลายทาง
  - ใน panel `AP by Supplier` ย้ายบล็อก `Due ตั้งแต่/Due ถึง` ลงบรรทัดใหม่ใต้ตัวกรองหลัก (ค้นหา/สถานะ/sort) เพื่อเพิ่มพื้นที่ใช้งานบนจอแคบและลดการบีบช่อง date picker
  - ใน modal `คิว PO รอปิดเรท` (Month-End bulk) ช่องตัวเลข `อัตราแลกเปลี่ยนจริง` และ `ยอดชำระรวมตาม statement` ใช้ placeholder `0` โดยไม่ prefill ค่า `0` ลง input
  - modal `Create PO` ตั้งค่าไม่ให้ปิดเมื่อกด backdrop แล้ว (`closeOnBackdrop=false`) และเพิ่มปุ่ม `ยกเลิก` ที่ footer เพื่อปิดฟอร์มอย่างชัดเจน
  - modal `Create PO` เพิ่ม custom confirm ก่อนปิดเมื่อมีข้อมูลค้าง (ทั้งกดปุ่ม `ยกเลิก` และปุ่ม `X`) เพื่อลดการทิ้งฟอร์มโดยไม่ตั้งใจ
  - workspace tabs (`PO Operations`/`Month-End Close`/`AP by Supplier`) ถูกแยกเป็นบล็อกนำทางเฉพาะและแสดงใต้บล็อก KPI เพื่อคง hierarchy `summary ก่อน action`
  - สี active ของ workspace tabs (`PO Operations`/`Month-End Close`/`AP by Supplier`) ใช้ `primary` theme (`bg-primary` + `text-primary-foreground`) แล้ว เพื่อให้สอดคล้องกับโทนหลักของระบบ
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
  - แท็บ `สั่งซื้อ (PO)` ใช้ cache รายละเอียด PO ต่อ `poId` แบบ on-demand (ยกเลิก intent-driven prefetch hover/focus/touch) และยัง invalidate cache เมื่อมีการแก้ไข/เปลี่ยนสถานะ
  - หน้า `/stock` ใช้ `StockTabs` แบบ keep-mounted (mount ครั้งแรกตามแท็บที่เข้าแล้วคง state เดิมไว้) ลดการรีเซ็ตฟอร์ม/รายการเมื่อสลับแท็บ
  - ทั้ง 4 แท็บหลัก (`ดูสต็อก`, `สั่งซื้อ`, `บันทึกสต็อก`, `ประวัติ`) มี toolbar มาตรฐาน: `รีเฟรชแท็บนี้` + เวลา `อัปเดตล่าสุด HH:mm`
  - แท็บ `ดูสต็อก` ใช้ `GET /api/stock/products?page&pageSize&categoryId` แบบแบ่งหน้า (เริ่มจากชุดแรก + ปุ่ม `โหลดเพิ่ม`) และมี `รีเฟรชแท็บนี้` เพื่อดึงสถานะล่าสุดของรายการสินค้า
  - แท็บ `ดูสต็อก` เพิ่ม filter หมวดหมู่สินค้า (`inventoryCategoryId`) และ sync state ลง URL แล้ว (`inventoryQ`, `inventoryFilter`, `inventorySort`, `inventoryCategoryId`) โดย sync เฉพาะตอน active tab เป็น `inventory` เพื่อลด race condition เขียน query ข้ามแท็บ
  - สแกนบาร์โค้ดในแท็บ `ดูสต็อก` จะ resolve ด้วย `GET /api/products/search?q&includeStock=true` (exact barcode ก่อน fallback) และ scanner modal จะเริ่มกล้องเฉพาะตอนเปิดจริง เพื่อลดความเสี่ยงเปิดกล้องค้างตอนปิดแผ่นสแกน
  - scanner ในแท็บ `ดูสต็อก` และ `บันทึกสต็อก` ใช้ UI/logic ชุดเดียวกับหน้า `/products` ผ่านคอมโพเนนต์กลาง `components/app/barcode-scanner-panel.tsx` (มี camera dropdown, pause/resume, torch/zoom, manual barcode fallback, และ cleanup ตอนปิด)
  - คอมโพเนนต์ legacy `components/app/stock-ledger.tsx` (ยังไม่ถูก mount ใน `/stock` ปัจจุบัน) ปรับ scanner ให้ใช้คอมโพเนนต์กลางเดียวกันแล้ว เพื่อคงพฤติกรรมเปิด/ปิดกล้องและ permission flow มาตรฐานเดียวกับ `/products`
  - นโยบาย scanner กลางของระบบ: หากเพิ่มปุ่ม `สแกนบาร์โค้ด` ใหม่ในหน้าอื่น ให้ reuse `BarcodeScannerPanel` + permission sheet มาตรฐานเดียวกันเสมอ เพื่อคง UX/permission/camera cleanup ให้สอดคล้องทั้งระบบ
  - เพิ่ม state มาตรฐานต่อแท็บ: loading skeleton / empty state / error + ปุ่ม retry
  - `บันทึกสต็อก` เพิ่ม quick preset (`รับเข้า`, `ปรับยอด`, `ของเสีย`) พร้อม note template และส่ง `Idempotency-Key` ตอน `POST /api/stock/movements` จาก client
  - แท็บ `บันทึกสต็อก` เพิ่ม guardrail ชัดเจนว่า flow นี้ไม่บันทึกต้นทุน/อัตราแลกเปลี่ยน พร้อม CTA ไปแท็บ `สั่งซื้อ (PO)` สำหรับงานซื้อเข้า
  - กล่องคำแนะนำในแท็บ `บันทึกสต็อก` ปรับเป็นพับ/ขยายได้ (default ปิด) เพื่อลดความยาวบนจอมือถือ โดยยังคงคำเตือนหลักและ CTA ไปแท็บ `สั่งซื้อ (PO)` ให้เห็นตลอด
  - ใน mobile ของแท็บ `บันทึกสต็อก` เพิ่มปุ่ม sticky `บันทึกสต็อก` ที่ก้นจอ และเพิ่มปุ่ม `ดูสินค้าทั้งหมด` เปิด list picker (ค้นหาชื่อ/SKU แล้วแตะเลือกได้)
  - `POST /api/stock/movements` จะ reject field กลุ่มต้นทุน/เรท (`cost/costBase/rate/exchangeRate/...`) ด้วย 400 เพื่อบังคับ separation ระหว่างงาน Recording vs PO/Month-End
  - แท็บ `บันทึกสต็อก` sync filter หลักลง URL แล้ว (`recordingType`, `recordingProductId`) เพื่อแชร์ลิงก์มุมมอง/สินค้าเป้าหมายในทีมได้ โดยใช้ `router.replace(..., { scroll: false })`
  - แท็บ `บันทึกสต็อก` จะทำ URL sync/query restore เฉพาะตอน active tab เป็น `recording` เพื่อลด race condition เขียน query ข้ามแท็บ
  - ลิงก์ `ดูประวัติทั้งหมด` ในแท็บบันทึกสต็อก เปลี่ยนเป็น `router.push(?tab=history)` (ไม่ hard reload)
  - แท็บ `ประวัติ` ใช้ server-side pagination/filter ผ่าน `GET /api/stock/movements?view=history` รองรับกรอง `ประเภท/สินค้า/ช่วงวันที่`
  - แท็บ `ประวัติ` รองรับ filter type เพิ่ม `RESERVE/RELEASE` แล้ว และ sync filter/page ลง URL (`historyType`, `historyQ`, `historyDateFrom`, `historyDateTo`, `historyPage`) เพื่อแชร์มุมมองได้
  - ปรับ UX แท็บ `ประวัติ` จากแถวปุ่มประเภทหลายปุ่ม เป็นฟอร์มตัวกรองเรียบง่าย (`ประเภท` dropdown + `ค้นหา` + `ช่วงวันที่`) และค่อย apply ตอนกด `ใช้ตัวกรอง`
  - แก้บั๊กในฟอร์มกรองแท็บ `ประวัติ`: ค่า dropdown/วันที่ไม่ถูก reset กลับจาก URL ระหว่างพิมพ์แล้ว (URL sync จะดันค่าเข้าฟอร์มเฉพาะตอน query เปลี่ยนจริง)
  - ช่องวันที่ในแท็บ `ประวัติ` เปลี่ยนเป็น custom datepicker (calendar popover) แบบเดียวกับ PO เพื่อลดปัญหา native date input บนมือถือ
  - แท็บ `ประวัติ` จะ sync query/fetch เฉพาะตอน active tab เป็น `history` แล้ว เพื่อลด race condition ที่เคยเด้งแท็บ/โหลดซ้ำเมื่อมีหลายแท็บถูก keep-mounted พร้อมกัน
  - แท็บ `ประวัติ` เพิ่ม in-memory cache ต่อ filter key (`type/page/q/date`) เพื่อให้สลับมุมมองที่เคยเปิดแล้วแสดงผลได้ไวขึ้นทันที ก่อน revalidate เบื้องหลัง
  - `StockTabs` ปรับการสลับแท็บเป็น `router.replace(..., { scroll: false })` และไม่ยิงซ้ำเมื่อคลิกแท็บเดิม เพื่อลด navigation churn
  - query history ปรับ date filter เป็นช่วงเวลา (`createdAt >= dayStart` และ `< nextDayStart`) แทน `date(createdAt)` เพื่อใช้ index ได้ดีขึ้น
  - เพิ่ม composite index ที่ `inventory_movements` สำหรับงาน history (`store_id, created_at, id` และ `store_id, type, created_at, id`)
  - เพื่อเลี่ยงตัวเลขชวนสับสนจากข้อมูลรายหน้า (pagination) filter chip ในแท็บ `ประวัติ` ปรับเป็น label-only (เอาจำนวนใน chip ออก)
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
  - quick inbox บนจอ non-desktop (`<1200px`) ใช้ popover card แบบเดียวกับ desktop แต่ render แบบ fixed-centered (ผ่าน portal) เพื่อกันการล้นซ้าย และจำกัดความสูง (`~68dvh`)
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
