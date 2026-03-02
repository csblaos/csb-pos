# Handoff

## Snapshot Date

- March 2, 2026

## Changed (ล่าสุด)

- ปรับแท็บ `/stock?tab=inventory` (ดูสต็อก) ให้ใช้งานจริงได้ครบขึ้น:
  - เพิ่ม toolbar มาตรฐานของแท็บ (`รีเฟรชแท็บนี้` + `อัปเดตล่าสุด`)
  - เพิ่ม data flow แบบแบ่งหน้า (`GET /api/stock/products?page&pageSize`) พร้อมปุ่ม `โหลดเพิ่ม` แทนการเห็นเฉพาะ 20 รายการแรก
  - sync ตัวกรองหลักลง URL (`inventoryQ`, `inventoryFilter`, `inventorySort`) เฉพาะตอนแท็บ `inventory` active เพื่อแชร์ลิงก์มุมมองเดียวกันได้โดยไม่ชนกับแท็บอื่น
  - ปรับ logic สแกนบาร์โค้ดให้ resolve ผ่าน `GET /api/products/search?q&includeStock=true` (exact barcode ก่อน แล้ว fallback รายการแรก)
  - standardize scanner UX/logic ให้ตรงกับหน้า `/products` โดยย้ายไปใช้คอมโพเนนต์กลาง `components/app/barcode-scanner-panel.tsx` (camera dropdown, pause/resume, torch/zoom, manual barcode fallback, และ cleanup ตอนปิด)
  - ปรับการ์ดสรุปในแท็บดูสต็อกให้ label `ทั้งหมด` สอดคล้องกับ filter `all`
  - แท็บ `/stock?tab=recording` เปลี่ยนมาใช้ scanner คอมโพเนนต์กลางเดียวกันและปรับ permission sheet ให้ใช้โครงเดียวกับ `/products` (`ยกเลิก` + `อนุญาตและสแกน`)
  - `components/app/stock-ledger.tsx` (legacy component ที่ยังไม่ถูก mount ใน route `/stock` ปัจจุบัน) ถูกย้ายมาใช้ `BarcodeScannerPanel` และ permission/scanner sheet style เดียวกับ `/products` แล้ว เพื่อป้องกัน logic/UI drift

- แก้ issue หน้า `/stock` ที่แท็บ `ประวัติ` มีอาการเด้งแท็บ/โหลดข้อมูลซ้ำระหว่างใช้งาน:
  - สาเหตุหลัก: `StockMovementHistory` ถูก keep-mounted และยังทำ URL sync + fetch แม้แท็บไม่ active ทำให้เกิด race กับ query update จากแท็บอื่น
  - แพตช์: จำกัดให้ logic sync query (`router.replace`) และ data fetch ของ History ทำงานเฉพาะเมื่อ `tab=history` เท่านั้น
  - ผลลัพธ์: ลดการแย่งอัปเดต query ข้ามแท็บ และลดการโหลดข้อมูลที่ไม่จำเป็นตอนผู้ใช้อยู่แท็บอื่น

- แก้ issue เด้งแท็บ/โหลดซ้ำใน `/stock` เพิ่มเติม และปิด prefetch PO ตามที่ต้องการ:
  - `StockRecordingForm` และ `PurchaseOrderList` จำกัด logic sync/query side-effect ให้ทำงานเฉพาะตอนแท็บตัวเอง active (`tab=recording` / `tab=purchase`) ลด race จาก keep-mounted tabs
  - `StockTabs` ปรับการเปลี่ยนแท็บเป็น `router.replace(..., { scroll: false })` และไม่ยิง navigation ซ้ำเมื่อกดแท็บเดิม
  - ยกเลิก PO detail prefetch แบบ intent-driven (hover/focus/touch + auto prefetch รายการต้น ๆ) เหลือโหลดรายละเอียดแบบ on-demand เมื่อผู้ใช้เปิด PO จริง

- ปรับ UX แท็บ `/stock?tab=history` ให้เรียบง่ายและลดการสลับมุมมองเอง:
  - เอาแถวปุ่มประเภท (`ทั้งหมด/รับเข้า/เบิกออก/จอง/ยกเลิกจอง/ปรับสต็อก/รับคืน`) ออก แล้วเปลี่ยนเป็น `ประเภท` แบบ dropdown เดียว
  - แยก draft filter ออกจาก applied filter: เปลี่ยนค่าช่องกรองแล้วยังไม่ fetch/ไม่ sync URL จนกด `ใช้ตัวกรอง`
  - เพิ่ม summary ของตัวกรองที่กำลังใช้จริงใต้ปุ่ม action และคงปุ่ม `ล้างตัวกรอง` เพื่อให้ flow ไม่ซับซ้อนบนมือถือ
  - แก้บั๊กที่ค่าช่องกรอง (dropdown/วันที่) เด้งกลับค่าเดิมระหว่างผู้ใช้แก้ไข: URL-to-form sync ของแท็บ history เปลี่ยนเป็น update เฉพาะตอน query เปลี่ยนจริง ลดอาการพิมพ์ไม่เข้า/เลือกไม่ติด
  - เปลี่ยนช่องวันที่ใน history filter เป็น custom datepicker (calendar popover) แบบเดียวกับ PO เพื่อให้ UX บนมือถือสม่ำเสมอและเลี่ยงปัญหา native `input[type=date]`

- เพิ่ม policy กลางของ date input ฝั่ง UI:
  - ฟีเจอร์ใหม่ที่มีช่องวันที่ต้องใช้ custom datepicker มาตรฐานเดียวกันทั้งระบบ (calendar popover + ค่า `YYYY-MM-DD`)
  - native `input[type=date]` ให้ใช้เฉพาะกรณี internal/admin ที่ไม่กระทบประสบการณ์ผู้ใช้ปลายทาง

- ปรับ UX ฟอร์ม `เพิ่มสินค้า` ในหน้า `/products`:
  - ช่อง `ราคาขาย` เปลี่ยนค่าเริ่มต้นจาก `0` เป็นค่าว่าง และเพิ่ม `placeholder: 0`
  - ถ้าผู้ใช้ไม่กรอกราคาขาย ระบบยัง submit เป็น `0` ตาม schema/coercion เดิม (ไม่เปลี่ยน API contract)
  - เป้าหมายคือให้ผู้ใช้พิมพ์ราคาได้ทันที โดยไม่ต้องลบ `0` เดิมก่อน

- ปรับ visual state ของ workspace tabs ในหน้า `/stock?tab=purchase`:
  - ปุ่ม active ของ `PO Operations` / `Month-End Close` / `AP by Supplier` เปลี่ยนจากโทน slate เป็น `primary theme` (`bg-primary`, `text-primary-foreground`)
  - badge และคำอธิบายใต้ชื่อ tab (ตอน active) ปรับโทนเป็น `primary-foreground` เพื่อคง contrast และอ่านง่าย

- ปรับตัวกรองวันที่ใน `คิว PO รอปิดเรท` (`/stock?tab=purchase` -> workspace `Month-End Close`) ให้ใช้ custom datepicker แบบเดียวกับ `Create PO`:
  - เปลี่ยน `receivedFrom/receivedTo` จาก native `input[type=date]` เป็น `PurchaseDatePickerField` (calendar popover + เก็บค่า `YYYY-MM-DD`)
  - เพิ่ม quick actions (`วันนี้`, `+7 วัน`, `สิ้นเดือน`, `ล้างค่า`) ทั้งช่องวันที่เริ่มและสิ้นสุด เพื่อให้ interaction ของวันที่ตรงกับฟอร์มสร้าง PO
  - คง API/filter contract เดิม (`receivedFrom`, `receivedTo`) จึงไม่ต้องแก้ backend route

- ปรับตัวกรองวันที่ใน `AP by Supplier` (`statement/filter/export`) ให้ใช้ custom datepicker แบบเดียวกับ `Create PO`:
  - เปลี่ยน `dueFrom/dueTo` จาก native `input[type=date]` เป็น `PurchaseDatePickerField` (calendar popover + เก็บค่า `YYYY-MM-DD`)
  - เพิ่ม quick actions (`วันนี้`, `+7 วัน`, `สิ้นเดือน`, `ล้าง`) แยกทั้งช่องเริ่มและสิ้นสุด
  - จัด layout filter ใหม่โดยย้าย `Due ตั้งแต่/Due ถึง` ลงบรรทัดถัดไปใต้ตัวกรองหลัก เพื่อแก้ปัญหาความแคบบนหน้าจอเล็ก
  - คง API/filter/export query contract เดิม (`dueFrom`, `dueTo`) จึงไม่ต้องแก้ endpoint `statement` และ `export-csv`

- ปรับ flow แท็บ `/stock?tab=recording` ให้แยกจากงานบัญชี/PO ชัดขึ้น:
  - เพิ่ม guardrail card ว่า Recording ใช้สำหรับปรับจำนวนสต็อกเท่านั้น (ไม่บันทึกต้นทุน/เรท) และเพิ่มปุ่มลัด `ไปแท็บสั่งซื้อ (PO)`
  - ปรับ guardrail card ให้ข้อความอธิบายยาวเป็นแบบพับ/ขยาย (default ปิด) เพื่อลดความสูงบนมือถือ และยังคงคำเตือนหลักพร้อม CTA ไปแท็บ PO ไว้ด้านบนตลอด
  - เพิ่ม mobile UX: ปุ่ม `บันทึกสต็อก` แบบ sticky ที่ก้นจอ และปุ่ม `ดูสินค้าทั้งหมด` เพื่อเปิด list picker เลือกสินค้าได้โดยไม่ต้องพิมพ์ก่อน
  - harden API `POST /api/stock/movements`: ถ้าส่ง field กลุ่มต้นทุน/เรท (`cost/costBase/rate/exchangeRate/...`) จะตอบ 400 พร้อมข้อความแนะนำให้ไปทำที่ PO/Month-End
  - sync filter หลักของ Recording ลง URL (`recordingType`, `recordingProductId`) เพื่อแชร์มุมมองเดียวกันได้ และใช้ `router.replace(..., { scroll: false })` ลดอาการเด้งจอ

- ปรับแท็บ `/stock?tab=history` ให้แชร์มุมมองได้และกรองครบขึ้น:
  - เพิ่ม filter type `จอง (RESERVE)` และ `ยกเลิกจอง (RELEASE)` ในชุด chip
  - sync filter/page ลง URL (`historyType`, `historyQ`, `historyDateFrom`, `historyDateTo`, `historyPage`) ด้วย `router.replace(..., { scroll: false })`
  - เพิ่ม in-memory cache ต่อ filter key (`type/page/q/date`) เพื่อให้สลับ chip เดิมแสดงผลได้ทันที และค่อย revalidate เบื้องหลัง
  - ปรับ query วันที่ใน history จาก `date(created_at)` เป็นช่วงเวลา (`>= dayStart`, `< nextDayStart`) เพื่อให้ index ทำงานได้ดีขึ้น
  - เพิ่ม composite index ใน `inventory_movements` สำหรับงาน history: `inventory_movements_store_created_at_idx`, `inventory_movements_store_type_created_at_idx`
  - เอาตัวเลข count ออกจาก chip filter เพื่อกันความเข้าใจผิดจากข้อมูลรายหน้า (pagination)

- แก้ปัญหา date input ล้นจอบนมือถือใน PO:
  - ช่อง `คาดว่าจะได้รับ` และ `ครบกำหนดชำระ` (Create PO) ปรับเป็น 1 คอลัมน์บน mobile และ 2 คอลัมน์บนจอใหญ่ (`md+`)
  - ฟอร์ม `แก้ไข PO` ส่วนวันที่/tracking ปรับจาก `sm:3 คอลัมน์` เป็น responsive (`1 -> 2 -> 3`) เพื่อลดการบีบช่องบนจอเล็ก
  - เพิ่ม `min-w-0/max-w-full` ให้ input/group ที่เกี่ยวข้อง เพื่อลดเคส native date control (`dd/mm/yyyy`) ดันความกว้างเกินหน้าจอ
  - เพิ่ม helper text และ quick actions ในช่องวันที่ของ Create/Edit PO (`วันนี้`, `+7 วัน`, `สิ้นเดือน`, `ล้างค่า`) เพื่อทดแทน placeholder ที่ `input[type=date]` บนมือถือไม่รองรับ
  - เพิ่ม hardening สำหรับ production mobile:
    - `SlideUpSheet` content เพิ่ม `overflow-x-hidden` กัน element ดันความกว้างเกิน viewport
    - date input ใน `Edit PO` ปรับเป็น `text-base` บนมือถือ (16px) แล้วค่อย `sm:text-sm` เพื่อลด iOS auto-zoom ที่ทำให้ดูเหมือน modal ล้นจอ
    - เพิ่มคลาส `po-date-input` และ global CSS (เฉพาะ coarse pointer) เพื่อบังคับขนาด/การตัดข้อความของ native date control (`::-webkit-datetime-edit`) ลดเคสล้นจอใน production mobile
  - เปลี่ยนช่อง `วันที่คาดรับ/ครบกำหนดชำระ` ใน Create/Edit PO เป็น custom datepicker (calendar popover) แทน native `type=date` เพื่อแก้เคสล้นจอบน iOS ให้เสถียรกว่า
  - ใน modal `คิว PO รอปิดเรท` ปรับช่องตัวเลข `อัตราแลกเปลี่ยนจริง` และ `ยอดชำระรวมตาม statement` ให้ใช้ placeholder `0` โดยไม่ prefill `0` จริง

- ปรับ UX ตอนสลับ `โหมดการทำงาน`/ตัวกรองที่ผูก URL ในหน้า PO:
  - ก่อน `router.replace` ระบบจะเก็บตำแหน่ง scroll ปัจจุบันไว้ และ restore หลัง query เปลี่ยน (best-effort)
  - ลดอาการหน้าเด้งกลับไปบนสุดระหว่างสลับ `PO Operations` / `Month-End Close` / `AP by Supplier`

- ปรับ UX ช่องตัวเลขใน modal `Create PO`:
  - ช่อง `ราคา/₭` (ต่อรายการสินค้า), `ค่าขนส่ง`, `ค่าอื่นๆ` เปลี่ยนเป็นค่าว่างเริ่มต้น (ไม่ prefill `0`)
  - เพิ่ม placeholder `0` ในทั้ง 3 ช่อง เพื่อลดขั้นตอนที่ผู้ใช้ต้องลบ `0` ก่อนพิมพ์
  - ถ้าผู้ใช้เว้นว่าง ระบบยังคำนวณ/ส่งค่าเป็น `0` อัตโนมัติผ่าน fallback เดิม (`Number(value) || 0`)

- ปรับ layout บนหน้า `/stock?tab=purchase`:
  - ย้ายบล็อก `โหมดการทำงาน` ให้ไปอยู่ใต้บล็อก `ตัวชี้วัดและทางลัด`
  - ปรับการ์ด KPI (`Open PO`, `Pending Rate`, `Overdue AP`, `Outstanding`) เป็นโทนสีปกติ (neutral) เพื่ออ่านง่ายและไม่แย่งสายตา

- เพิ่ม custom confirm ป้องกันการปิดฟอร์มสินค้าโดยไม่ตั้งใจ:
  - modal `เพิ่มสินค้า/แก้ไขสินค้า`: ถ้ามี draft ค้างแล้วกด `ยกเลิก` หรือ `X` จะมี dialog ยืนยันก่อนปิด
  - modal `Product Detail` ตอน `แก้ไขต้นทุน`: ถ้ามีการแก้ไขค้างแล้วกด `ยกเลิก` ในฟอร์มต้นทุนหรือกด `X` ปิดรายละเอียด จะมี dialog ยืนยันก่อนทิ้งข้อมูล
  - ถ้าไม่มีการแก้ไขค้าง ระบบจะปิดได้ทันทีเหมือนเดิม

- ปรับ UX modal `Product Detail` ในหน้า `/products`:
  - ปิดการปิดด้วย backdrop แล้ว (`closeOnBackdrop=false`)
  - ตอนคลิกนอก modal จะไม่ปิด เพื่อลดการเสีย context ระหว่างดูข้อมูลสินค้า
  - เพิ่ม inner padding ของเนื้อหาใน modal เล็กน้อย (จาก base `16px` เป็น `20px` ต่อด้าน) เพื่อให้หายใจขึ้นและอ่านข้อมูลง่ายขึ้น

- ปรับ default filter ของ `PO Operations`:
  - ค่าเริ่มต้นในรายการ PO เปลี่ยนจาก `ทั้งหมด` เป็น `งานเปิด (OPEN)` เพื่อลดงานที่ปิดแล้วในมุมมองแรก
  - sync URL ของ `poStatus` ให้ถือ `OPEN` เป็น default: ถ้าเป็น `OPEN` จะไม่เขียน query, แต่ถ้าเลือก `ทั้งหมด` หรือสถานะอื่นจะเขียน query เพื่อแชร์/refresh ได้มุมมองเดิม
  - ตอนล้าง shortcut/preset จะกลับมาที่ `OPEN` ตาม default ใหม่ และ empty-state ใน `OPEN` ยังมีปุ่มสร้าง PO ให้ใช้งานต่อได้ทันที

- ปรับ UX modal `Create PO` ให้กันปิดฟอร์มโดยไม่ตั้งใจ:
  - เมื่อมีข้อมูลค้างในฟอร์ม ถ้ากด `ยกเลิก` หรือกด `X` จะขึ้น custom confirm ก่อนปิด
  - ผู้ใช้เลือกได้ว่าจะ `กลับไปแก้ไข` หรือ `ปิดและทิ้งข้อมูล`
  - กรณีฟอร์มยังว่าง (ไม่มี draft) จะปิดได้ทันทีเหมือนเดิม

- เพิ่ม `Bulk settle` จาก workspace `AP by Supplier`:
  - ใน panel statement สามารถติ๊กเลือกหลาย PO แล้วกด `บันทึกชำระแบบกลุ่ม`
  - ใช้ endpoint เดิม `POST /api/stock/purchase-orders/[poId]/settle` แบบลำดับราย PO (ไม่เพิ่ม schema/API ใหม่)
  - รองรับ `ยอดชำระรวมตาม statement` (optional) เพื่อ auto-allocate ตาม due date เก่าสุดก่อน (`oldest due first`)
  - รองรับแสดง progress และรายการที่ fail ราย PO พร้อมข้อความจาก API
  - หลังจบงานจะ refresh ทั้ง list/AP panel เพื่อ sync KPI และยอดค้าง

- รองรับ flow “รับของก่อน ค่อยใส่ค่าขนส่งปลายเดือน” ใน PO:
  - เพิ่ม endpoint `POST /api/stock/purchase-orders/[poId]/apply-extra-cost` (idempotency + audit)
  - เพิ่ม service `applyPurchaseOrderExtraCostFlow`:
    - อนุญาตเฉพาะ PO สถานะ `RECEIVED` ที่ยังไม่ `PAID`
    - บล็อกกรณียอดรวมใหม่ต่ำกว่ายอดที่ชำระแล้ว
    - อัปเดต `shippingCost/otherCost/otherCostNote` และคำนวณ `landedCostPerUnit` ของรายการ PO ใหม่ตาม `qtyReceived`
  - เพิ่ม UI ใน PO Detail (`/stock?tab=purchase`) ปุ่ม `อัปเดตค่าส่ง/ค่าอื่น` + ฟอร์มกรอกยอดและ preview ยอดคงค้างใหม่
  - ข้อจำกัด MVP: อัปเดต AP/Outstanding ทันที แต่ไม่ recost สินค้าย้อนย้อนหลัง

- เพิ่ม notification workflow สำหรับ AP due/overdue (cron + in-app inbox + mute/snooze):
  - เพิ่ม cron endpoint `GET /api/internal/cron/ap-reminders` (auth ด้วย `CRON_SECRET`) เพื่อ sync แจ้งเตือนจาก `getPurchaseApDueReminders`
  - เพิ่ม schema `notification_inbox` (dedupe ต่อ PO+due status) และ `notification_rules` (mute/snooze ราย PO)
  - เพิ่ม API ฝั่ง settings:
    - `GET/PATCH /api/settings/notifications/inbox` (list inbox + mark read/unread/resolve)
    - `PATCH /api/settings/notifications/rules` (snooze/mute/clear)
  - ปรับหน้า `/settings/notifications` จากหน้า static เป็น in-app inbox ใช้งานจริง พร้อม action `อ่านแล้ว`, `ปิดรายการ`, `Snooze`, `Mute`
  - เพิ่ม quick inbox ที่ navbar (`AppTopNav`): bell badge, preview รายการล่าสุด, action `อ่านแล้ว`, และลิงก์ไปหน้า AP/Notification Center
  - ปรับ quick inbox บนจอ non-desktop (`<1024px`) ให้ใช้ popover card แบบเดียวกับ desktop (ไม่ full-screen) โดย render fixed-centered (portal) และจำกัดความสูง `~68dvh` เพื่อลดการล้นจอ/ล้นซ้าย
  - ปรับปุ่ม `เปลี่ยนร้าน` ใน navbar เป็น compact icon-first และซ่อนเมื่ออยู่หน้า `/settings/stores`
  - เพิ่ม graceful fallback ที่ `GET /api/settings/notifications/inbox` กรณี schema notification ยังไม่พร้อม: คืนรายการว่าง + warning แทน 500
  - เพิ่มข้อความแนะนำชัดเจนใน `PATCH /api/settings/notifications/inbox` (503) เมื่อ schema notification ยังไม่พร้อม เพื่อให้ผู้ดูแลรัน `npm run db:repair` และ `npm run db:migrate`
  - เพิ่ม cron schedule ใน `vercel.json` สำหรับ Vercel Hobby (`0 0 * * *` UTC) เพื่อรันวันละครั้ง
  - เพิ่ม GitHub Actions workflow `.github/workflows/ap-reminders-cron.yml` เป็น external scheduler fallback (schedule `10 0 * * *` UTC + manual dispatch)

- ปรับ UX หน้า `/stock?tab=purchase` ให้เป็น workspace-first:
  - ใน modal `Create PO` (Step 1) ช่อง `ชื่อซัพพลายเออร์` เป็น hybrid input: พิมพ์ชื่อใหม่ได้ และเพิ่มปุ่ม `ดูซัพพลายเออร์ทั้งหมด` เพื่อเปิด list picker (ค้นหา/แตะเลือกจาก PO history) สำหรับ mobile ที่ `datalist` ทำงานไม่สม่ำเสมอ
  - ช่อง `เบอร์ติดต่อ` ใน Create/Edit PO ปรับเป็น `type="tel"` + `inputMode="tel"` + `autoComplete="tel"` เพื่อให้มือถือเปิดคีย์บอร์ดตัวเลข/โทรศัพท์ทันที
  - ใน modal `Create PO` (Step 2) เพิ่มปุ่ม `ดูสินค้าทั้งหมด/ซ่อนรายการสินค้า` เพื่อเปิด list picker สินค้าโดยไม่ต้องพิมพ์ก่อน พร้อมคงช่องค้นหาเดิม (ชื่อ/SKU)
  - modal `Create PO` ปิดการปิดด้วย backdrop (กดนอก modal ไม่ปิด) และเพิ่มปุ่ม `ยกเลิก` ที่ footer เพื่อให้มีทางออกที่ชัดเจนทุก step
  - แยกบล็อก `โหมดการทำงาน` (workspace tabs) ออกจากบล็อก KPI/shortcut เพื่อไม่ให้ผู้ใช้สับสนระหว่าง navigation กับตัวเลขสรุป
    - เพิ่ม summary strip ด้านบน (`Open PO`, `Pending Rate`, `Overdue AP`, `Outstanding`) เป็น KPI summary-only (ไม่คลิก, สีการ์ดคงที่ไม่ highlight ตาม preset) และใช้ saved preset chip เป็น shortcut (พาไป workspace + ตั้งตัวกรองด่วน)
    - เพิ่ม workspace switcher 3 โหมด: `PO Operations`, `Month-End Close`, `AP by Supplier` (mobile sticky + badge count)
  - เพิ่มแถบ `Applied filter` + ปุ่มล้าง/บันทึก preset และเพิ่ม Saved preset ต่อผู้ใช้ (localStorage) พร้อมปุ่มลบ preset
  - เพิ่มตัวเรียง statement ใน `AP by Supplier` (due date / outstanding desc) และ empty-state guidance (`ล้างตัวกรอง statement`, `ล้างคำค้นหา supplier`)
    - จำ workspace ล่าสุดด้วย `workspace` query + localStorage เพื่อกลับเข้าแท็บแล้วอยู่โหมดเดิมอัตโนมัติ
    - sync ตัวกรองหลักลง URL (`poStatus`, `due`, `payment`, `sort`) เพื่อแชร์ลิงก์มุมมองเดียวกันได้
    - แยกการแสดง section ตาม workspace เพื่อลดความยาวหน้าและลด context-switch ระหว่างงานรายวันกับงานปิดเดือน
    - ไม่เปลี่ยน API เดิม; เป็นการปรับเฉพาะ information architecture และ interaction flow ฝั่ง UI
    - ปรับ localStorage key ของ workspace/preset ให้ผูกราย `storeId + userId` (ไม่ปนกันข้ามผู้ใช้/ข้ามร้านบน browser เดียว) และมี fallback migrate จาก key legacy
    - ตอน logout / force relogin หลังเปลี่ยนรหัสผ่าน จะล้าง localStorage กลุ่ม `csb.stock.purchase.*` เพื่อลดปัญหา preset ค้างบนเครื่อง shared
    - แก้ปัญหาเด้ง workspace ตอนเปิด `AP by Supplier`: ตอน sync filter (`due/payment/sort`) จะยึด query ล่าสุดจาก URL และบังคับคง `workspace=SUPPLIER_AP` ลดโอกาสถูก overwrite จาก query state เก่า

- แก้บั๊ก 500 ของ endpoint AP supplier:
  - สาเหตุจาก SQL expression `totalPaidBase` ใน `getOutstandingPurchaseRows` ปิดวงเล็บไม่ครบ
  - แพตช์ที่ `lib/reports/queries.ts` แล้ว (`GET /api/stock/purchase-orders/ap-by-supplier` กลับมาทำงานได้)

- เพิ่ม workflow ปลายเดือนแบบกลุ่มในคิว `PO รอปิดเรท` (หน้า `/stock?tab=purchase`):
  - เลือกหลาย PO แล้วสั่ง `ปิดเรท + ชำระปลายเดือน` ได้ครั้งเดียว
  - บังคับเลือก PO สกุลเดียวกันต่อรอบ เพื่อใช้อัตราแลกเปลี่ยนเดียวกัน
  - บังคับกรอก `paymentReference` รอบบัตร/รอบชำระ เพื่อ trace ย้อนหลังได้ชัด
  - ประมวลผลแบบลำดับด้วย endpoint เดิม (`finalize-rate` -> `settle`) และแสดง progress + รายการที่ fail เป็นราย PO
  - เพิ่มโหมด `manual-first statement reconcile`: กรอก `ยอดชำระรวมตาม statement` ได้ครั้งเดียว แล้วระบบ auto-match ลง PO ตามครบกำหนดเก่าสุดก่อน (oldest due first)
  - ถ้าไม่กรอกยอด statement ระบบจะชำระเต็มยอดค้างทุกรายการที่เลือกเหมือนเดิม; ถ้ากรอกแล้วมีเงินเหลือ ระบบจะแจ้งยอดที่ยังไม่ถูกจับคู่

- เพิ่ม reminder งานค้างชำระอัตโนมัติบน dashboard (in-app):
  - `getDashboardViewData` เพิ่มข้อมูล `purchaseApReminder` (แยก `overdue` / `due soon`, ยอดค้าง และรายการ PO top 5)
  - reuse logic due-status จาก `purchase-ap.service` ผ่าน `getPurchaseApDueReminders()` เพื่อให้กติกาตรงกับหน้า AP statement
  - dashboard ทุก store type (`online/cafe/restaurant/other`) แสดงบล็อกเตือนงาน AP และลิงก์ไป `/stock?tab=purchase`

- เพิ่ม AP ราย supplier แบบ drill-down ในหน้า `/stock?tab=purchase`:
  - เพิ่ม API summary supplier `GET /api/stock/purchase-orders/ap-by-supplier`
  - เพิ่ม API statement ราย supplier `GET /api/stock/purchase-orders/ap-by-supplier/statement` (filter `paymentStatus/dueFilter/dueFrom/dueTo/q`)
  - เพิ่ม API export CSV ราย supplier `GET /api/stock/purchase-orders/ap-by-supplier/export-csv`
  - เพิ่ม service กลาง `server/services/purchase-ap.service.ts` เพื่อ reuse outstanding dataset เดิมให้ตัวเลข summary/statement/export ตรงกัน
  - เพิ่ม UI panel `AP ราย supplier` (ค้นหา supplier, drill-down statement, filter และกดเปิด PO detail ต่อได้)

- เพิ่ม Phase AP/Payment Ledger สำหรับ PO:
  - เพิ่มคอลัมน์ `purchase_orders.due_date`
  - เพิ่มตาราง `purchase_order_payments` รองรับ entry แบบ `PAYMENT` และ `REVERSAL`
  - ขยายสถานะ `purchase_orders.payment_status` เป็น `UNPAID | PARTIAL | PAID`
  - ปรับ endpoint `POST /api/stock/purchase-orders/[poId]/settle` ให้รองรับยอดชำระบางส่วน (`amountBase`)
  - เพิ่ม endpoint `POST /api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse` สำหรับย้อนรายการชำระ
  - เพิ่ม endpoint `GET /api/stock/purchase-orders/outstanding/export-csv` สำหรับ export PO ค้างชำระ + FX delta ต่อซัพพลายเออร์
  - หน้า `/stock` tab PO เพิ่ม due date ใน create/edit, แสดงยอดชำระสะสม/ยอดค้าง, timeline ชำระ และปุ่มย้อนรายการชำระ
  - หน้า `/reports` เพิ่มการ์ด `AP Aging (0-30/31-60/61+)` และลิงก์ export CSV
  - อัปเดต `scripts/repair-migrations.mjs` ให้เติม `due_date`, สร้าง `purchase_order_payments`, และ sync `payment_status` จาก payment ledger

- เพิ่ม Phase ถัดไปของ PO ต่างสกุลเงิน (ปิดเรทก่อนชำระ + คิวงาน + รายงาน):
  - เพิ่ม endpoint `GET /api/stock/purchase-orders/pending-rate` สำหรับคิว `รอปิดเรท` (filter: supplier/receivedFrom/receivedTo)
  - เพิ่ม endpoint `POST /api/stock/purchase-orders/[poId]/settle` สำหรับบันทึกชำระ PO
  - เพิ่ม business rule: PO ต่างสกุลเงินที่ยังไม่ล็อกเรท จะบันทึกชำระไม่ได้ (ต้อง `finalize-rate` ก่อน)
  - เพิ่มคอลัมน์ `purchase_orders.exchange_rate_initial` เพื่อเก็บเรทตั้งต้นสำหรับเทียบกับเรทจริง
  - เพิ่มคอลัมน์ชำระ PO (`payment_status`, `paid_at`, `paid_by`, `payment_reference`, `payment_note`)
  - หน้า `/stock` tab PO เพิ่มการ์ดคิวรอปิดเรท + filter + ปุ่มลัดเปิด detail จากคิว
  - หน้า PO detail เพิ่ม section สถานะชำระ + ฟอร์ม `บันทึกชำระ` (พร้อม guard กรณีต่างสกุลเงินยังไม่ปิดเรท)
  - หน้า `/reports` เพิ่มการ์ดสรุป FX delta (pending/locked/changed + ผลรวมส่วนต่างมูลค่า)

- ปรับ flow PO สกุลเงินต่างประเทศ (deferred exchange rate):
  - ตอนสร้าง PO รองรับการไม่กรอก `exchangeRate` (ตั้งเป็นสถานะ `รอปิดเรท`)
  - เพิ่ม endpoint `POST /api/stock/purchase-orders/[poId]/finalize-rate` สำหรับปิดเรทจริงภายหลัง
  - เพิ่มคอลัมน์ใน `purchase_orders` เพื่อเก็บสถานะเรท (`exchange_rate_locked_at`, `exchange_rate_locked_by`, `exchange_rate_lock_note`)
  - หน้า PO list/detail แสดงสถานะ `รอปิดเรท` และมีปุ่ม `ปิดเรท` เมื่อ PO รับสินค้าแล้วแต่ยังไม่ล็อกเรท

- ปรับ UX หน้า `/products` ให้คงแท็บสถานะหลัง hard refresh:
  - ผูกแท็บสถานะ (`ทั้งหมด/ใช้งาน/ปิดใช้งาน`) กับ URL query `status`
  - เปิดหน้าใหม่ด้วย `?status=inactive` จะเข้าแท็บ `ปิดใช้งาน` ทันที และกดสลับแท็บแล้ว URL จะอัปเดตตาม

- ปรับ UX หน้า `/stock` ให้เหลือ action รีเฟรชเดียว:
  - เอาปุ่ม `รีเฟรช` ระดับหน้า (header) ออก
  - ให้ใช้เฉพาะปุ่ม `รีเฟรชแท็บนี้` ใน toolbar ของแต่ละแท็บ เพื่อลดความซ้ำซ้อนและลดการกดผิด

- ปรับ performance ของหน้า `/stock` tab `สั่งซื้อ (PO)` เพิ่มเติม:
  - เพิ่ม cache รายละเอียด PO ต่อ `poId` ที่ระดับแท็บ เพื่อให้เปิดรายการเดิมซ้ำได้เร็วทันที
  - เดิมเคยมี intent-driven prefetch ตอนผู้ใช้ `hover/focus/touch` แถวรายการ PO แต่รอบล่าสุดปิดแล้ว (เหลือ on-demand) เพื่อลดโหลดที่ไม่จำเป็นและลด race ข้ามแท็บ
  - ปรับ PO detail sheet ให้ใช้ cache ก่อนโหลดจริง, มีปุ่ม retry ตอนโหลด detail fail และ invalidate cache เมื่อแก้ไข/เปลี่ยนสถานะ PO

- ปรับ Phase 2 ของหน้า `/stock` (History tab):
  - เพิ่มโหมด API `GET /api/stock/movements?view=history` รองรับ server-side pagination/filter (`page`,`pageSize`,`type`,`q`,`productId`,`dateFrom`,`dateTo`)
  - เพิ่ม query layer `getInventoryMovementsPage` และต่อผ่าน repository/service เพื่อแยก concern ชัดเจน
  - ปรับ `StockMovementHistory` ให้ใช้ข้อมูลจาก API แบบแบ่งหน้าและกรองที่เซิร์ฟเวอร์
  - เพิ่ม filter หลักใน UI ประวัติ: ประเภท movement + สินค้า (SKU/ชื่อ) + ช่วงวันที่
  - เพิ่ม windowed virtualization ในรายการประวัติ เพื่อให้เลื่อนลื่นขึ้นเมื่อข้อมูลต่อหน้ามาก

- ปรับ Phase 1 UX/Performance ของหน้า `/stock` (เริ่มจากไม่ใช้ prefetch แบบ bulk):
  - `StockTabs` เปลี่ยนเป็น keep-mounted (mount เฉพาะแท็บที่เปิดแล้วคง state เดิมตอนสลับแท็บ)
  - เพิ่มคอมโพเนนต์กลาง `stock-tab-feedback` สำหรับ state มาตรฐานต่อแท็บ: loading skeleton / empty / error + retry / last updated + refresh button
  - แท็บ `สั่งซื้อ (PO)` เพิ่ม `รีเฟรชแท็บนี้` + `อัปเดตล่าสุด`, เพิ่ม fallback error แบบ retry และปรับ loading ใน PO detail เป็น skeleton
  - แท็บ `ประวัติ` เปลี่ยนเป็น state ฝั่ง client ที่รีเฟรชเองได้ผ่าน `GET /api/stock/movements` พร้อม last updated และ state มาตรฐาน
  - แท็บ `บันทึกสต็อก` เพิ่ม quick preset (`รับเข้า`, `ปรับยอด`, `ของเสีย`) พร้อม note template, เพิ่มรีเฟรชข้อมูลแท็บ, และส่ง `Idempotency-Key` ตอน `POST /api/stock/movements`
  - ปุ่ม `ดูประวัติทั้งหมด` ในแท็บบันทึกสต็อก เปลี่ยนจาก hard reload เป็น `router.push` ไป `?tab=history`

- ปรับ UX หน้า `/stock` tab `สั่งซื้อ (PO)`:
  - เอาปุ่มลัด `ตั้งค่า PDF` ออกจาก header ของรายการ PO
  - คงการตั้งค่าเอกสารไว้ที่หน้า `/settings/pdf?tab=po` เท่านั้น เพื่อลดความรกของ action หลักในหน้า stock

- แก้ปัญหา 500 ที่ `GET /api/stock/purchase-orders/[poId]` จาก schema drift:
  - พบว่า DB บางสภาพแวดล้อมขาดคอลัมน์ `purchase_orders.updated_by/updated_at` (แต่โค้ด query คอลัมน์ดังกล่าว)
  - อัปเดต `scripts/repair-migrations.mjs` ให้เติมคอลัมน์ `updated_by` และ `updated_at` อัตโนมัติ
  - เพิ่ม backfill `updated_at` จาก `created_at` และสร้าง index `po_updated_at_idx`
  - รัน `npm run db:repair` กับฐานที่ใช้งานจริงแล้วเพื่อเติมคอลัมน์ที่ขาด

- ปรับ PO detail sheet ในหน้า `/stock` (tab purchase):
  - เปลี่ยนการโหลดรายละเอียด PO ให้ตรวจ `res.ok` และแสดง error message จาก API จริง
  - เพิ่ม fallback error ที่ชัดเจน (`โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ`, `เชื่อมต่อไม่สำเร็จ`)
  - เพิ่ม `AbortController` เพื่อยกเลิก request เดิมเมื่อผู้ใช้สลับ/คลิก PO ใหม่เร็ว ๆ
  - ลด false-negative ที่เคยแสดง `ไม่พบข้อมูล` แม้จริง ๆ เป็นปัญหา permission/network/server

- ปรับ performance/UX การสลับแท็บสถานะในหน้า `/products`:
  - แยก loading state ระหว่าง `filter change` กับ `load more` เพื่อลดการบล็อก UI
  - เพิ่ม client cache สำหรับผลลัพธ์หน้าแรกของแต่ละ filter key (`q/category/status/sort`) เพื่อให้สลับแท็บกลับมาที่เดิมได้เร็วขึ้น
  - เพิ่ม `AbortController` ยกเลิก request เก่าที่ค้างเมื่อผู้ใช้เปลี่ยนแท็บ/ฟิลเตอร์เร็ว ๆ
  - ถ้า filter ใหม่ยังไม่มี cache จะแสดง skeleton list ทันทีระหว่างรอ API
  - ถ้ามี cache จะแสดงข้อมูล cache ทันทีและ revalidate เบื้องหลังพร้อมข้อความ `กำลังอัปเดตรายการ...`

- ปรับ Cost Governance สำหรับสินค้า:
  - action `update_cost` (`PATCH /api/products/[productId]`) บังคับให้ส่ง `reason` อย่างน้อย 3 ตัวอักษร
  - เมื่อแก้ต้นทุนมือ ระบบจะเขียน audit event `product.cost.manual_update` พร้อม metadata `reason`, `previousCostBase`, `nextCostBase` และ before/after
  - เมื่อรับสินค้าเข้า PO แล้วต้นทุนเปลี่ยน ระบบจะเขียน audit event `product.cost.auto_from_po` อัตโนมัติจาก service layer
  - Product payload มี `costTracking` เพิ่ม (`source`, `updatedAt`, `actorName`, `reason`, `reference`) เพื่อให้หน้า Product Detail แสดงที่มาของต้นทุนล่าสุดได้
- ปรับ UI หน้า `/products` (Product Detail > tab ต้นทุน):
  - เพิ่มฟอร์มเหตุผลก่อนบันทึกต้นทุน และปิดปุ่มบันทึกจนกว่าจะกรอกเหตุผลครบ
  - เพิ่มบล็อกแสดงที่มาของต้นทุนล่าสุด (แก้ไขมือ/รับเข้า PO), เวลา, ผู้ทำ, หมายเหตุ, และเลขอ้างอิง PO (ถ้ามี)
- ปรับหน้า `/reports`:
  - เพิ่ม current-cost preview คู่กับ realized gross profit
  - แสดง `ต้นทุนสินค้า (ประเมิน)`, `กำไรขั้นต้น (ประเมิน)`, และส่วนต่างเทียบกับ realized
- ปรับหน้า `/stock?tab=recording`:
  - เอา field `cost` ออกจาก payload `POST /api/stock/movements`
  - เอา UI ช่องต้นทุน optional ออกจากฟอร์มบันทึกสต็อกเพื่อลดความเข้าใจผิด

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
  - เอาปุ่ม `รีเฟรช` ระดับหน้า (header) ออก เพื่อไม่ซ้ำกับ `รีเฟรชแท็บนี้`
  - ยืนยันแนวทางให้รีเฟรชเฉพาะแท็บที่กำลังใช้งานเท่านั้น
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

- ลดอาการเด้งแท็บในหน้า `/stock` โดยเฉพาะตอนสลับไป/กลับแท็บ `ประวัติ`
- ลดการยิงโหลดข้อมูลประวัติที่ไม่จำเป็นเมื่อผู้ใช้อยู่แท็บอื่น (เพราะ keep-mounted แต่ไม่ active)

- ลด friction ตอนคีย์ `ราคาขาย` ในฟอร์มเพิ่มสินค้า เพราะเริ่มจากช่องว่าง (ไม่ต้องลบ `0` ก่อนพิมพ์)
- คง behavior backend เดิม: ถ้าเว้นว่าง `ราคาขาย` จะถูกตีความเป็น `0` ตอนบันทึก

- ผู้ใช้มองเห็น tab ที่ active ชัดขึ้นในหน้า PO เพราะสี active สอดคล้องกับ `primary` ของระบบ (ไม่กลืนกับกลุ่ม neutral)
- visual language ของ navigation ในหน้า PO สอดคล้องกับ theme หลักมากขึ้น โดยไม่เปลี่ยน workflow/filter logic เดิม

- ลดความสับสนเวลาใช้งานช่วงปิดเดือน เพราะรูปแบบเลือกวันที่ในคิว `PO รอปิดเรท` ตรงกับ `Create PO` (พฤติกรรม/ปุ่มลัดเหมือนกัน)
- ลด friction บน mobile/iOS จาก native date input เดิมในคิว pending-rate และช่วยกรองช่วงวันที่ได้เร็วขึ้นด้วย quick actions
- ผู้ใช้หน้า `AP by Supplier` กรองช่วง due date และ export CSV ได้ด้วย UX วันที่แบบเดียวกับ `Create PO` ลดการสลับ mental model ระหว่าง workspace
- ลดปัญหา native date input บนมือถือใน filter `dueFrom/dueTo` โดยยังคงผลลัพธ์ statement/export เท่าเดิม (query format เดิม)
- ฟอร์มตัวกรองใน `AP by Supplier` อ่านง่ายขึ้นบนจอแคบ เพราะตัวกรองวันที่ถูกแยกออกจากแถว filter หลัก ลดการอัดหลายคอนโทรลในบรรทัดเดียว

- ปิดงานปลายเดือนได้เร็วขึ้นมากในกรณีจ่ายบัตรแบบ top-up ก้อนเดียว (ลดการคีย์ PO ทีละใบ)
- ลดความผิดพลาดจากการใส่ reference ไม่สม่ำเสมอ เพราะ bulk flow บังคับใช้ `paymentReference` เดียวกันทั้งรอบ
- ผู้ใช้เห็นรายการที่สำเร็จ/ไม่สำเร็จเป็นราย PO ทันที ทำให้ retry เฉพาะรายการที่ผิดได้เร็ว

- ผู้ใช้เห็นงาน AP เร่งด่วน (`เลยกำหนด` / `ใกล้ครบกำหนด`) ทันทีที่เข้า dashboard โดยไม่ต้องเข้าหน้า PO ก่อน
- ลดโอกาสหลุดงาน due date เพราะ reminder ใช้กติกาเดียวกับหน้า statement ราย supplier
- เพิ่มความเร็วการตามงานค้าง: จาก dashboard กดไป `/stock?tab=purchase` ต่อได้ทันที

- ทีมจัดซื้อ/บัญชีไล่งาน AP ได้เร็วขึ้นจากหน้าเดียว: เห็นยอดค้างราย supplier -> กดดู statement -> เจาะเข้า PO ได้ทันที
- ลดความคลาดเคลื่อนของตัวเลข เพราะ summary/statement/export ใช้ฐาน outstanding dataset เดียวกัน
- ลดงาน manual ช่วงกระทบยอดปลายเดือนด้วย export CSV ราย supplier ตามตัวกรองจริงในหน้าจอ

- รองรับ flow เจ้าหนี้จริง: จ่ายบางส่วนได้, ย้อนรายการได้, และติดตามยอดค้างเป็น PO-level ledger ได้ชัดเจนขึ้น
- ลดความเสี่ยงยอดชำระคลาดเคลื่อนจากการ overwrite ค่าเดิม เพราะทุก payment/reversal ถูกเก็บเป็นรายการแยก
- ทีมบัญชีเห็นหนี้ค้างตามอายุ (AP Aging) และ export CSV ไปกระทบยอด supplier ได้ทันที
- `db:repair` รองรับฐานเก่าที่ยังไม่มีโครง AP ใหม่ ช่วยลดความเสี่ยง 500 หลัง deploy
- ปิดช่องโหว่ flow การเงิน: ระบบไม่ให้บันทึกชำระ PO ต่างสกุลเงินก่อนล็อกเรทจริง ลดความเสี่ยงบันทึกต้นทุนผิด
- ผู้ใช้มีคิวงานปลายงวดชัดเจนขึ้น (PO รับแล้วแต่ยัง `รอปิดเรท`) และกรองตามซัพพลายเออร์/ช่วงวันที่ได้
- ทีมเห็นผลกระทบส่วนต่าง FX จากข้อมูลจริงในหน้า reports (เรทตั้งต้นเทียบเรทที่ล็อก)
- ติดตามสถานะหนี้ PO ได้ง่ายขึ้นจาก `paymentStatus/paidAt/paidBy` ใน PO detail/list
- ผู้ใช้สามารถสร้าง/รับสินค้า PO ต่างสกุลเงินได้แม้ยังไม่ทราบเรทจริง และกลับมาปิดเรทตอนชำระปลายงวดได้
- ลดการเดาเรทตอนสร้าง PO และเพิ่มความชัดเจนของสถานะเรทผ่าน badge/action ในหน้า PO
- ผู้ใช้หน้า `/products` อยู่แท็บเดิมได้หลัง hard refresh/back-forward ลดการต้องกดแท็บซ้ำในงานจริง
- การเปิด PO detail ซ้ำ/เปิดรายการถัดไปเร็วขึ้นชัดเจน เพราะมี cache ต่อใบและ prefetch เฉพาะ intent ของผู้ใช้
- ลดความรู้สึกหน่วงตอนแตะรายการใน PO tab โดยไม่เพิ่ม request แบบยิงล่วงหน้าเกินจำเป็น (ยังคุม network cost ได้)
- History tab รองรับข้อมูลจำนวนมากขึ้นโดยไม่หน่วงจากการ render ทั้งรายการใน DOM พร้อมกัน
- การกรองข้อมูลประวัติย้ายไปฝั่ง server ลด payload และเวลาค้นหาในกรณีข้อมูลเยอะ
- ผู้ใช้ค้นประวัติได้ตรงขึ้นด้วยตัวกรองสินค้า/ช่วงวันที่ โดยไม่ต้องเลื่อนดูทีละหน้าแบบเดิม
- การสลับแท็บในหน้า stock ไม่รีเซ็ตฟอร์ม/รายการที่ผู้ใช้กำลังทำอยู่ ลดงานซ้ำจากการกรอกใหม่
- ผู้ใช้รีเฟรชข้อมูลเฉพาะแท็บที่ใช้งานอยู่ได้ทันที และเห็นเวลาอัปเดตล่าสุดเพื่อลดการกดซ้ำ
- loading/empty/error ของ 3 แท็บหลักมีรูปแบบเดียวกัน ทำให้เข้าใจสถานะระบบได้เร็วขึ้น
- ลดโอกาส submit stock movement ซ้ำจากการกดซ้ำ/เน็ตแกว่ง ด้วย `Idempotency-Key` จาก client
- หน้า PO โฟกัส action หลักขึ้น (`สร้างใบสั่งซื้อ`) และลดความสับสนจากปุ่มตั้งค่าที่ไม่ใช่งานรายวัน
- ลดโอกาสเกิด 500 ในหน้า PO detail จากฐานข้อมูลที่ขาด migration บางช่วง
- flow เปลี่ยนสถานะ PO ที่เขียน `updated_by/updated_at` จะไม่พังจากคอลัมน์หายอีกในฐานที่ผ่าน `db:repair`
- ผู้ใช้สามารถเห็นสาเหตุจริงเมื่อเปิด PO detail ไม่ได้ (เช่น ไม่มีสิทธิ์/ไม่พบ PO/ระบบผิดพลาด) แทนข้อความ generic
- ลดอาการข้อมูล PO detail เพี้ยนจาก request ตีกัน เมื่อคลิกหลายใบติดกันเร็ว ๆ
- การกดสลับแท็บ `ทั้งหมด/ใช้งาน/ปิดใช้งาน` ตอบสนองเร็วขึ้นอย่างเห็นได้ชัด โดยเฉพาะกรณีสลับกลับแท็บเดิม
- ลดอาการหน้าว่าง/ค้างระหว่างโหลดด้วย skeleton loading เมื่อข้อมูลยังมาไม่ถึง
- ลดโอกาสข้อมูลเด้งย้อนจาก request เก่า (stale response) ด้วยการ abort request ที่ถูกแทนที่
- ปุ่ม `โหลดเพิ่มเติม` ไม่ถูกรบกวนจาก loading ของการเปลี่ยนแท็บ (และกลับกัน)
- เพิ่มความโปร่งใสของต้นทุนสินค้า: ทุกการแก้ต้นทุนแบบ manual ต้องมีเหตุผลและมี audit trail ที่ตรวจย้อนหลังได้
- ลดความเสี่ยงแก้ต้นทุนมือโดยไม่มีที่มา เพราะ Product Detail แสดง cost source ล่าสุดจากระบบจริง
- ต้นทุนที่มาจากการรับเข้า PO ถูก trace ได้ระดับสินค้า (อ้างอิงเลข PO) โดยไม่ต้องเพิ่ม schema ใหม่
- ลดความสับสนในหน้า stock recording: ไม่เหลือช่องต้นทุนที่ผู้ใช้คิดว่ามีผลกับ `products.costBase`
- รายงานกำไรอ่านง่ายขึ้น: แยก realized margin ออกจาก current-cost preview ชัดเจน
- ผู้ใช้รีโหลดข้อมูลสินค้าล่าสุดได้ทันทีจาก header โดยไม่ต้องรีโหลดทั้งหน้าเอง
- ผู้ใช้รีโหลดข้อมูลสต็อกล่าสุดได้ตรงแท็บที่กำลังใช้งานผ่าน `รีเฟรชแท็บนี้` โดยไม่ต้องรีโหลดทั้งหน้า
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

- `components/app/purchase-order-list.tsx`
- `docs/UI_ROUTE_MAP.md`
- `docs/DECISIONS.md`
- `AI_CONTEXT.md`
- `docs/HANDOFF.md`
- `server/services/dashboard.service.ts`
- `server/services/purchase-ap.service.ts`
- `components/storefront/dashboard/shared.tsx`
- `components/storefront/dashboard/types/online-dashboard.tsx`
- `components/storefront/dashboard/types/cafe-dashboard.tsx`
- `components/storefront/dashboard/types/restaurant-dashboard.tsx`
- `components/storefront/dashboard/types/other-dashboard.tsx`
- `app/(app)/dashboard/page.tsx`
- `docs/UI_ROUTE_MAP.md`
- `docs/DECISIONS.md`
- `AI_CONTEXT.md`
- `docs/HANDOFF.md`
- `app/api/stock/purchase-orders/ap-by-supplier/route.ts`
- `app/api/stock/purchase-orders/ap-by-supplier/statement/route.ts`
- `app/api/stock/purchase-orders/ap-by-supplier/export-csv/route.ts`
- `server/services/purchase-ap.service.ts`
- `components/app/purchase-ap-supplier-panel.tsx`
- `components/app/purchase-order-list.tsx`
- `docs/API_INVENTORY.md`
- `docs/UI_ROUTE_MAP.md`
- `docs/DECISIONS.md`
- `AI_CONTEXT.md`
- `docs/HANDOFF.md`
- `app/api/stock/movements/route.ts`
- `app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts`
- `app/api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse/route.ts`
- `app/api/stock/purchase-orders/[poId]/settle/route.ts`
- `app/api/stock/purchase-orders/outstanding/export-csv/route.ts`
- `app/api/stock/purchase-orders/pending-rate/route.ts`
- `server/services/stock.service.ts`
- `server/repositories/stock.repo.ts`
- `server/services/purchase.service.ts`
- `server/repositories/purchase.repo.ts`
- `lib/inventory/queries.ts`
- `lib/purchases/validation.ts`
- `lib/db/schema/tables.ts`
- `components/app/stock-movement-history.tsx`
- `components/app/stock-tabs.tsx`
- `components/app/stock-tab-feedback.tsx`
- `components/app/purchase-order-list.tsx`
- `components/app/stock-movement-history.tsx`
- `components/app/stock-recording-form.tsx`
- `app/api/products/[productId]/route.ts`
- `lib/products/validation.ts`
- `lib/products/service.ts`
- `server/services/purchase.service.ts`
- `components/app/products-management.tsx`
- `components/app/stock-recording-form.tsx`
- `lib/reports/queries.ts`
- `app/(app)/reports/page.tsx`
- `AI_CONTEXT.md`
- `docs/API_INVENTORY.md`
- `docs/UI_ROUTE_MAP.md`
- `docs/DECISIONS.md`
- `docs/SCHEMA_MAP.md`
- `drizzle/0029_black_thunderbolt_ross.sql`
- `drizzle/0030_old_valkyrie.sql`
- `drizzle/0031_loud_maximus.sql`
- `drizzle/meta/0029_snapshot.json`
- `drizzle/meta/0030_snapshot.json`
- `drizzle/meta/0031_snapshot.json`
- `drizzle/meta/_journal.json`
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

ตรวจสอบเพิ่ม (optional): ตาราง `purchase_orders` ต้องมีคอลัมน์ `updated_by` และ `updated_at`

3. Quality checks

```bash
npm run lint
npm run build
```

4. Functional check
- เปิด `/stock?tab=purchase` ในการ์ด `คิว PO รอปิดเรท`:
  - เลือกหลาย PO สกุลเดียวกัน แล้วกด `ปิดเรท + ชำระปลายเดือน`
  - กรอก `อัตราแลกเปลี่ยน`, `วันที่ชำระ`, และ `paymentReference` แล้วเริ่มประมวลผล
  - ต้องเห็น progress ระหว่างรัน และเมื่อสำเร็จ PO เหล่านั้นต้องออกจากคิว `รอปิดเรท`
  - เปิด PO detail แต่ละใบที่สำเร็จ ต้องเห็นสถานะชำระอัปเดตและมี `paymentReference` ตามที่กรอก
- ทดสอบเลือก PO หลายสกุลเงินพร้อมกัน:
  - ระบบต้องไม่ให้เริ่ม bulk และแจ้งเตือนให้เลือกทีละสกุล
- ทดสอบให้บาง PO fail (เช่น ปิดสิทธิ์/แก้ข้อมูลระหว่างรัน):
  - ต้องมีรายการ error ราย PO และยังคงรายการที่ fail ไว้ให้แก้แล้วรันซ้ำได้
- เปิด `/dashboard` (ผู้ใช้ที่มีสิทธิ์ `dashboard.view` + `inventory.view`):
  - ต้องเห็นบล็อก `งานเจ้าหนี้ค้างชำระ (AP)`
  - ถ้ามี PO ค้างชำระเลยกำหนด/ใกล้ครบกำหนด ต้องเห็น count และยอดรวมแยกตามสถานะ
  - รายการเตือนต้องแสดง `PO`, `supplier`, `due date`, และ `ยอดค้าง`
  - ปุ่ม `ไปหน้า PO` ต้องพาไป `/stock?tab=purchase`
- เปิด `/stock?tab=purchase` แล้วดูการ์ด `AP ราย supplier`:
  - ต้องเห็นรายชื่อ supplier พร้อมยอดค้างรวม และจำนวน PO
  - ช่องค้นหา supplier ต้องกรองรายการได้
- เลือก supplier แล้วตรวจ statement:
  - ต้องเห็นรายการ PO ค้างชำระของ supplier นั้น
  - เปลี่ยน filter `payment status` / `due status` / ช่วง `due date` / ค้นหาเลข PO แล้วผลลัพธ์ต้องเปลี่ยนตาม
  - กดรายการใน statement ต้องเปิด PO detail ใบเดียวกันได้
- ใน panel `AP ราย supplier` กด `Export Supplier CSV`:
  - ต้องได้ไฟล์ CSV ที่มีคอลัมน์ `supplier_name`, `po_number`, `payment_status`, `due_status`, `outstanding_base`
  - ข้อมูลในไฟล์ต้องตรงกับ filter ปัจจุบันของ statement
- ไปหน้า `/stock?tab=purchase` แล้วคลิก PO หลายใบติดกันเร็ว ๆ:
  - ต้องไม่ค้างหรือสลับรายละเอียดผิดใบจาก request เก่า
- ทดสอบกรณี API detail ล้มเหลว (เช่น ปิด network ชั่วคราว/poId ไม่ถูกต้อง):
  - ใน sheet ต้องแสดงข้อความ error ที่สื่อสาเหตุจริง ไม่ใช่ `ไม่พบข้อมูล` ตายตัว
- เปิด `/products` แล้วกดสลับแท็บ `ทั้งหมด` <-> `ใช้งาน` <-> `ปิดใช้งาน` ต่อเนื่องเร็ว ๆ:
  - แท็บ active ต้องเปลี่ยนทันที
  - ถ้าแท็บนั้นยังไม่เคยโหลด ต้องเห็น skeleton list ระหว่างรอ
  - ถ้าเคยโหลดแล้ว ต้องเห็นข้อมูลขึ้นเร็วจาก cache และมีข้อความ `กำลังอัปเดตรายการ...` ชั่วคราว
- ขณะสลับแท็บ ให้กด `โหลดเพิ่มเติม` ตรวจว่า loading ของปุ่มยังแยกจาก loading ของการเปลี่ยนแท็บ
- เปิด `/products` > Product Detail > tab `ต้นทุน` > กด `แก้ไขต้นทุน`
- ไม่กรอกเหตุผลแล้วกดบันทึก: ปุ่มต้อง disabled และ/หรือระบบเตือน
- กรอกเหตุผล + เปลี่ยนต้นทุนแล้วบันทึก: ต้องสำเร็จ และใน tab ต้นทุนต้องเห็น `ที่มาของต้นทุนล่าสุด` เป็น `แก้ไขมือ` พร้อมเหตุผล/เวลา/ผู้ทำ
- สร้างหรือรับเข้า PO ให้ต้นทุนสินค้าเปลี่ยน แล้วกลับไปเปิด Product Detail: source ต้องเป็น `รับเข้า PO` และมีเลข PO ในช่องอ้างอิง
- เปิด `/stock?tab=recording` แล้วตรวจว่าไม่มีช่องกรอกต้นทุนในฟอร์มแล้ว
- เปิด `/reports` แล้วตรวจว่าการ์ด `กำไรขั้นต้น` มีทั้ง realized และ current-cost preview พร้อมส่วนต่าง
- เปิดหน้า `/products` แล้วตรวจว่ามีปุ่ม `รีเฟรช` อยู่ขวาบนบรรทัดเดียวกับ title `สินค้า`
- กดปุ่ม `รีเฟรช` และตรวจว่าปุ่มแสดง `กำลังรีเฟรช...` ระหว่างโหลด
- สร้าง PO โดยเลือกสกุลเงินต่างประเทศและไม่กรอกเรท:
  - ต้องสร้างสำเร็จและแสดงสถานะ `รอปิดเรท`
- เปลี่ยน PO เป็น `RECEIVED` แล้วเปิด detail:
  - ต้องเห็นปุ่ม `ปิดเรท`
- กด `ปิดเรท` แล้วกรอกเรทจริง:
  - ต้องบันทึกสำเร็จ, badge/ข้อความเปลี่ยนเป็น `ปิดเรทแล้ว` และปุ่ม `ปิดเรท` หาย
- PO ที่ `RECEIVED` และต่างสกุลเงิน:
  - ถ้ายัง `รอปิดเรท` ปุ่ม `บันทึกชำระ` ต้องถูก disable/ถูก block ด้วยข้อความชัดเจน
  - หลัง `ปิดเรท` แล้วกด `บันทึกชำระ` ต้องสำเร็จและแสดงสถานะ `ชำระแล้ว`
- ทดสอบ `บันทึกชำระ` แบบบางส่วน:
  - ใส่ยอดน้อยกว่ายอดรวม แล้วสถานะต้องเป็น `ชำระบางส่วน`
  - กรอกยอดเกินยอดค้างต้องถูก block พร้อมข้อความเตือน
- ใน PO detail:
  - ต้องเห็น timeline รายการ `PAYMENT/REVERSAL`
  - กด `ย้อนรายการ` บน payment ที่ยังไม่ถูกย้อน ต้องสำเร็จและยอดค้างเพิ่มกลับ
- เปิด `/reports` การ์ด `AP Aging`:
  - ต้องเห็น bucket `0-30 / 31-60 / 61+` และยอดรวมค้างชำระ
- ทดสอบ export CSV:
  - กด `Export CSV` จากหน้า `/reports` หรือ `/stock?tab=purchase` แล้วต้องได้ไฟล์ที่มีคอลัมน์ `supplier_name`, `po_number`, `outstanding_base`, `fx_delta_base`
- หน้า `/stock?tab=purchase` ส่วน `คิว PO รอปิดเรท`:
  - เปลี่ยน filter ซัพพลายเออร์/ช่วงวันที่แล้วรายการคิวต้องเปลี่ยนตาม
  - กดรายการในคิวต้องเปิด PO detail ใบนั้นได้ทันที
- หน้า `/reports`:
  - ต้องมีการ์ด `ผลต่างอัตราแลกเปลี่ยน (PO)` พร้อมตัวเลข pending/locked/changed และผลรวมผลต่างมูลค่า
- ไปที่ `/products?status=inactive` แล้ว hard refresh: ต้องคงแท็บ `ปิดใช้งาน`
- สลับแท็บสถานะใน `/products`: URL query `status` ต้องเปลี่ยนตาม และกด back/forward แล้วแท็บต้องตาม URL
- เปิดหน้า `/stock` แล้วตรวจว่าไม่มีปุ่ม `รีเฟรช` ระดับหน้าใน header แล้ว
- ตรวจทุกแท็บ (`Inventory/PO/Recording/History`) ว่ามีปุ่ม `รีเฟรชแท็บนี้` และทำงานได้ตามแท็บนั้น
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

1. เพิ่ม bulk payment import/reconcile จาก CSV statement ธนาคาร/บัตร แล้ว match เข้า PO/payment ledger แบบ idempotent
2. เพิ่ม role policy แบบละเอียดใน notification (`ใคร mute ได้`, scope ต่อ store/user/role) และเพิ่ม audit event สำหรับ action mute/snooze
3. เพิ่มช่องทางส่งแจ้งเตือนถัดไป (email/push) โดย reuse notification_inbox เป็น source-of-truth
4. เพิ่ม outbox worker สำหรับส่งข้อความ shipping label ไป Facebook/WhatsApp
