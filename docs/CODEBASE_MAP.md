# Codebase Map

ไฟล์นี้สรุป “โครงสร้างโค้ดทั้งระบบ” สำหรับการรับงานต่อแบบเร็วและแม่น

## 1) Top-Level Structure

- `app/`
  - Next.js App Router (หน้า UI + API route handlers)
- `components/`
  - UI component ฝั่ง client/server component ย่อย
- `lib/`
  - shared logic (auth, db, orders, shipping, pdf, rbac)
- `server/services/`
  - orchestration/business rule
- `server/repositories/`
  - data access ที่ผูก DB query
- `lib/db/schema/tables.ts`
  - schema หลักของ Drizzle
- `drizzle/`
  - migration SQL + meta snapshot/journal
- `scripts/`
  - utility scripts (repair migration, smoke test, cleanup)

## 2) Domain Ownership Map

### Orders / Payment / Shipping

- UI:
  - `app/(app)/orders/page.tsx`
  - `app/(app)/orders/[orderId]/page.tsx`
  - `components/app/orders-management.tsx`
  - `components/app/order-detail-view.tsx`
- API:
  - `app/api/orders/route.ts`
  - `app/api/orders/[orderId]/route.ts`
  - `app/api/orders/[orderId]/shipments/label/route.ts`
  - `app/api/orders/[orderId]/shipments/upload-label/route.ts`
  - `app/api/orders/[orderId]/send-shipping/route.ts`
  - `app/api/orders/[orderId]/send-qr/route.ts`
- Core logic:
  - `lib/orders/validation.ts`
  - `lib/orders/messages.ts`
  - `lib/orders/queries.ts`
  - `server/services/order-shipment.service.ts`
  - `server/repositories/order-shipment.repo.ts`
  - `lib/shipping/provider.ts`

### Stock / Purchase Orders

- UI:
  - `app/(app)/stock/page.tsx`
  - `components/app/purchase-order-list.tsx`
  - `components/app/stock-ledger.tsx`
  - `components/app/stock-recording-form.tsx`
- API:
  - `app/api/stock/current/route.ts`
  - `app/api/stock/products/route.ts`
  - `app/api/stock/movements/route.ts`
  - `app/api/stock/purchase-orders/route.ts`
  - `app/api/stock/purchase-orders/[poId]/route.ts`
- Core logic:
  - `server/services/stock.service.ts`
  - `server/services/purchase.service.ts`
  - `server/repositories/stock.repo.ts`
  - `server/repositories/purchase.repo.ts`

### Settings / RBAC / Members / PDF

- UI:
  - `app/(app)/settings/page.tsx`
  - `app/(app)/settings/users/page.tsx`
  - `app/(app)/settings/roles/page.tsx`
  - `app/(app)/settings/store/page.tsx`
  - `app/(app)/settings/store/payments/page.tsx`
  - `app/(app)/settings/pdf/page.tsx`
  - `app/(app)/settings/audit-log/page.tsx`
- API:
  - `app/api/settings/account/route.ts`
  - `app/api/settings/users/route.ts`
  - `app/api/settings/users/[userId]/route.ts`
  - `app/api/settings/roles/route.ts`
  - `app/api/settings/roles/[roleId]/route.ts`
  - `app/api/settings/store/route.ts`
  - `app/api/settings/store/payment-accounts/route.ts`
  - `app/api/settings/store/pdf/route.ts`
- Components:
  - `components/app/users-management.tsx`
  - `components/app/role-permissions-editor.tsx`
  - `components/app/store-pdf-settings.tsx`
  - `components/app/store-payment-accounts-settings.tsx`

### System Admin

- UI:
  - `app/(system-admin)/system-admin/**`
  - `components/system-admin/*`
- API:
  - `app/api/system-admin/superadmins/route.ts`
  - `app/api/system-admin/superadmins/[userId]/route.ts`
  - `app/api/system-admin/config/**/route.ts`
- Guard:
  - `lib/auth/system-admin.ts`

### Auth / Onboarding

- UI:
  - `app/(auth)/login/page.tsx`
  - `app/(auth)/signup/page.tsx`
  - `app/(auth)/onboarding/page.tsx`
- API:
  - `app/api/auth/login/route.ts`
  - `app/api/auth/signup/route.ts`
  - `app/api/auth/logout/route.ts`
  - `app/api/onboarding/channels/route.ts`
  - `app/api/onboarding/store/route.ts`

## 3) Reliability and Security Components

- Idempotency:
  - table: `idempotency_requests`
  - service: `server/services/idempotency.service.ts`
  - cron route: `app/api/internal/cron/idempotency-cleanup/route.ts`
  - cleanup script: `scripts/cleanup-idempotency.mjs`
- Audit:
  - table: `audit_events`
  - service: `server/services/audit.service.ts`
- Transaction smoke check:
  - `scripts/smoke-idempotency-tx.mjs`

## 4) Where to Start for Typical Tasks

- เพิ่ม/แก้ business flow:
  - route (`app/api/...`) -> service (`server/services/...`) -> repository (`server/repositories/...`)
- แก้ schema:
  - `lib/db/schema/tables.ts` -> generate migration -> update context docs
- แก้ UI หน้าใดหน้าหนึ่ง:
  - ดู mapping ใน `docs/UI_ROUTE_MAP.md` ก่อน

## 5) Mandatory Context Sync

เมื่อแก้โค้ดเสร็จ ต้องอัปเดต:

- `AI_CONTEXT.md`
- `docs/HANDOFF.md`
- `docs/API_INVENTORY.md` (ถ้า API เปลี่ยน)
- `docs/SCHEMA_MAP.md` (ถ้า schema/migration เปลี่ยน)
- `docs/UI_ROUTE_MAP.md` (ถ้าเปลี่ยน flow หน้า -> API)
