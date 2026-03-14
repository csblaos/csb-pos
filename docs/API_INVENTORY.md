# API Inventory

อัปเดตล่าสุดจากโค้ดใน `app/api/**/route.ts`

## Access Control Legend

- `Public` ไม่ต้อง login
- `Session` ต้องมี session (ตรวจเองใน route)
- `Permission:<key>` ใช้ `enforcePermission("<key>")`
- `SystemAdmin` ใช้ `enforceSystemAdminSession()`
- `Superadmin(SystemRole)` ใช้ role ตรวจ `SUPERADMIN`
- `CronSecret` ใช้ `CRON_SECRET`

## Auth / Session

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/auth/login` | `POST` | `Public` | login และสร้าง session |
| `/api/auth/logout` | `POST` | `Public` | logout/clear session |
| `/api/auth/signup` | `POST` | `Public` | signup |
| `/api/settings/account` | `GET,PATCH` | `Session` | profile/password/language ของผู้ใช้ปัจจุบัน; `GET` คืน `preferredLanguage`; `PATCH` รองรับ `action=update_profile`, `action=change_password`, `action=update_language` |

## Onboarding / Store Switching

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/onboarding/channels` | `GET` | `Permission:connections.view` | ดูสถานะช่องทาง |
| `/api/onboarding/channels` | `POST` | `Permission:connections.update` | อัปเดตช่องทาง |
| `/api/onboarding/store` | `POST` | `Session` | สร้าง/ตั้งค่าร้านช่วง onboarding (seed master `shipping_providers` ค่าเริ่มต้นของร้านให้ทันที: `Houngaloun`, `Anousith`, `Mixay`) |
| `/api/stores/switch` | `POST` | `Session` | สลับ active store |
| `/api/stores/branches/switch` | `POST` | `Session` | สลับ active branch |
| `/api/stores/branches` | `GET` | `Permission:stores.view` | รายการสาขา |
| `/api/stores/branches` | `POST` | `Permission:stores.update` | เพิ่มสาขา |
| `/api/stores/branch-config` | `PATCH` | `Session` | ตั้งค่า branch config |

## Orders

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/orders` | `GET` | `Permission:orders.view` | list orders (response row มี `status` + `paymentStatus`; UI หน้า `/orders` ใช้แยกเคส `READY_FOR_PICKUP` เป็น badge รอง `ค้างจ่าย`/`ชำระแล้ว`/`รอตรวจสลิป`) |
| `/api/orders` | `POST` | `Permission:orders.create` | create order + idempotency (คำนวณ `lineTotal` ตามราคาของหน่วยที่เลือก; รองรับราคาหน่วยแปลงแบบกำหนดเองจากสินค้า; ถ้าไม่ส่ง `customerName` จะ fallback อัตโนมัติเป็น `ลูกค้าหน้าร้าน` หรือ `ลูกค้าออนไลน์` ตาม channel; รองรับ `checkoutFlow` (optional) โดย matrix ล่าสุดคือ `WALK_IN_NOW + ชำระแล้ว => status=PAID + OUT ทันที`, `WALK_IN_NOW + ON_CREDIT => status=PENDING_PAYMENT + RESERVE`, `PICKUP_LATER => status=READY_FOR_PICKUP + RESERVE` (ถ้าชำระแล้วจะตั้ง `paymentStatus=PAID` แต่ยังไม่ OUT จนกดยืนยันรับสินค้า), และ `ONLINE_DELIVERY => status=PENDING_PAYMENT + RESERVE`; payment method รองรับ `CASH`,`LAO_QR`,`ON_CREDIT`,`COD`,`BANK_TRANSFER` โดย `COD` ใช้ได้เฉพาะ `ONLINE_DELIVERY`; รองรับฟิลด์ขนส่ง optional ตอนสร้างออเดอร์ออนไลน์ `shippingProvider` และ `shippingCarrier` โดยปกติ UI จะเลือก provider จาก master `shipping_providers` ของร้าน และยังเปิด `อื่นๆ` ให้กรอก custom ได้) |
| `/api/orders/cod-reconcile` | `GET` | `Permission:orders.view` | list COD ที่รอปิดยอด (`SHIPPED + COD_PENDING_SETTLEMENT`) สำหรับหน้า reconcile; รองรับ query `dateFrom`,`dateTo`,`provider`,`q`,`page`,`pageSize` และคืนรายการ provider สำหรับ filter |
| `/api/orders/cod-reconcile` | `POST` | `Permission:orders.view` + `orders.mark_paid` | bulk ปิดยอด COD หลายออเดอร์ในครั้งเดียว (`codAmount`,`codFee`) พร้อมเขียน audit (`order.confirm_paid.bulk_cod_reconcile`) และ invalidate dashboard/reports cache; รองรับ `Idempotency-Key` เพื่อกันปิดยอดซ้ำและ replay response เดิม |
| `/api/orders/[orderId]` | `GET` | `Permission:orders.view` | order detail |
| `/api/orders/[orderId]` | `PATCH` | `Permission:orders.view` + internal action checks | submit payment/paid/pack/ship/cancel/update shipping + `mark_cod_returned` + `mark_picked_up_unpaid` (pickup flow รองรับ 2 ลำดับแล้ว: `ยืนยันรับชำระ -> ยืนยันรับสินค้า` หรือ `ยืนยันรับสินค้า (ค้างจ่าย) -> ยืนยันรับชำระ`; เพิ่มสถานะกลาง `PICKED_UP_PENDING_PAYMENT` สำหรับเคสรับสินค้าแล้วแต่ยังไม่ชำระ; `confirm_paid` รองรับ `PENDING_PAYMENT`, `READY_FOR_PICKUP`, `PICKED_UP_PENDING_PAYMENT`, และ COD settle หลัง `SHIPPED`; สำหรับ in-store credit settlement ของออเดอร์ `Walk-in/Pickup` (`channel=WALK_IN` + `paymentMethod=ON_CREDIT`) payload `confirm_paid` รับ `paymentMethod` = `CASH|LAO_QR` และ `paymentAccountId` เพื่อบันทึกวิธีรับเงินจริงตอนรับเงินที่ร้าน โดย QR หน้าร้านไม่บังคับ `paymentSlipUrl`; `submit_payment_slip` รองรับ `PICKED_UP_PENDING_PAYMENT` ด้วย; flow COD: `mark_packed` จาก `PENDING_PAYMENT` ได้และตัดสต็อกตอนแพ็ก, `confirm_paid` ปิดยอดด้วย `codAmount`, `mark_cod_returned` บังคับสิทธิ์ `orders.cod_return` พร้อม payload `codFee` + `codReturnNote` และตอนนี้ถูกเรียกได้ทั้งจากหน้า order detail และ quick action รายแถวใน `/orders/cod-reconcile`; cancel รองรับ 2 โหมด: `approvalMode=MANAGER_PASSWORD` หรือ `approvalMode=SELF_SLIDE`) |
| `/api/orders/payment-accounts/[accountId]/qr-image` | `GET` | `Permission:orders.create` หรือ `orders.view` | proxy รูป QR ของบัญชีรับเงินแบบ same-origin; default คืน `inline image`, และถ้า query `download=1` จะส่ง `Content-Disposition: attachment` สำหรับดาวน์โหลด |
| `/api/orders/[orderId]/send-qr` | `POST` | `Permission:orders.update` | ส่ง QR message (stub/manual mode) |
| `/api/orders/[orderId]/shipments/label` | `POST` | `Permission:orders.ship` | สร้าง shipping label + idempotency |
| `/api/orders/[orderId]/shipments/upload-label` | `POST` | `Permission:orders.update` | อัปโหลดรูปบิล/ป้ายจากเครื่องหรือกล้องขึ้น R2 (รับเฉพาะ `JPG/PNG/WebP`, ขนาดไม่เกิน `6MB`, และ optimize เป็น WebP แบบ strict ก่อนเก็บ; ถ้า optimize ไม่สำเร็จจะตอบ `400` แทนการเก็บไฟล์ดิบ) |
| `/api/orders/[orderId]/send-shipping` | `POST` | `Permission:orders.ship` | ส่งข้อความแจ้งจัดส่ง (auto/manual fallback) |

## Products / Categories

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/products` | `GET` | `Permission:products.view` | รายการสินค้าแบบ pagination (`q`,`categoryId`,`status`,`sort`,`page`,`pageSize`) + คืน `total`,`hasMore`,`summary`, ข้อมูล variant (`modelName`,`variantLabel`,`variantOptions`), ค่าสต็อก (`stockOnHand`,`stockReserved`,`stockAvailable`) และ `costTracking` (source/time/actor/reason/reference) |
| `/api/products` | `POST` | `Permission:products.create` | เพิ่มสินค้า (รองรับ payload `variant` เพื่อผูก/สร้าง model และบันทึก options; `conversions[]` รองรับ `pricePerUnit` แบบ optional สำหรับตั้งราคาหน่วยแปลง) |
| `/api/products/[productId]` | `PATCH` | หลัก `Permission:products.update` | มี action ย่อยบางตัวใช้ `hasPermission` เพิ่ม; multipart image upload จะรับเฉพาะ `JPG/PNG/WebP`, optimize เป็น `640px WebP` แบบ strict ก่อนเก็บ `products.imageUrl` เป็น object key/path แล้ว resolve กลับเป็น public URL ใน response; action `update` รองรับ payload `variant` + `conversions[].pricePerUnit`; action `update_cost` ต้องมี `reason` และจะเขียน audit event `product.cost.manual_update` |
| `/api/products/models` | `GET` | `Permission:products.view` | ดึงรายการชื่อ Model สำหรับ auto-suggest (`q`,`limit`) และคืน `nextSortOrder` + `variantLabels` เมื่อส่ง `name` (รองรับ `variantQ`) เพื่อ auto ตั้ง `ลำดับแสดง` และแนะนำ `ชื่อ Variant` |
| `/api/products/search` | `GET` | `Permission:products.view` | search |
| `/api/products/generate-barcode` | `POST` | `Permission:products.create` | generate barcode |
| `/api/products/categories` | `GET` | `Permission:products.view` | list categories |
| `/api/products/categories` | `POST` | `Permission:products.create` | create category |
| `/api/products/categories` | `PATCH` | `Permission:products.update` | update category |
| `/api/products/categories` | `DELETE` | `Permission:products.delete` | delete category |

## Stock / Purchase Orders

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/stock/current` | `GET` | `Permission:inventory.view` | stock overview |
| `/api/stock/products` | `GET` | `Permission:inventory.view` | stock products (pagination: `page`,`pageSize`; รองรับ filter `categoryId`) |
| `/api/stock/movements` | `GET` | `Permission:inventory.view` | default: คืน `products + movements` สำหรับ stock overview; รองรับโหมด history (`view=history`) พร้อม query `page`,`pageSize`,`type`,`q`,`productId`,`dateFrom`,`dateTo` เพื่อ list movement แบบ server-side pagination/filter |
| `/api/stock/movements` | `POST` | `Permission:inventory.create` | create movement (payload ใช้เฉพาะ `qty/unit/movementType/adjustMode/note`; ถ้าส่ง field กลุ่มต้นทุน/เรท เช่น `cost`,`costBase`,`rate`,`exchangeRate` จะถูก reject 400) |
| `/api/stock/purchase-orders` | `GET` | `Permission:inventory.view` | list PO |
| `/api/stock/purchase-orders` | `POST` | `Permission:inventory.create` | create PO (foreign currency รองรับสร้างแบบยังไม่ปิดเรทได้ โดยไม่ส่ง `exchangeRate`) |
| `/api/stock/purchase-orders/ap-by-supplier` | `GET` | `Permission:inventory.view` | summary เจ้าหนี้ค้างจ่ายราย supplier (รองรับ `q`,`limit`) |
| `/api/stock/purchase-orders/ap-by-supplier/statement` | `GET` | `Permission:inventory.view` | statement AP ราย supplier (ต้องส่ง `supplierKey`; รองรับ `paymentStatus`,`dueFilter`,`dueFrom`,`dueTo`,`q`,`limit`) |
| `/api/stock/purchase-orders/ap-by-supplier/export-csv` | `GET` | `Permission:inventory.view` | export CSV statement ราย supplier ตาม filter |
| `/api/stock/purchase-orders/pending-rate` | `GET` | `Permission:inventory.view` | คิว PO ที่ `RECEIVED` และยัง `รอปิดเรท` รองรับ filter `supplier`,`receivedFrom`,`receivedTo`,`limit` |
| `/api/stock/purchase-orders/[poId]` | `GET` | `Permission:inventory.view` | PO detail |
| `/api/stock/purchase-orders/[poId]` | `PATCH,PUT` | `Permission:inventory.create` | update PO / status flow |
| `/api/stock/purchase-orders/[poId]/finalize-rate` | `POST` | `Permission:inventory.create` | ปิดเรทจริงหลังรับสินค้าแล้ว (รองรับ idempotency) |
| `/api/stock/purchase-orders/[poId]/settle` | `POST` | `Permission:inventory.create` | บันทึกชำระ PO แบบจ่ายบางส่วน/เต็มจำนวน (`amountBase`) และบังคับปิดเรทก่อนสำหรับ PO ต่างสกุลเงิน (รองรับ idempotency) |
| `/api/stock/purchase-orders/[poId]/apply-extra-cost` | `POST` | `Permission:inventory.create` | อัปเดต `shippingCost/otherCost` หลังรับสินค้า (เฉพาะ PO `RECEIVED` ที่ยังไม่ `PAID`) และ recalculation landed cost ในรายการ PO (รองรับ idempotency) |
| `/api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse` | `POST` | `Permission:inventory.create` | ย้อนรายการชำระ PO รายการที่เลือก (รองรับ idempotency) |
| `/api/stock/purchase-orders/outstanding/export-csv` | `GET` | `Permission:reports.view` | export CSV เจ้าหนี้ PO ค้างชำระ + FX delta ต่อซัพพลายเออร์ |

## Settings / Members / RBAC

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/settings/store` | `GET` | `Permission:settings.view` | store settings |
| `/api/settings/store` | `PATCH` | `Permission:settings.update` | update store settings |
| `/api/settings/store/pdf` | `GET` | `Permission:settings.view` | PDF settings |
| `/api/settings/store/pdf` | `PATCH` | `Permission:settings.update` | update PDF settings |
| `/api/settings/store/payment-accounts` | `GET` | `Permission:settings.view` | list payment accounts (response จะ resolve `qrImageUrl` เป็น public URL เสมอถ้าเป็นไฟล์ใน R2/CDN ของระบบ) |
| `/api/settings/store/payment-accounts` | `POST,PATCH,DELETE` | `Permission:stores.update` | manage payment accounts (`qrImageUrl` รับได้ทั้ง full URL เดิมหรือ object key/path; ถ้าอัปโหลดไฟล์ใหม่จะรับเฉพาะ `JPG/PNG/WebP`, optimize เป็น WebP แบบ strict ก่อนเก็บ และ normalize เป็น key ตอนบันทึกสำหรับไฟล์ของระบบ) |
| `/api/settings/store/shipping-providers` | `GET` | `Permission:settings.view` | list shipping provider master ของร้าน (เรียงตาม `sortOrder`) |
| `/api/settings/store/shipping-providers` | `POST,PATCH,DELETE` | `Permission:stores.update` | manage shipping provider master (`displayName`,`branchName`,`aliases`,`sortOrder`,`active`) สำหรับหน้า POS ออนไลน์ |
| `/api/settings/users` | `GET` | `Permission:members.view` | list members |
| `/api/settings/users` | `POST` | `Permission:members.create` | create member |
| `/api/settings/users/[userId]` | `GET` | `Permission:members.view` | member detail |
| `/api/settings/users/[userId]` | `PATCH` | `Permission:members.update` | update member |
| `/api/settings/users/candidates` | `GET` | `Permission:members.create` | search candidates |
| `/api/settings/roles` | `GET` | `Permission:rbac.roles.view` | list roles |
| `/api/settings/roles/[roleId]` | `GET` | `Permission:rbac.roles.view` | role detail |
| `/api/settings/roles/[roleId]` | `PATCH` | `Permission:rbac.roles.update` | update role |
| `/api/settings/notifications/inbox` | `GET` | `Permission:settings.view` | list in-app notification inbox (`filter`,`limit`) + summary counters; ถ้า schema notifications ยังไม่พร้อมจะ fallback เป็นรายการว่างพร้อม `warning` |
| `/api/settings/notifications/inbox` | `PATCH` | `Permission:settings.view` | action inbox: `mark_read`,`mark_unread`,`resolve`,`mark_all_read` (ถ้า schema notifications ยังไม่พร้อมจะตอบ `503` พร้อมข้อความแนะนำ `db:migrate:postgres`) |
| `/api/settings/notifications/rules` | `PATCH` | `Permission:settings.update` | ตั้งค่า mute/snooze/clear ราย entity (`SNOOZE`,`MUTE`,`CLEAR`) |
| `/api/settings/superadmin/payment-policy` | `GET,PATCH` | `Superadmin(SystemRole)` | global payment policy |

## Units

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/units` | `GET` | `Permission:units.view` | list units |
| `/api/units` | `POST` | `Permission:units.create` | create unit |
| `/api/units/[unitId]` | `PATCH` | `Permission:units.update` | update unit |
| `/api/units/[unitId]` | `DELETE` | `Permission:units.delete` | delete unit |

## System Admin

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/system-admin/superadmins` | `GET,POST` | `SystemAdmin` | list/create superadmin |
| `/api/system-admin/superadmins/[userId]` | `PATCH` | `SystemAdmin` | update superadmin quota config |
| `/api/system-admin/config/users/[userId]` | `PATCH` | `SystemAdmin` | update user config/system role |
| `/api/system-admin/config/stores/[storeId]` | `PATCH` | `SystemAdmin` | update store config |
| `/api/system-admin/config/branch-policy` | `GET,PATCH` | `SystemAdmin` | branch policy |
| `/api/system-admin/config/session-policy` | `GET,PATCH` | `SystemAdmin` | session policy |
| `/api/system-admin/config/store-logo-policy` | `GET,PATCH` | `SystemAdmin` | store logo policy |

## Internal / Cron

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/internal/cron/ap-reminders` | `GET` | `CronSecret` | sync AP due/overdue เข้าตาราง `notification_inbox` และเคารพ `notification_rules` |
| `/api/internal/cron/idempotency-cleanup` | `GET` | `CronSecret` | cleanup idempotency data |

## Notes

- Route ที่ไม่มี `enforcePermission()` ไม่ได้แปลว่า public เสมอไป ให้ดู guard ภายใน route
- Route หลักบางตัว (เช่น `/api/orders/[orderId]`) ใช้ permission เพิ่มเติมแบบ dynamic ผ่าน `hasPermission()` ตาม action
