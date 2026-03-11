# Turso Runtime Dependency Audit

เอกสารนี้สรุปว่า runtime path ไหนในแอปยังผูกกับ `Turso/LibSQL + Drizzle` อยู่จริง ณ ตอนนี้
เพื่อใช้เป็น source of truth ก่อนเริ่ม phase ถอด `Turso` ออกจาก runtime หลัก

## Snapshot

- วันที่ audit: March 11, 2026
- คำสั่งที่ใช้หลัก:

```bash
rg -l "import \\{ db \\} from ['\\\"]@/lib/db/client['\\\"]" app lib server
rg -n "TURSO_DATABASE_URL|TURSO_AUTH_TOKEN|createClient\\(|connection failed mode=turso" .
```

## Key Findings

1. runtime files ที่ยัง import `@/lib/db/client` แบบ top-level อยู่มี `0` ไฟล์แล้วใน `app/`, `lib/`, และ `server/`
2. [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) ยังอยู่เป็น legacy lazy path แต่ถูกลด side effect แล้ว
   - file นี้ยัง `createClient(...)` เมื่อถูก import/use จริง
   - แต่ไม่ยิง `select 1 as health_check` และไม่ log `initializing client/connection success` ตอน import อีก
3. runtime Turso import ถูกลดด้วย `getTursoDb()` จนไม่เหลือ top-level runtime import แล้ว
4. blocker หลักของการถอน Turso runtime ตอนนี้เหลือ lazy Turso paths/fallbacks และ compare/tooling cleanup ไม่ใช่ import graph
5. runtime callers ของ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ล่าสุดเหลือ `39` ไฟล์แล้ว และในก้อน `settings/superadmin + settings pages` ไม่เหลือ `getTursoDb` แล้ว

สถานะล่าสุดเพิ่ม:

- dead lazy path cleanup รอบล่าสุดย้าย runtime paths ฝั่ง `platform/auth/settings` จำนวนมากไปใช้ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) กลางแล้ว
- จากนั้นเก็บ `session + system-admin` ต่อใน wave เดียวแล้ว
- จากนั้นเก็บ `products/units` ต่อใน wave เดียวแล้ว
- remaining direct import path ไป [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) จาก `rg` เหลือ `1` จุด และเหลือเฉพาะ helper กลาง [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts)
- อย่างไรก็ตาม runtime callers ของ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ยังมี `71` ไฟล์ จึงยังไม่ถือว่า Turso ถูกถอดออกจาก runtime ทั้งหมด
- wave ล่าสุดย้าย `inventory` query helpers และ `purchase/stock` routes/pages ที่อ่าน `stores.currency` หรือ stock list/movement ผ่าน Turso ไป PostgreSQL แล้ว:
  - [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts)
  - [app/api/stock/purchase-orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/route.ts)
  - [app/api/stock/purchase-orders/[poId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/route.ts)
  - [app/api/stock/purchase-orders/pending-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/pending-rate/route.ts)
  - [app/api/stock/purchase-orders/[poId]/settle/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/settle/route.ts)
  - [app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts)
  - [app/(app)/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/page.tsx)
  - [app/(app)/stock/purchase-orders/[poId]/print/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/purchase-orders/[poId]/print/page.tsx)
- wave ล่าสุดต่อจากนั้นย้าย [server/repositories/stock.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/stock.repo.ts) ไป PostgreSQL query-first แล้ว ทำให้ `stock.repo` หลุดจาก Turso runtime callers
- wave ล่าสุดต่อจากนั้นย้าย low-risk callers อีก 3 จุดออกจาก Turso แล้ว:
  - [app/api/orders/payment-accounts/[accountId]/qr-image/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/payment-accounts/[accountId]/qr-image/route.ts)
  - [app/api/orders/[orderId]/shipments/upload-label/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/shipments/upload-label/route.ts)
  - [lib/stores/financial.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/stores/financial.ts)
- wave ล่าสุดต่อจากนั้นเก็บ `settings/superadmin + settings pages` ออกจาก Turso เพิ่มอีกก้อนแล้ว:
  - [app/(app)/settings/pdf/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/pdf/page.tsx)
  - [app/(app)/settings/profile/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/profile/page.tsx)
  - [app/(app)/settings/security/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/security/page.tsx)
  - [app/(app)/settings/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/stock/page.tsx)
  - [app/(app)/settings/store/shipping-providers/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/shipping-providers/page.tsx)
  - [app/(app)/settings/roles/[roleId]/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/roles/[roleId]/page.tsx)
  - [app/(app)/settings/superadmin/stores/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/stores/page.tsx)
  - [app/(system-admin)/system-admin/config/stores-users/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(system-admin)/system-admin/config/stores-users/page.tsx)
  - [lib/rbac/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/queries.ts)
  - [lib/superadmin/global-config.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/global-config.ts)
  - [lib/superadmin/overview.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/overview.ts)
  - [lib/superadmin/home-dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/home-dashboard.ts)
  - จากนั้นเก็บ 5 หน้าสุดท้ายในก้อนนี้ต่อจนครบ:
    - [app/(app)/settings/audit-log/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/audit-log/page.tsx)
    - [app/(app)/settings/superadmin/audit-log/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/audit-log/page.tsx)
    - [app/(app)/settings/superadmin/integrations/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/integrations/page.tsx)
    - [app/(app)/settings/superadmin/quotas/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/quotas/page.tsx)
    - [app/(app)/settings/superadmin/security/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/security/page.tsx)
  - หลัง wave นี้ ก้อน `settings/superadmin + settings pages` ไม่เหลือ Turso callers แล้ว และ runtime callers ของ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดเหลือ `39` ไฟล์

## Remaining Import Set

ตอนนี้ไม่เหลือไฟล์ runtime ที่ import `@/lib/db/client` แบบ top-level อยู่แล้ว

## Dependency Buckets

### Bucket A: Dual-path And Ready For Removal Queue

กลุ่มนี้มี PostgreSQL path แล้ว หรือมี retirement plan ชัดแล้ว
ยังต้องคง Turso ไว้ชั่วคราวเพราะ fallback หรือ flags ยังไม่เปิดครบ

ไฟล์หลัก:

- Orders:
  - [lib/orders/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/queries.ts)
  - [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts)
  - [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts)
  - [app/api/orders/cod-reconcile/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/cod-reconcile/route.ts)
  - [app/api/orders/[orderId]/shipments/upload-label/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/shipments/upload-label/route.ts)
  - [app/api/orders/payment-accounts/[accountId]/qr-image/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/payment-accounts/[accountId]/qr-image/route.ts)
- Inventory:
  - [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts)
  - [app/(app)/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/page.tsx)
- Purchase:
  - [server/services/purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts)
  - [server/repositories/purchase.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/purchase.repo.ts)
  - [app/api/stock/purchase-orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/route.ts)
  - [app/api/stock/purchase-orders/[poId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/route.ts)
  - [app/api/stock/purchase-orders/pending-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/pending-rate/route.ts)
  - [app/api/stock/purchase-orders/[poId]/settle/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/settle/route.ts)
  - [app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts)
- Reports:
  - [lib/reports/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/reports/queries.ts)

สถานะ:

- `orders read` เปิด PostgreSQL แล้ว
- `reports read` เปิด PostgreSQL แล้ว
- `purchase read`, `inventory read`, และ write flags หลายตัว ยังปิดอยู่

เงื่อนไขก่อนถอด:

- flags PostgreSQL ของโดเมนนั้นต้องเปิดจริง
- ผ่าน `zero fallback` ตาม [docs/postgres-all-postgres-observe-fallback-removal.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-all-postgres-observe-fallback-removal.md)
- compare/smoke scripts ของโดเมนนั้นยังผ่านหลังมี traffic จริง

### Bucket B: Still Turso-Primary And Not Ready To Remove

กลุ่มนี้ยังไม่มี PostgreSQL runtime slice ที่ใช้แทนได้ครบ
เป็น blocker หลักของการถอน Turso ออกจาก app runtime

#### B1. Auth, Session, App Shell

- [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx)
- [app/api/auth/login/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/login/route.ts)
- [app/api/auth/signup/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/signup/route.ts)
- [lib/auth/session.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/session.ts)
- [lib/auth/session-db.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/session-db.ts)
- [lib/auth/store-creation.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/store-creation.ts)
- [lib/auth/system-admin.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/system-admin.ts)

ผลกระทบ:

- ตราบใดที่กลุ่มนี้ยังอยู่บน Turso, authenticated app shell จะยังมี Turso dependency เสมอ
- เป็น blocker ที่ใหญ่สุดต่อการหยุด Turso probe ตอน build/runtime
- อัปเดตล่าสุด: phase `POSTGRES_AUTH_RBAC_READ_ENABLED` ถูกวาง foundation แล้ว และไฟล์กลุ่มนี้ส่วนใหญ่ถูกถอด top-level import ออกจาก `@/lib/db/client` แล้ว แต่ runtime fallback ยังอิง Turso อยู่จนกว่าจะเปิด flag และ observe ผ่าน

#### B2. RBAC, Branch Access, Policy

- [lib/rbac/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/access.ts)
- [lib/rbac/catalog.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/catalog.ts)
- [lib/rbac/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/queries.ts)
- [lib/system-config/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-config/policy.ts)

ผลกระทบ:

- ถึงแม้ orders/purchase/inventory จะย้ายแล้ว ถ้า RBAC ยังอยู่บน Turso route ส่วนใหญ่ก็ยังถอด Turso ไม่ได้
- อัปเดตล่าสุด: phase foundation ทำให้ `rbac/access`, `rbac/queries`, `system-config/policy`, และ `branches/access` รองรับ PostgreSQL แล้ว แต่ยังไม่ควรถอด Turso fallback จนกว่า `POSTGRES_AUTH_RBAC_READ_ENABLED=1` จะผ่าน parity/rollout
- อัปเดตล่าสุด: แยก branch domain foundation ออกมาต่างหากผ่าน [lib/platform/postgres-branches.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-branches.ts) และเพิ่ม flag `POSTGRES_BRANCHES_ENABLED=0`
- อัปเดตล่าสุด: [lib/branches/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts), [lib/branches/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/access.ts), [app/api/stores/branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts), และ [app/api/stores/branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts) มี PostgreSQL path แบบ flag-gated แล้ว
- parity ของ branch domain ผ่านแล้วผ่าน `npm run db:compare:postgres:branches`

#### B3. Settings, Store Config, Users/Roles, System Admin

ตัวอย่างไฟล์:

- pages:
  - [app/(app)/settings/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/page.tsx)
  - [app/(app)/settings/store/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/page.tsx)
  - [app/(app)/settings/store/payments/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/payments/page.tsx)
  - [app/(app)/settings/store/shipping-providers/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/shipping-providers/page.tsx)
  - [app/(app)/settings/users/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/users/page.tsx)
  - [app/(app)/settings/roles/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/roles/page.tsx)
  - [app/(app)/settings/audit-log/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/audit-log/page.tsx)
  - [app/(app)/settings/superadmin/overview/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/overview/page.tsx)
- APIs:
  - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
  - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
  - [app/api/settings/store/shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts)
  - [app/api/settings/users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts)
  - [app/api/settings/roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts)
  - [app/api/system-admin/superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts)
- libs:
  - [lib/system-admin/dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/dashboard.ts)
  - [lib/system-admin/superadmins.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/superadmins.ts)
  - [lib/superadmin/home-dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/home-dashboard.ts)
  - [lib/stores/financial.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/stores/financial.ts)

ผลกระทบ:

- เป็น domain ใหญ่ที่ยัง Turso-primary ทั้ง read/write
- ถ้ายังไม่ย้ายก้อนนี้, production runtime ยังต้องถือ `TURSO_*` ต่อไป
- อัปเดตล่าสุด: phase foundation ทำให้ `system-admin dashboard`, `superadmin list`, `store creation policy`, `settings superadmin overview`, และ `settings superadmin global-config` รองรับ PostgreSQL read path แล้วผ่าน `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED`
- อัปเดตล่าสุด: เพิ่ม helper [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) และเปลี่ยน server-rendered pages ของ `settings/system-admin` ให้ lazy-load Turso ตอนใช้งานจริงแทน top-level import แล้ว
- อัปเดตล่าสุด: ขยาย lazy import pass ต่อมายัง API ฝั่ง `settings/store + users/roles` แล้วใน:
  - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
  - [app/api/settings/store/shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts)
  - [app/api/settings/users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts)
  - [app/api/settings/roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts)
  - [app/api/settings/roles/[roleId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/[roleId]/route.ts)
- อัปเดตล่าสุด: เก็บ settings APIs ที่เหลือทั้งหมดให้ lazy-load Turso แล้วใน:
  - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
  - [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
  - [app/api/settings/account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts)
  - [app/api/settings/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts)
  - [app/api/settings/users/candidates/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/candidates/route.ts)
- อัปเดตล่าสุด: เพิ่ม PostgreSQL read foundation สำหรับ `store settings + payment accounts` แล้วผ่าน helper [lib/platform/postgres-store-settings.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings.ts)
- อัปเดตล่าสุด: เพิ่ม PostgreSQL write foundation สำหรับ `store settings + payment accounts` แล้วผ่าน helper [lib/platform/postgres-store-settings-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings-write.ts)
- อัปเดตล่าสุด: ขยาย foundation นี้ให้ครอบ `multipart/logo upload` ของ [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) แล้ว
- อัปเดตล่าสุด: เพิ่ม notifications foundation แล้วผ่าน helper [lib/platform/postgres-notifications.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-notifications.ts)
- read path แบบ flag-gated ถูกต่อแล้วใน:
  - [lib/stores/financial.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/stores/financial.ts)
  - [app/(app)/settings/store/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/page.tsx)
  - [app/(app)/settings/store/payments/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/payments/page.tsx)
  - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
  - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
  - [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
  - [app/api/orders/payment-accounts/[accountId]/qr-image/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/payment-accounts/[accountId]/qr-image/route.ts)
- หลัง page-level + API lazy import pass ของ settings ทั้งชุด และ store-settings foundation รอบนี้ top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `62` เหลือ `32` ไฟล์ และ `app/api/settings/**` ไม่เหลือ top-level import ของ `@/lib/db/client` แล้ว
- write path แบบ flag-gated ถูกต่อแล้วใน:
  - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) เฉพาะ `PATCH` แบบ JSON
  - [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
  - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
- `multipart/logo upload` ของ settings/store มี PostgreSQL write foundation แล้ว เหลือ rollout flag และ fallback removal ตาม runbook
- อัปเดตล่าสุด: เพิ่ม `settings/system-admin write foundation` แล้วผ่าน [lib/platform/postgres-settings-admin-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-settings-admin-write.ts)
- write path แบบ flag-gated ถูกต่อแล้วใน:
  - [app/api/system-admin/superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts)
  - [app/api/system-admin/superadmins/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/[userId]/route.ts)
  - [app/api/system-admin/config/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/users/[userId]/route.ts)
  - [app/api/system-admin/config/stores/[storeId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/stores/[storeId]/route.ts)
  - [app/api/system-admin/config/session-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/session-policy/route.ts)
  - [app/api/system-admin/config/store-logo-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/store-logo-policy/route.ts)
  - [app/api/settings/superadmin/payment-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/superadmin/payment-policy/route.ts)
- smoke script `npm run smoke:postgres:settings-system-admin-write` ผ่านแล้ว
- re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ล่าสุดเหลือ `23` ไฟล์

#### B4. Products, Units, Onboarding

- [app/(app)/products/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/products/page.tsx)
- [app/api/products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts)
- [app/api/products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts)
- [app/api/products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts)
- [app/api/units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts)
- [app/api/units/[unitId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/[unitId]/route.ts)
- [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts)
- [lib/products/variant-persistence.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/variant-persistence.ts)
- [app/api/onboarding/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/store/route.ts)
- [app/api/onboarding/channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts)

ผลกระทบ:

- เป็น domain รองจาก order/purchase แต่ยังแตะข้อมูลตั้งต้นของร้าน
- ถ้าจะ retire Turso ทั้งระบบ ก้อนนี้ต้องมี PostgreSQL slice แยกของมันเอง
- อัปเดตล่าสุด: phase foundation เพิ่ม `lib/platform/postgres-products-onboarding.ts` แล้ว และก้อน read แรกที่รองรับ PostgreSQL คือ `products page`, `units/categories list`, และ `onboarding channels/store-type`
- top-level Turso imports ลดลงเพิ่มอีกหลังย้าย helper/page/routes ชุดนี้จาก `71` เหลือ `66` ไฟล์, หลังเพิ่ม low-risk write foundation ลดต่อเหลือ `65` ไฟล์, หลัง phase `product CRUD + variant persistence foundation` ลดต่อเหลือ `62` ไฟล์, หลัง page-level lazy import pass ใน `settings/system-admin` ลดต่อเหลือ `44` ไฟล์, และหลัง API lazy import pass ใน `settings/store + users/roles` ลดต่อเหลือ `39` ไฟล์
- อัปเดตล่าสุด: low-risk write foundation สำหรับ `units`, `product categories`, และ `onboarding channel connect` ถูกวางแล้วผ่าน `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED`
- อัปเดตล่าสุด: product CRUD + variant persistence foundation ถูกวางแล้วผ่าน `POSTGRES_PRODUCTS_WRITE_ENABLED`
- write rollout ของ `products` หลัก และ `onboarding/store` ยังไม่ถูกเปิดจริงบน staging/production จึงยังไม่ควรถอด fallback หรือปิด `TURSO_*` ตอนนี้

#### B5. Misc Runtime Still On Turso

- [server/services/notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts)
- [server/services/order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts)
- [server/repositories/order-shipment.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/order-shipment.repo.ts)
- [app/(app)/stock/purchase-orders/[poId]/print/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/purchase-orders/[poId]/print/page.tsx)

หมายเหตุ:

- บาง file อยู่ใกล้โดเมนที่กำลัง migrate แล้ว แต่ยังพึ่ง Turso path ตรงอยู่
- จัดเป็น follow-up หลัง migration wave ของโดเมนนั้น ไม่ใช่ wave แรก
- อัปเดตล่าสุด: [server/services/notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts) ถูกย้ายเป็น PostgreSQL foundation แบบ flag-gated แล้ว และเลิก top-level import ของ `@/lib/db/client` แล้ว เหลือ rollout gate/checklist เป็น phase ถัดไป

### Bucket C: Tooling And Legacy-Only

กลุ่มนี้ไม่ได้ block app runtime โดยตรง แต่ยังใช้ Turso/Drizzle ในงาน support

- [drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/drizzle.config.ts)
- scripts backfill/compare/seed/repair:
  - [scripts/backfill-postgres-orders-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-orders-read.mjs)
  - [scripts/backfill-postgres-purchase-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-purchase-read.mjs)
  - [scripts/backfill-postgres-inventory-movements.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-inventory-movements.mjs)
  - [scripts/compare-postgres-orders-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-orders-read.mjs)
  - [scripts/compare-postgres-purchase-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-purchase-read.mjs)
  - [scripts/compare-postgres-inventory-parity.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-inventory-parity.mjs)
  - [scripts/compare-postgres-reports-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-reports-read.mjs)
  - [scripts/seed.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/seed.mjs)
  - [scripts/repair-migrations.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/repair-migrations.mjs)
  - [scripts/cleanup-idempotency.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/cleanup-idempotency.mjs)

สถานะ:

- คงไว้ได้ระหว่าง dual-run / audit / rollback window
- ไม่ใช่ priority แรกของการถอด runtime dependency

## Immediate Blockers

ถ้าจะลด Turso dependency ของ runtime จริงใน phase ถัดไป ต้องจัดลำดับตามนี้:

1. `auth/session + app shell`
   - เพราะ [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx) เป็น entry ของผู้ใช้แทบทุกหน้า
2. `RBAC + branch access + policy`
   - เพราะ route guards และ permission checks กระจายอยู่ทั่ว app
3. `settings/system-admin`
   - เพราะยังเป็นก้อน read/write ใหญ่ที่ยัง Turso-primary ทั้งชุด
4. ค่อยกลับมาถอด fallback ของ `orders/purchase/inventory/reports`
   - เมื่อ flags PostgreSQL เปิดจริงและผ่าน observe window แล้ว

## Recommended Removal Waves

### Wave 1: Keep Dual-Path, Start Migrating Platform Domains

เป้าหมาย:

- ไม่แตะ removal ของ orders/purchase/inventory/reports ก่อนเวลา
- เริ่มย้าย `auth/session`, `RBAC`, และ `app shell` ไป PostgreSQL

เหตุผล:

- ก้อนนี้ block runtime ทั้งระบบมากกว่า orders read/write ที่มี plan อยู่แล้ว

### Wave 2: Migrate Settings And Admin Domains

เป้าหมาย:

- ย้าย `settings/store`, `users/roles`, `audit-log`, `system-admin`

เหตุผล:

- เป็นกลุ่ม import ใหญ่สุดรองจาก app shell
- ถ้าไม่ย้ายก้อนนี้จะยังต้องคง `TURSO_*` ใน runtime env อยู่

### Wave 3: Migrate Products/Units/Onboarding

เป้าหมาย:

- ย้าย `products`, `units`, `onboarding`

เหตุผล:

- เป็น domain support ที่ยังผูกกับ Drizzle/Turso โดยตรง
- เมื่อย้ายเสร็จจะเหลือ Turso ใน runtime น้อยลงมาก

### Wave 4: Remove Core-Domain Fallbacks

เป้าหมาย:

- ถอด fallback ของ `reports -> purchase -> inventory -> orders -> write paths`

เงื่อนไข:

- ต้องผ่านเกณฑ์ใน [docs/postgres-all-postgres-observe-fallback-removal.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-all-postgres-observe-fallback-removal.md)

### Wave 5: Retire Turso Runtime

เป้าหมาย:

- เหลือ Turso เฉพาะ tooling ชั่วคราว
- จากนั้นค่อยเข้าสู่ [docs/postgres-turso-drizzle-retirement-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-drizzle-retirement-plan.md)

## Latest Runtime Reduction

- wave ล่าสุดเก็บ `platform/settings` ออกจาก Turso เพิ่มแล้วใน:
  - [lib/auth/system-admin.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/system-admin.ts)
  - [lib/auth/store-creation.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/store-creation.ts)
  - [lib/system-admin/dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/dashboard.ts)
  - [lib/system-admin/superadmins.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/superadmins.ts)
  - [lib/system-config/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-config/policy.ts)
  - [lib/rbac/catalog.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/catalog.ts)
  - [lib/rbac/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/access.ts)
  - [lib/branches/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/access.ts)
  - [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx)
  - [app/(app)/settings/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/page.tsx)
  - [app/(app)/settings/store/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/page.tsx)
  - [app/(app)/settings/store/payments/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/payments/page.tsx)
- runtime callers ของ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `71` เหลือ `59`
- wave ล่าสุดถัดมาเก็บ `purchase.service / purchase.repo` ออกจาก Turso เพิ่มแล้ว:
  - [server/services/purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts) เปลี่ยนทุก write flow ไปใช้ PostgreSQL transaction (`runInTransaction`)
  - [server/repositories/purchase.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/purchase.repo.ts) rewrite เป็น PostgreSQL raw SQL ทั้งหมด
  - purchase domain ไม่เรียก `getTursoDb()` ใน service/repo คู่นี้แล้ว
  - ตามด้วย [server/services/audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts) และ [server/services/idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts) ที่ถูกย้ายเป็น PostgreSQL raw SQL ทั้งหมดแล้ว
  - ตามด้วย [server/repositories/order-shipment.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/order-shipment.repo.ts) และ [server/services/order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts) ที่ถูกย้ายเป็น PostgreSQL raw SQL/transaction แล้ว
  - runtime callers ของ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ล่าสุดลดเหลือ `31`

## Practical Next Phase

phase ถัดไปที่แนะนำที่สุดคือ:

1. เก็บ [server/services/notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts)
2. ตามด้วย [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts)
3. จากนั้นค่อยเก็บ route/API callers ฝั่ง settings/products ที่ยังเหลือ
4. หลังจาก caller ลดลงอีกค่อยเริ่มถอด `TURSO_*` จาก runtime docs/env ให้ชัดขึ้น

เหตุผล:

- `notification` และ `products/service` เป็น caller ใหญ่ถัดไปที่ลด count ได้คุ้มหลังจากเก็บ service transactional หลักแล้ว
- route/API callers ฝั่ง settings/products ที่เหลือส่วนใหญ่จะเป็น cleanup wave หลัง service layer ลง PostgreSQL ครบขึ้น
