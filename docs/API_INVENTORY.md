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
| `/api/settings/account` | `GET,PATCH` | `Session` | profile/password ของผู้ใช้ปัจจุบัน |

## Onboarding / Store Switching

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/onboarding/channels` | `GET` | `Permission:connections.view` | ดูสถานะช่องทาง |
| `/api/onboarding/channels` | `POST` | `Permission:connections.update` | อัปเดตช่องทาง |
| `/api/onboarding/store` | `POST` | `Session` | สร้าง/ตั้งค่าร้านช่วง onboarding |
| `/api/stores/switch` | `POST` | `Session` | สลับ active store |
| `/api/stores/branches/switch` | `POST` | `Session` | สลับ active branch |
| `/api/stores/branches` | `GET` | `Permission:stores.view` | รายการสาขา |
| `/api/stores/branches` | `POST` | `Permission:stores.update` | เพิ่มสาขา |
| `/api/stores/branch-config` | `PATCH` | `Session` | ตั้งค่า branch config |

## Orders

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/orders` | `GET` | `Permission:orders.view` | list orders |
| `/api/orders` | `POST` | `Permission:orders.create` | create order + idempotency |
| `/api/orders/[orderId]` | `GET` | `Permission:orders.view` | order detail |
| `/api/orders/[orderId]` | `PATCH` | `Permission:orders.view` + internal action checks | submit payment/paid/pack/ship/cancel/update shipping |
| `/api/orders/[orderId]/send-qr` | `POST` | `Permission:orders.update` | ส่ง QR message (stub/manual mode) |
| `/api/orders/[orderId]/shipments/label` | `POST` | `Permission:orders.ship` | สร้าง shipping label + idempotency |
| `/api/orders/[orderId]/shipments/upload-label` | `POST` | `Permission:orders.update` | อัปโหลดรูปบิล/ป้ายจากเครื่องหรือกล้องขึ้น R2 |
| `/api/orders/[orderId]/send-shipping` | `POST` | `Permission:orders.ship` | ส่งข้อความแจ้งจัดส่ง (auto/manual fallback) |

## Products / Categories

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/products` | `GET` | `Permission:products.view` | รายการสินค้า |
| `/api/products` | `POST` | `Permission:products.create` | เพิ่มสินค้า |
| `/api/products/[productId]` | `PATCH` | หลัก `Permission:products.update` | มี action ย่อยบางตัวใช้ `hasPermission` เพิ่ม |
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
| `/api/stock/products` | `GET` | `Permission:inventory.view` | stock products |
| `/api/stock/movements` | `GET` | `Permission:inventory.view` | list movements |
| `/api/stock/movements` | `POST` | `Permission:inventory.create` | create movement |
| `/api/stock/purchase-orders` | `GET` | `Permission:inventory.view` | list PO |
| `/api/stock/purchase-orders` | `POST` | `Permission:inventory.create` | create PO |
| `/api/stock/purchase-orders/[poId]` | `GET` | `Permission:inventory.view` | PO detail |
| `/api/stock/purchase-orders/[poId]` | `PATCH,PUT` | `Permission:inventory.create` | update PO / status flow |

## Settings / Members / RBAC

| Endpoint | Methods | Access Control | Notes |
|---|---|---|---|
| `/api/settings/store` | `GET` | `Permission:settings.view` | store settings |
| `/api/settings/store` | `PATCH` | `Permission:settings.update` | update store settings |
| `/api/settings/store/pdf` | `GET` | `Permission:settings.view` | PDF settings |
| `/api/settings/store/pdf` | `PATCH` | `Permission:settings.update` | update PDF settings |
| `/api/settings/store/payment-accounts` | `GET` | `Permission:settings.view` | list payment accounts |
| `/api/settings/store/payment-accounts` | `POST,PATCH,DELETE` | `Permission:stores.update` | manage payment accounts |
| `/api/settings/users` | `GET` | `Permission:members.view` | list members |
| `/api/settings/users` | `POST` | `Permission:members.create` | create member |
| `/api/settings/users/[userId]` | `GET` | `Permission:members.view` | member detail |
| `/api/settings/users/[userId]` | `PATCH` | `Permission:members.update` | update member |
| `/api/settings/users/candidates` | `GET` | `Permission:members.create` | search candidates |
| `/api/settings/roles` | `GET` | `Permission:rbac.roles.view` | list roles |
| `/api/settings/roles/[roleId]` | `GET` | `Permission:rbac.roles.view` | role detail |
| `/api/settings/roles/[roleId]` | `PATCH` | `Permission:rbac.roles.update` | update role |
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
| `/api/internal/cron/idempotency-cleanup` | `GET` | `CronSecret` | cleanup idempotency data |

## Notes

- Route ที่ไม่มี `enforcePermission()` ไม่ได้แปลว่า public เสมอไป ให้ดู guard ภายใน route
- Route หลักบางตัว (เช่น `/api/orders/[orderId]`) ใช้ permission เพิ่มเติมแบบ dynamic ผ่าน `hasPermission()` ตาม action
