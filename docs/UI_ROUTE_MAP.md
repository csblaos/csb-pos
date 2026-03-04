# UI Route Map

ไฟล์นี้ map หน้า UI -> component หลัก -> API ที่เรียก เพื่อ trace ปัญหาได้เร็ว

## Notes

- หน้าแบบ server component บางหน้า query DB ตรงใน server action/query layer โดยไม่ยิง `/api/*`
- ตารางนี้เน้น flow หลักที่มีการเรียก API จากฝั่ง UI โดยตรง
- global header (`components/app/app-top-nav.tsx`) มี quick notification inbox (bell) เรียก `GET/PATCH /api/settings/notifications/inbox` และมีลิงก์ไป `/settings/notifications`; desktop ใช้ anchored popover, ส่วนจอ non-desktop (`<1200px`) ใช้ fixed-centered popover + จำกัดความสูง `~68dvh`
- หน้า `/stock?tab=purchase` ใช้ workspace switcher ในหน้าเดียว (`PO Operations` / `Month-End Close` / `AP by Supplier`) เป็นบล็อกนำทางแยกจาก KPI โดย reuse API เดิมทั้งหมด และจำโหมดล่าสุดผ่าน query `workspace` + localStorage; KPI strip (`Open PO`, `Pending Rate`, `Overdue AP`, `Outstanding`) เป็น summary-only (ไม่คลิก), ส่วน shortcut ใช้ saved preset ต่อผู้ใช้ (localStorage) และ sync filter ลง URL (`poStatus`, `due`, `payment`, `sort`) โดย `PO Operations` ใช้ default filter เป็น `OPEN`

## Dashboard

| Page | Main Component | API Calls |
|---|---|---|
| `/dashboard` | `components/storefront/dashboard/registry.tsx` | ไม่มี browser call ตรงไป `/api`; ใช้ server query `getDashboardViewData` เพื่อโหลด metrics + low stock + AP reminders (`overdue`/`due soon`) |

## Auth & Onboarding

| Page | Main Component | API Calls |
|---|---|---|
| `/login` | `components/app/login-form.tsx` | `POST /api/auth/login` |
| `/signup` | `components/app/signup-form.tsx` | `POST /api/auth/signup` |
| `/onboarding` | `components/app/onboarding-wizard.tsx` | `GET/POST /api/onboarding/channels`, `POST /api/onboarding/store`, `POST /api/auth/logout` |

## Orders

| Page | Main Component | API Calls |
|---|---|---|
| `/orders` | `components/app/orders-management.tsx` | `GET /api/orders` (หน้า manage ออเดอร์ที่สร้างแล้ว; CTA หลักเป็นปุ่ม `เข้าโหมด POS` เพื่อไป `/orders/new` และถอด quick create (`สร้างด่วน`) ออกจากหน้า manage) |
| `/orders/new` | `components/app/orders-management.tsx` (`mode=create-only`) | `POST /api/orders`, `GET /api/orders/[orderId]` (POS-style create flow: หน้าเลือกสินค้าแบบ card grid + toolbar `ค้นหา/สแกน` + category chips ใต้ search + sticky cart bar; product card แสดงรูปย่อสินค้า; ซ่อน bottom tab navigation ระหว่างอยู่หน้า create เพื่อโฟกัสงานและเพิ่มพื้นที่บนมือถือ; ใช้ปุ่ม back บน navbar เป็น `กลับรายการออเดอร์` พร้อม confirm เมื่อมี draft ค้าง; ขั้น checkout ใช้ CTA หลักเดียวสำหรับบันทึกและให้กลับไปแก้สินค้าได้จากปุ่มด้านบนใน sheet; checkout แยกประเภทออเดอร์เป็น `Walk-in ทันที` / `มารับที่ร้านภายหลัง` / `สั่งออนไลน์/จัดส่ง` และแสดง field+validation ตาม flow (ที่อยู่+COD เฉพาะออนไลน์, `Walk-in/Pickup` ไม่บังคับชื่อ/เบอร์); โหมดออนไลน์เพิ่ม section `ข้อมูลขนส่ง` แบบเลือกผู้ให้บริการเป็นปุ่ม grid (`Houngaloun`, `Anousith`, `Mixay`, `อื่นๆ`) โดยเริ่มต้นค่า provider ว่างและต้องเลือกเองก่อนสร้างออเดอร์ (ถ้า `อื่นๆ` กรอกชื่อเพิ่มได้), ส่ง `shippingCarrier` เป็นค่าว่างจาก UI; ช่อง `ค่าขนส่ง` (`ค่าส่งที่เรียกเก็บ`/`ต้นทุนค่าส่ง`) เป็น panel พับ/เปิด default ปิดและปิดแล้วรีเซ็ตเป็น `0`; บน desktop จัดการ์ด `ส่วนลด` และ `ค่าขนส่ง` เป็น 2 คอลัมน์เท่ากัน; วิธีรับชำระเป็นปุ่ม chips ตาม flow (`เงินสด/QR/ค้างจ่าย` และเพิ่ม `COD` เฉพาะออนไลน์); scanner ใช้โครงเดียวกับ `/orders` (`BarcodeScannerPanel` + permission sheet มาตรฐาน); เมื่อส่ง `checkoutFlow=PICKUP_LATER` ระบบสร้างสถานะ `READY_FOR_PICKUP` และจองสต็อกทันที; หลังสร้างสำเร็จ `Walk-in/Pickup` จะแสดง success action sheet พร้อม preview บิล และโหลดข้อมูลออเดอร์จริงผ่าน `GET /api/orders/[orderId]`; ปุ่มพิมพ์ใช้ hybrid (desktop = hidden iframe ไม่เปิดแท็บใหม่, mobile/tablet = ไป `/orders/[orderId]/print/receipt?autoprint=1` ในแท็บเดิม); `Online` จะพาไปหน้า detail ทันที; รองรับราคาหน่วยแปลงแบบกำหนดเองจากสินค้า โดย fallback เป็น `ราคาหน่วยหลัก x ตัวคูณ` หากไม่กำหนด และ fallback ชื่อลูกค้าอัตโนมัติเมื่อเว้นว่าง) |
| `/orders/[orderId]` | `components/app/order-detail-view.tsx` | `PATCH /api/orders/[orderId]`, `POST /api/orders/[orderId]/send-qr`, `POST /api/orders/[orderId]/shipments/label`, `POST /api/orders/[orderId]/shipments/upload-label`, `POST /api/orders/[orderId]/send-shipping` (detail action รองรับ COD flow: แพ็กจาก `PENDING_PAYMENT` ได้, ปุ่มยืนยันชำระเปลี่ยนเป็น `ยืนยันรับเงินปลายทาง (COD)` เมื่อ `SHIPPED + COD_PENDING_SETTLEMENT`, และเพิ่มปุ่ม `ตีกลับเข้าร้าน (COD)` ที่ยิง action `mark_cod_returned` โดยตรวจสิทธิ์ `orders.cod_return` เป็นหลัก) |

## Products

| Page | Main Component | API Calls |
|---|---|---|
| `/products` | `components/app/products-management.tsx` | `GET/POST /api/products` (หน้า list ใช้ server-side pagination/filter/sort ผ่าน query `q`,`categoryId`,`status`,`sort`,`page`,`pageSize`; response มีค่าสต็อก `stockOnHand/stockReserved/stockAvailable` และ `costTracking` สำหรับแสดงที่มาของต้นทุนใน Product Detail, modal เพิ่ม/แก้ไขรองรับโหมด variant และมี Matrix Generator สำหรับสร้างหลายรุ่นย่อยแบบ bulk; ส่วนหน่วยแปลงรองรับ `ราคาขายต่อหน่วยแปลง` แบบ optional; ตอนสลับแท็บสถานะมี client cache + abort stale request และแสดง skeleton loading ถ้ายังไม่มี cache; แท็บสถานะ sync กับ URL query `status` เพื่อคงแท็บเดิมหลัง hard refresh), `GET /api/products/models` (auto-suggest ช่อง `ชื่อสินค้าแม่ (Model)`, auto ตั้ง `ลำดับแสดง` จาก `nextSortOrder`, และ suggest `ชื่อ Variant` จาก `variantLabels`), `PATCH /api/products/[productId]` (action `update_cost` ต้องแนบ `reason`), `POST /api/products/generate-barcode` (ใช้ทั้งในฟอร์มปกติและเติม barcode ในตาราง matrix) (มีปุ่ม `รีเฟรช` แบบ manual ที่ header) |

## Stock & Purchase

- หน้า `/stock` ไม่มีปุ่มรีเฟรชรวมที่ header และใช้ `รีเฟรชแท็บนี้` เป็น action หลักต่อแท็บ
- `StockTabs` ใช้แบบ keep-mounted: เมื่อเข้าแท็บแล้วจะคง state เดิมไว้ตอนสลับไปมา
- แท็บ `inventory/history/recording/purchase` มีปุ่ม `รีเฟรชแท็บนี้` และแสดงเวลา `อัปเดตล่าสุด`

| Page | Main Component | API Calls |
|---|---|---|
| `/stock?tab=inventory` | `components/app/stock-inventory-view.tsx` | `GET /api/stock/products?page&pageSize&categoryId` (รีเฟรช/โหลดเพิ่มรายการสินค้าในแท็บดูสต็อก + กรองหมวดหมู่แบบ server-side), `GET /api/products/search?q&includeStock=true` (resolve ผลสแกนบาร์โค้ดให้แม่นขึ้นด้วยการหา exact barcode ก่อน fallback); sync state ลง URL เฉพาะตอนแท็บ active ผ่าน `inventoryQ/inventoryFilter/inventorySort/inventoryCategoryId`; scanner UI/logic ใช้คอมโพเนนต์กลางเดียวกับ `/products` |
| `/stock?tab=history` | `components/app/stock-movement-history.tsx` | `GET /api/stock/movements?view=history&page&pageSize&type&q&productId&dateFrom&dateTo` (history server-side pagination/filter; list render แบบ windowed virtualization; UI ใช้ filter bar แบบเรียบง่าย (`ประเภท` dropdown + `ค้นหา` + `ช่วงวันที่ custom datepicker`) และ sync filter/page ลง URL ด้วย `historyType/historyQ/historyDateFrom/historyDateTo/historyPage` ตอนกด apply, มี in-memory cache ต่อ filter key เพื่อสลับมุมมองเดิมได้เร็วขึ้น) |
| `/stock?tab=recording` | `components/app/stock-recording-form.tsx` | `POST /api/stock/movements` (ส่ง `Idempotency-Key` จาก client; บันทึก qty/unit/movementType; ถ้าส่ง field cost/rate จะโดน reject 400), `GET /api/stock/movements` (รีเฟรชสินค้าในแท็บ); UI มี guardrail/CTA ไปแท็บ PO โดยส่วนรายละเอียดยาวเป็นแบบพับ/ขยาย (default ปิด), มี mobile product picker (`ดูสินค้าทั้งหมด`) + sticky action `บันทึกสต็อก`, และ sync filter ลง URL (`recordingType`, `recordingProductId`); scanner UI/logic ใช้คอมโพเนนต์กลางเดียวกับ `/products` |
| `/stock?tab=purchase` | `components/app/purchase-order-list.tsx` | หน้าแบ่งเป็น 3 workspace (`PO Operations`, `Month-End Close`, `AP by Supplier`) + summary strip ด้านบนแบบ KPI summary-only (ไม่คลิก); shortcut ใช้ saved preset chip/Applied filter, และ workspace switcher ใช้สำหรับนำทางหลัก (`PO Operations` เปิดด้วย filter `OPEN` เป็น default และจะเขียน query `poStatus` เมื่อผู้ใช้เลือกสถานะอื่น); `GET /api/stock/purchase-orders` (รีเฟรช/โหลดเพิ่มรายการ PO), `GET/POST /api/stock/purchase-orders` (foreign currency สร้างแบบรอปิดเรทได้ + รองรับ `dueDate`), `GET /api/stock/purchase-orders/pending-rate` (คิวรอปิดเรท + filter ซัพพลายเออร์/ช่วงวันที่รับของ), `GET /api/stock/purchase-orders/[poId]` (detail ใช้ per-PO cache + intent-driven prefetch จาก hover/focus/touch และคง skeleton/retry เมื่อยังโหลดไม่เสร็จ), `POST /api/stock/purchase-orders/[poId]/finalize-rate` (ปิดเรทจริงหลังรับสินค้า; ใช้ได้ทั้งเดี่ยวและแบบกลุ่มจากคิวรอปิดเรท), `POST /api/stock/purchase-orders/[poId]/settle` (บันทึกชำระ PO แบบ partial/full; ใช้ได้ทั้ง workflow ปิดเดือนแบบกลุ่มในคิว pending-rate และ workflow เลือกหลาย PO จาก AP by Supplier โดยรองรับ manual-first statement allocation แบบ oldest due first), `POST /api/stock/purchase-orders/[poId]/apply-extra-cost` (อัปเดตค่าขนส่ง/ค่าอื่นภายหลังเมื่อ PO รับสินค้าแล้ว แต่ยังไม่ปิดจ่าย), `POST /api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse` (ย้อนรายการชำระ), `GET /api/stock/purchase-orders/outstanding/export-csv` (export เจ้าหนี้ค้างจ่าย + FX delta), `GET /api/stock/purchase-orders/ap-by-supplier` + `GET /api/stock/purchase-orders/ap-by-supplier/statement` + `GET /api/stock/purchase-orders/ap-by-supplier/export-csv` (panel AP ราย supplier แบบ drill-down/filter/export และเลือกหลายรายการเพื่อ bulk settle) |

## Reports

| Page | Main Component | API Calls |
|---|---|---|
| `/reports` | `app/(app)/reports/page.tsx` | page data query ฝั่ง server (`getReportsViewData`: sales/gross-profit/AP + COD overview + COD by shipping provider โดยรวม metric รายวันจาก `codSettledAt`/`codReturnedAt`) + ลิงก์ export `GET /api/stock/purchase-orders/outstanding/export-csv` |

## Settings

| Page | Main Component | API Calls |
|---|---|---|
| `/settings/profile` | `components/app/account-profile-settings.tsx`, `components/app/account-password-settings.tsx` | `GET/PATCH /api/settings/account` |
| `/settings/users` | `components/app/users-management.tsx` | `GET/POST /api/settings/users`, `GET/PATCH /api/settings/users/[userId]`, `GET /api/settings/users/candidates` |
| `/settings/categories` | `components/app/categories-management.tsx` | `GET/POST/PATCH/DELETE /api/products/categories` |
| `/settings/units` | `components/app/units-management.tsx` | `GET/POST /api/units`, `PATCH/DELETE /api/units/[unitId]` |
| `/settings/store` | `components/app/store-profile-settings.tsx`, `components/app/store-financial-settings.tsx`, `components/app/store-inventory-settings.tsx` | `GET/PATCH /api/settings/store` |
| `/settings/store/payments` | `components/app/store-payment-accounts-settings.tsx` | `GET/POST/PATCH/DELETE /api/settings/store/payment-accounts` |
| `/settings/pdf` | `components/app/store-pdf-settings.tsx` | `GET/PATCH /api/settings/store/pdf` |
| `/settings/notifications` | `components/app/notifications-inbox-panel.tsx` | `GET/PATCH /api/settings/notifications/inbox` (list + mark read/unread/resolve), `PATCH /api/settings/notifications/rules` (mute/snooze/clear ราย PO) |
| `/settings/stores` | `components/app/stores-management.tsx` | `POST /api/stores/switch`, `POST /api/stores/branches/switch`, `POST /api/onboarding/store`, `GET/POST /api/stores/branches` |
| `/settings/superadmin/global-config` | `components/app/superadmin-payment-policy-config.tsx` | `GET/PATCH /api/settings/superadmin/payment-policy` |
| `/settings/audit-log` | `app/(app)/settings/audit-log/page.tsx` | server query ตรง (no direct browser call to `/api`) |

## System Admin

| Page | Main Component | API Calls |
|---|---|---|
| `/system-admin/config/clients` | `components/system-admin/superadmin-management.tsx` | `GET/POST /api/system-admin/superadmins`, `PATCH /api/system-admin/superadmins/[userId]` |
| `/system-admin/config/system` | `components/system-admin/system-branch-policy-config.tsx`, `components/system-admin/system-session-policy-config.tsx`, `components/system-admin/system-store-logo-policy-config.tsx` | `GET/PATCH /api/system-admin/config/branch-policy`, `GET/PATCH /api/system-admin/config/session-policy`, `GET/PATCH /api/system-admin/config/store-logo-policy` |

## Quick Debug Playbook

1. หา page จาก URL
2. เปิด component ตามตารางนี้
3. เช็ค API route ที่ map ไว้
4. ไล่ต่อไป service/repository ตาม `docs/CODEBASE_MAP.md`
