# UI Route Map

ไฟล์นี้ map หน้า UI -> component หลัก -> API ที่เรียก เพื่อ trace ปัญหาได้เร็ว

## Notes

- หน้าแบบ server component บางหน้า query DB ตรงใน server action/query layer โดยไม่ยิง `/api/*`
- ตารางนี้เน้น flow หลักที่มีการเรียก API จากฝั่ง UI โดยตรง
- global header (`components/app/app-top-nav.tsx`) มี quick notification inbox (bell) เรียก `GET/PATCH /api/settings/notifications/inbox` และมีลิงก์ไป `/settings/notifications`; desktop ใช้ anchored popover, ส่วนจอ non-desktop (`<1024px`) ใช้ fixed-centered popover + จำกัดความสูง `~68dvh`
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
| `/orders` | `components/app/orders-management.tsx` | `GET/POST /api/orders` (เปิดฟอร์มผ่าน `SlideUpSheet`: mobile = slide-up + swipe down, desktop = centered modal, รองรับสแกนบาร์โค้ดเพิ่มสินค้า + fallback ค้นหาเอง; ปุ่มไอคอน `Full Screen` toggle อยู่ที่ navbar โดย Desktop (`lg`+) แสดงเสมอเมื่อ browser รองรับ และ Touch device แสดงได้เมื่อ `NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=true`) |
| `/orders/[orderId]` | `components/app/order-detail-view.tsx` | `PATCH /api/orders/[orderId]`, `POST /api/orders/[orderId]/send-qr`, `POST /api/orders/[orderId]/shipments/label`, `POST /api/orders/[orderId]/shipments/upload-label`, `POST /api/orders/[orderId]/send-shipping` |

## Products

| Page | Main Component | API Calls |
|---|---|---|
| `/products` | `components/app/products-management.tsx` | `GET/POST /api/products` (หน้า list ใช้ server-side pagination/filter/sort ผ่าน query `q`,`categoryId`,`status`,`sort`,`page`,`pageSize`; response มีค่าสต็อก `stockOnHand/stockReserved/stockAvailable` และ `costTracking` สำหรับแสดงที่มาของต้นทุนใน Product Detail, modal เพิ่ม/แก้ไขรองรับโหมด variant และมี Matrix Generator สำหรับสร้างหลายรุ่นย่อยแบบ bulk; ตอนสลับแท็บสถานะมี client cache + abort stale request และแสดง skeleton loading ถ้ายังไม่มี cache; แท็บสถานะ sync กับ URL query `status` เพื่อคงแท็บเดิมหลัง hard refresh), `GET /api/products/models` (auto-suggest ช่อง `ชื่อสินค้าแม่ (Model)`, auto ตั้ง `ลำดับแสดง` จาก `nextSortOrder`, และ suggest `ชื่อ Variant` จาก `variantLabels`), `PATCH /api/products/[productId]` (action `update_cost` ต้องแนบ `reason`), `POST /api/products/generate-barcode` (ใช้ทั้งในฟอร์มปกติและเติม barcode ในตาราง matrix) (มีปุ่ม `รีเฟรช` แบบ manual ที่ header) |

## Stock & Purchase

- หน้า `/stock` ไม่มีปุ่มรีเฟรชรวมที่ header และใช้ `รีเฟรชแท็บนี้` เป็น action หลักต่อแท็บ
- `StockTabs` ใช้แบบ keep-mounted: เมื่อเข้าแท็บแล้วจะคง state เดิมไว้ตอนสลับไปมา
- แท็บ `history/recording/purchase` มีปุ่ม `รีเฟรชแท็บนี้` และแสดงเวลา `อัปเดตล่าสุด`

| Page | Main Component | API Calls |
|---|---|---|
| `/stock?tab=history` | `components/app/stock-movement-history.tsx` | `GET /api/stock/movements?view=history&page&pageSize&type&q&productId&dateFrom&dateTo` (history server-side pagination/filter; list render แบบ windowed virtualization) |
| `/stock?tab=recording` | `components/app/stock-recording-form.tsx` | `POST /api/stock/movements` (ส่ง `Idempotency-Key` จาก client; บันทึก qty/unit/movementType; ไม่มีการส่งค่า cost), `GET /api/stock/movements` (รีเฟรชสินค้าในแท็บ) |
| `/stock?tab=purchase` | `components/app/purchase-order-list.tsx` | หน้าแบ่งเป็น 3 workspace (`PO Operations`, `Month-End Close`, `AP by Supplier`) + summary strip ด้านบนแบบ KPI summary-only (ไม่คลิก); shortcut ใช้ saved preset chip/Applied filter, และ workspace switcher ใช้สำหรับนำทางหลัก (`PO Operations` เปิดด้วย filter `OPEN` เป็น default และจะเขียน query `poStatus` เมื่อผู้ใช้เลือกสถานะอื่น); `GET /api/stock/purchase-orders` (รีเฟรช/โหลดเพิ่มรายการ PO), `GET/POST /api/stock/purchase-orders` (foreign currency สร้างแบบรอปิดเรทได้ + รองรับ `dueDate`), `GET /api/stock/purchase-orders/pending-rate` (คิวรอปิดเรท + filter ซัพพลายเออร์/ช่วงวันที่รับของ), `GET /api/stock/purchase-orders/[poId]` (detail ใช้ per-PO cache + intent-driven prefetch จาก hover/focus/touch และคง skeleton/retry เมื่อยังโหลดไม่เสร็จ), `POST /api/stock/purchase-orders/[poId]/finalize-rate` (ปิดเรทจริงหลังรับสินค้า; ใช้ได้ทั้งเดี่ยวและแบบกลุ่มจากคิวรอปิดเรท), `POST /api/stock/purchase-orders/[poId]/settle` (บันทึกชำระ PO แบบ partial/full; ใช้ได้ทั้ง workflow ปิดเดือนแบบกลุ่มในคิว pending-rate และ workflow เลือกหลาย PO จาก AP by Supplier โดยรองรับ manual-first statement allocation แบบ oldest due first), `POST /api/stock/purchase-orders/[poId]/apply-extra-cost` (อัปเดตค่าขนส่ง/ค่าอื่นภายหลังเมื่อ PO รับสินค้าแล้ว แต่ยังไม่ปิดจ่าย), `POST /api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse` (ย้อนรายการชำระ), `GET /api/stock/purchase-orders/outstanding/export-csv` (export เจ้าหนี้ค้างจ่าย + FX delta), `GET /api/stock/purchase-orders/ap-by-supplier` + `GET /api/stock/purchase-orders/ap-by-supplier/statement` + `GET /api/stock/purchase-orders/ap-by-supplier/export-csv` (panel AP ราย supplier แบบ drill-down/filter/export และเลือกหลายรายการเพื่อ bulk settle) |

## Reports

| Page | Main Component | API Calls |
|---|---|---|
| `/reports` | `app/(app)/reports/page.tsx` | page data query ฝั่ง server (`getReportsViewData`) + ลิงก์ export `GET /api/stock/purchase-orders/outstanding/export-csv` |

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
