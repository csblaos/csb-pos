# UI Route Map

ไฟล์นี้ map หน้า UI -> component หลัก -> API ที่เรียก เพื่อ trace ปัญหาได้เร็ว

## Notes

- หน้าแบบ server component บางหน้า query DB ตรงใน server action/query layer โดยไม่ยิง `/api/*`
- ตารางนี้เน้น flow หลักที่มีการเรียก API จากฝั่ง UI โดยตรง

## Auth & Onboarding

| Page | Main Component | API Calls |
|---|---|---|
| `/login` | `components/app/login-form.tsx` | `POST /api/auth/login` |
| `/signup` | `components/app/signup-form.tsx` | `POST /api/auth/signup` |
| `/onboarding` | `components/app/onboarding-wizard.tsx` | `GET/POST /api/onboarding/channels`, `POST /api/onboarding/store`, `POST /api/auth/logout` |

## Orders

| Page | Main Component | API Calls |
|---|---|---|
| `/orders` | `components/app/orders-management.tsx` | `GET/POST /api/orders` (เปิดฟอร์มผ่าน `SlideUpSheet`: mobile = slide-up + swipe down, desktop = centered modal, รองรับสแกนบาร์โค้ดเพิ่มสินค้า + fallback ค้นหาเอง; ปุ่มไอคอน `Full Screen` toggle อยู่ที่ navbar ทั้ง Mobile/Desktop) |
| `/orders/[orderId]` | `components/app/order-detail-view.tsx` | `PATCH /api/orders/[orderId]`, `POST /api/orders/[orderId]/send-qr`, `POST /api/orders/[orderId]/shipments/label`, `POST /api/orders/[orderId]/shipments/upload-label`, `POST /api/orders/[orderId]/send-shipping` |

## Products

| Page | Main Component | API Calls |
|---|---|---|
| `/products` | `components/app/products-management.tsx` | `GET/POST /api/products`, `PATCH /api/products/[productId]`, `POST /api/products/generate-barcode` (มีปุ่ม `รีเฟรช` แบบ manual ที่ header) |

## Stock & Purchase

- หน้า `/stock` มีปุ่ม `รีเฟรช` แบบ manual ที่ header (ไม่มี auto-refresh)

| Page | Main Component | API Calls |
|---|---|---|
| `/stock?tab=history` | `components/app/stock-ledger.tsx` | `GET/POST /api/stock/movements` |
| `/stock?tab=recording` | `components/app/stock-recording-form.tsx` | `POST /api/stock/movements` |
| `/stock?tab=purchase` | `components/app/purchase-order-list.tsx` | `GET /api/stock/movements`, `GET/POST /api/stock/purchase-orders` |

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
