# PostgreSQL Staging Rollout Runbook

เอกสารนี้ใช้สำหรับเปิด PostgreSQL path บน staging แบบค่อยเป็นค่อยไป โดยอิง feature flags ที่มีอยู่จริงในระบบตอนนี้

## เป้าหมาย

- เปิดใช้งาน PostgreSQL `orders write` บน staging แบบปลอดภัย
- เปิดใช้งาน PostgreSQL `purchase read/write` บน staging แบบปลอดภัย
- คง `fallback -> Turso` ไว้ในแต่ละ action จนกว่าจะมั่นใจ
- ยังไม่เปิด `POSTGRES_INVENTORY_READ_ENABLED=1` จนกว่า movement producers นอก order route จะ dual-write ครบ

## Preflight Checklist

รันก่อนทุกครั้งใน environment ที่จะ rollout:

```bash
npm run smoke:postgres:auth-rbac-read-gate
npm run smoke:postgres:settings-system-admin-read-gate
npm run smoke:postgres:products-units-onboarding-read-gate
npm run db:check:postgres
npm run db:migrate:postgres
npm run db:compare:postgres:orders-read
npm run db:compare:postgres:purchase-read
npm run db:compare:postgres:inventory
npm run smoke:postgres:orders-write-suite
npm run smoke:postgres:purchase-suite
npm run smoke:postgres:inventory-read-gate
npm run lint
npm run build
```

ถ้า command ใด fail ให้หยุด rollout และแก้ที่ต้นเหตุทันที

หมายเหตุ:
- `npm run smoke:postgres:purchase-suite` ตอนนี้เป็น preflight chain ของ purchase rollout แล้ว โดยรวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, `db:backfill:postgres:purchase-read`, `db:compare:postgres:purchase-read`, purchase smokes, `db:compare:postgres:inventory`, `lint`, และ `build`
- `npm run smoke:postgres:orders-write-suite` ตอนนี้เป็น preflight chain ของ orders write rollout แล้ว โดยรวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, `db:compare:postgres:orders-read`, `db:compare:postgres:purchase-read`, `db:compare:postgres:inventory`, `db:compare:postgres:reports-read`, order write smokes ทั้งชุด, `lint`, และ `build`
- `npm run smoke:postgres:stock-movement-gate` ตอนนี้เป็น preflight chain ของ stock movement rollout แล้ว โดยรวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, `db:compare:postgres:branches`, `smoke:postgres:inventory-read-gate`, `smoke:postgres:stock-movement`, `lint`, และ `build`
- `npm run smoke:postgres:all-postgres-observe-gate` ตอนนี้เป็น operational gate สำหรับ phase observe/fallback removal แล้ว โดยรวม gates ของ auth/rbac, settings/system-admin, branches, store settings, notifications, products, reports, และ stock movement เพื่อเช็ก readiness ก่อนเริ่ม zero-fallback observe window

## Auth/RBAC Read Rollout

ก้อนนี้ควรเปิดก่อน `settings/system-admin` และก่อนพยายามลด Turso runtime เพิ่ม
เพราะมันครอบ app shell, role lookup, permission checks, branch access, และ policy reads ที่ route ส่วนใหญ่พึ่งอยู่

### Auth/RBAC Read Preflight

```bash
npm run smoke:postgres:auth-rbac-read-gate
npm run lint
npm run build
```

### Auth/RBAC Read Wave 0: Keep Off

```env
POSTGRES_AUTH_RBAC_READ_ENABLED=0
```

### Auth/RBAC Read Wave 1: Canary Enable

เปิด:

```env
POSTGRES_AUTH_RBAC_READ_ENABLED=1
```

ตรวจ:
- login ของ user ปกติ / superadmin / system admin ยัง redirect ถูก
- app shell ใน `/orders`, `/stock`, `/settings` ยังขึ้นชื่อร้าน / โลโก้ / branch ถูก
- route guards ที่อิง RBAC ยังทำงาน
- branch access ทั้งเคส `ALL` และ `SELECTED` ยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `auth-rbac.read.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-auth-rbac-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-auth-rbac-read-rollout-execution.md)

## Branches Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC` และ `settings/system-admin read` เพราะ branch policy, branch access, และ branch switch พึ่ง membership / role / permission / system-role จากก้อนแรก และพึ่ง system-admin/settings views จากก้อนหลังโดยตรง

### Branches Preflight

```bash
npm run smoke:postgres:branches-gate
npm run lint
npm run build
```

### Branches Wave 0: Keep Off

```env
POSTGRES_BRANCHES_ENABLED=0
```

### Branches Wave 1: Canary Enable

เปิด:

```env
POSTGRES_BRANCHES_ENABLED=1
```

ตรวจ:
- `GET/PATCH /api/system-admin/config/branch-policy`
- `GET/POST /api/stores/branches`
- `POST /api/stores/branches/switch`
- member branch access ใน `PATCH /api/settings/users/[userId]`
- `/settings/users`
- `/system-admin/config/stores-users`
- branch policy / quota / branch switch / selected branches ยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `branches.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-branches-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-branches-rollout-execution.md)

## Settings/System-Admin Read Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC` เพราะ dashboard / superadmin pages พึ่ง session, permission, membership, และ policy reads จากก้อนก่อนหน้าโดยตรง

### Settings/System-Admin Read Preflight

```bash
npm run smoke:postgres:settings-system-admin-read-gate
npm run lint
npm run build
```

### Settings/System-Admin Read Wave 0: Keep Off

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=0
```

### Settings/System-Admin Read Wave 1: Canary Enable

เปิด:

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1
```

ตรวจ:
- `/system-admin`
- `/system-admin/config/clients`
- `/system-admin/config/system`
- `/settings/superadmin`
- `/settings/superadmin/overview`
- `/settings/superadmin/global-config`
- ตัวเลข dashboard / superadmin list / store creation policy / global snapshots ยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `settings-admin.read.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-settings-system-admin-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-settings-system-admin-read-rollout-execution.md)

## Settings/System-Admin Write Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC` และ `settings/system-admin read` นิ่งแล้ว
เพราะ write path นี้พึ่ง read-side parity ของ dashboard/summaries/global snapshots โดยตรง และถ้าเปิดก่อน read side จะเสี่ยง stale หลังเขียน

### Settings/System-Admin Write Preflight

```bash
npm run smoke:postgres:settings-system-admin-write-gate
npm run lint
npm run build
```

### Settings/System-Admin Write Wave 0: Keep Off

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=0
```

### Settings/System-Admin Write Wave 1: Canary Enable

เปิด:

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=1
```

ตรวจ:
- `POST /api/system-admin/superadmins`
- `PATCH /api/system-admin/superadmins/[userId]`
- `PATCH /api/system-admin/config/users/[userId]`
- `PATCH /api/system-admin/config/stores/[storeId]`
- `PATCH /api/system-admin/config/session-policy`
- `PATCH /api/system-admin/config/store-logo-policy`
- `PATCH /api/settings/superadmin/payment-policy`
- global summaries / superadmin list / policy snapshots refresh แล้วตรง
- ไม่มี fallback warning ต่อเนื่องจาก `settings-admin.write.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-settings-system-admin-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-settings-system-admin-write-rollout-execution.md)

## Products/Units/Onboarding Read Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC` และ `settings/system-admin` เพราะ products page กับ onboarding routes พึ่ง session, membership, permission, store profile, และ store type จากสองก้อนก่อนหน้าโดยตรง

### Products/Units/Onboarding Read Preflight

```bash
npm run smoke:postgres:products-units-onboarding-read-gate
npm run lint
npm run build
```

### Products/Units/Onboarding Read Wave 0: Keep Off

```env
POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=0
```

### Products/Units/Onboarding Read Wave 1: Canary Enable

เปิด:

```env
POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=1
```

ตรวจ:
- `/products`
- `GET /api/products/models`
- `GET /api/products/search`
- `/settings/categories`
- `/settings/units`
- `GET /api/products/categories`
- `GET /api/units`
- `GET /api/onboarding/channels`
- products counts / search / model autocomplete / categories counts / units scopes / onboarding channel eligibility ยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `products-onboarding.read.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-products-units-onboarding-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-units-onboarding-read-rollout-execution.md)

## Products/Units/Onboarding Write Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC`, `settings/system-admin`, และ `products/units/onboarding read` นิ่งแล้ว
เพราะ low-risk writes ต้องอ่าน state/store permissions จาก PostgreSQL path รุ่นใหม่ก่อน และต้องไม่เขียนลงอีกฐานในขณะที่ read side ยังไม่พร้อม

### Products/Units/Onboarding Write Preflight

```bash
npm run smoke:postgres:products-units-onboarding-write-gate
npm run lint
npm run build
```

### Products/Units/Onboarding Write Wave 0: Keep Off

```env
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=0
```

### Products/Units/Onboarding Write Wave 1: Canary Enable

เปิด:

```env
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=1
```

ตรวจ:
- `/settings/units` create/update/delete
- `/settings/categories` create/update/delete
- `POST /api/onboarding/channels` สำหรับ `FACEBOOK` และ `WHATSAPP`
- refresh reads หลังเขียนแล้วยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `products-onboarding.write.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-products-units-onboarding-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-units-onboarding-write-rollout-execution.md)

## Products Write Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC`, `settings/system-admin`, `products/units/onboarding read`, และ `products/units/onboarding low-risk write` นิ่งแล้ว
เพราะ product CRUD + variant persistence ต้องพึ่ง read-after-write parity ของ model/search/category/unit helpers และถ้า write path นี้เปิดก่อน read side จะเสี่ยง stale หรือ false negative ตอน canary

### Products Write Preflight

```bash
npm run smoke:postgres:products-write-gate
npm run lint
npm run build
```

### Products Write Wave 0: Keep Off

```env
POSTGRES_PRODUCTS_WRITE_ENABLED=0
```

### Products Write Wave 1: Canary Enable

เปิด:

```env
POSTGRES_PRODUCTS_WRITE_ENABLED=1
```

ตรวจ:
- `/products` create/update product
- `GET /api/products/models`
- `GET /api/products/search`
- `set_active`
- `update_cost`
- image update/remove
- variant persistence หลัง create/update ยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `products.write.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-products-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-write-rollout-execution.md)

## Store Settings / Payment Accounts Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC`, `settings/system-admin read`, และ `settings/system-admin write` นิ่งแล้ว
เพราะหน้า `/settings/store` กับ `/settings/store/payments` พึ่ง session, permission, policy, store membership และ policy summaries จากก้อนก่อนหน้าโดยตรง

### Store Settings Preflight

```bash
npm run smoke:postgres:store-settings-gate
```

### Store Settings Wave 0: Keep Off

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=0
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

### Store Settings Wave 1: Read Canary

เปิด:

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

ตรวจ:
- `/settings/store`
- `/settings/store/payments`
- `GET /api/settings/store`
- `GET /api/settings/store/pdf`
- `GET /api/settings/store/payment-accounts`
- `GET /api/orders/payment-accounts/[accountId]/qr-image`
- `/settings/superadmin/global-config`
- ไม่มี fallback warning ต่อเนื่องจาก `store-settings.read.pg`

### Store Settings Wave 2: Store Profile / JSON / PDF Write

เปิด:

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

ตรวจ:
- multipart/logo upload
- store JSON update
- PDF config update
- read-after-write ของ `/settings/store` และ `/settings/pdf`
- summaries ที่ `/settings/superadmin/global-config` และ `/system-admin/config/system`
- ไม่มี fallback warning ต่อเนื่องจาก `store-settings.write.pg`

### Store Settings Wave 3: Payment Accounts Write

เปิด:

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=1
```

ตรวจ:
- payment accounts create/update/delete
- default account behavior
- QR image metadata lookup หลัง write
- ไม่มี fallback warning ต่อเนื่องจาก `store-settings.write.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-store-settings-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-store-settings-rollout-execution.md)

## Notifications Rollout

ก้อนนี้ควรเปิดหลัง `auth/RBAC` และ `reports read` นิ่งแล้ว
เพราะหน้า `/settings/notifications` พึ่ง permission/session จากก้อนแรก และ cron AP reminders พึ่ง source data จาก `purchase-ap/reporting` helper ของก้อนหลังโดยตรง

### Notifications Preflight

```bash
npm run smoke:postgres:notifications-gate
```

### Notifications Wave 0: Keep Off

```env
POSTGRES_NOTIFICATIONS_ENABLED=0
```

### Notifications Wave 1: Canary Enable

เปิด:

```env
POSTGRES_NOTIFICATIONS_ENABLED=1
```

ตรวจ:
- `/settings/notifications`
- `GET/PATCH /api/settings/notifications/inbox`
- `PATCH /api/settings/notifications/rules`
- `GET /api/internal/cron/ap-reminders`
- `/stock/purchase-orders/ap-by-supplier`
- inbox summary / item actions / mute-snooze rules / cron sync ยังตรง
- ไม่มี fallback warning ต่อเนื่องจาก `notifications.pg`

ดู checklist ปฏิบัติจริงแบบละเอียดที่ [docs/postgres-notifications-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-notifications-rollout-execution.md)

## Flag Waves

### Wave 0: Baseline Read

เปิดไว้ก่อนแล้ว:

```env
POSTGRES_ORDERS_READ_ENABLED=1
POSTGRES_INVENTORY_READ_ENABLED=0
```

เงื่อนไข:

- `orders list/detail` parity ต้องผ่าน
- `inventory` parity ต้องผ่าน
- PostgreSQL orders read ใช้งานจริงได้โดยไม่ทำให้ UI ต่างจาก Turso

### Wave 1: Low-Risk Writes

เปิด:

```env
POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1
POSTGRES_ORDERS_WRITE_UPDATE_SHIPPING_ENABLED=1
POSTGRES_ORDERS_WRITE_SUBMIT_PAYMENT_SLIP_ENABLED=1
```

ตรวจ:

- สร้างออเดอร์ `Walk-in ค้างจ่าย` แล้วเห็น `RESERVE` movement ถูกต้อง
- สร้างออเดอร์ `Walk-in จ่ายทันที` แล้วเห็น `OUT` movement ถูกต้อง
- แก้ tracking / provider แล้วหน้า detail refresh ได้ตรง
- บันทึกข้อมูลสลิปไม่กระทบ stock state
- ไม่มี fallback warning ซ้ำใน server logs

### Wave 2: Fulfillment Status Writes

เปิด:

```env
POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=1
```

ตรวจ:

- online prepaid flow: `PAID -> PACKED -> SHIPPED`
- online COD flow: `PENDING_PAYMENT/COD_PENDING_SETTLEMENT -> PACKED -> SHIPPED`
- audit event `order.mark_packed` และ `order.mark_shipped` ถูกเขียนครบ

### Wave 3: Return / Cancel / Pickup Writes

เปิด:

```env
POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=1
POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=1
POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=1
```

ตรวจ:

- pickup unpaid flow เปลี่ยนเป็น `PICKED_UP_PENDING_PAYMENT` ได้
- cancel flow สร้าง `RELEASE` หรือ `RETURN` movement ตรงกับสถานะจริง
- COD returned อัปเดต `status`, `paymentStatus`, `codReturnedAt` และ movement ได้ครบ

### Wave 4: High-Risk Payment Writes

เปิด:

```env
POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=1
POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=1
```

ตรวจ:

- reserve/out movement ของ order ไม่เพี้ยน
- COD reconcile / pickup / prepaid flow ยังเปลี่ยนสถานะตรงตามเดิม
- order detail, reports, และ stock state ไม่เห็นข้อมูลคนละโลก

## Manual Staging UAT

อย่างน้อยให้ทดสอบออเดอร์จริงบน staging ตามนี้:

1. Online prepaid: `submit_for_payment -> confirm_paid -> mark_packed -> mark_shipped`
2. Online COD: `mark_packed -> mark_shipped -> confirm_paid` หรือ `mark_cod_returned`
3. Pickup unpaid: `mark_picked_up_unpaid -> confirm_paid`
4. Create `Walk-in ค้างจ่าย` และ `Walk-in จ่ายทันที`
5. Cancel จากออเดอร์ที่ยัง reserve อยู่
6. Cancel จากออเดอร์ที่ out stock ไปแล้ว
7. แก้ shipping/tracking หลังเปิด write flags กลุ่มอื่นแล้ว

## Purchase Rollout

ก้อน purchase ควรเปิดเป็น wave แยกจาก order route เพราะ UI ของ `/stock` อ่าน purchase list/detail โดยตรง และถ้าเปิด read/write ไม่พร้อมกันจะ stale ง่าย

### Purchase Preflight

```bash
npm run db:check:postgres
npm run db:migrate:postgres
npm run db:compare:postgres:purchase-read
npm run smoke:postgres:purchase-suite
```

### Purchase Wave 0: Keep Off

ค่าเริ่มต้นที่แนะนำก่อน rollout:

```env
POSTGRES_PURCHASE_READ_ENABLED=0
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=0
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0
```

### Purchase Wave 1: Read + Create Receive

เปิดพร้อมกัน:

```env
POSTGRES_PURCHASE_READ_ENABLED=1
POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=1
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0
```

ตรวจ:

- หน้า `/stock?tab=purchase` โหลด list จาก PostgreSQL ได้ตรงกับ Turso เดิม
- สร้าง PO แบบ `receiveImmediately=true` แล้ว refresh list/detail เห็นข้อมูลทันที
- print page ของ PO ที่เพิ่งสร้างใหม่เปิดได้
- ไม่มี fallback warning ซ้ำใน server logs ของ purchase routes

### Purchase Wave 2: Receive Existing PO

เปิดเพิ่ม:

```env
POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=1
```

ตรวจ:

- เปลี่ยน PO จาก `ORDERED` หรือ `SHIPPED` เป็น `RECEIVED` ได้
- `receivedItems`, landed cost, และ weighted average cost ถูกคำนวณตรง
- หน้า pending-rate queue ยังตรง
- รัน `npm run db:compare:postgres:inventory` หลังทำ canary flow แล้ว parity ยังผ่าน

### Purchase Rollback Rules

ถ้าเจอ fallback warning, หน้า `/stock` stale, หรือ inventory/cost ไม่ตรง:

1. ปิดเฉพาะ purchase flags กลับเป็น `0`
2. rerun:

```bash
npm run db:compare:postgres:purchase-read
npm run db:compare:postgres:inventory
npm run smoke:postgres:purchase-suite
```

3. ตรวจ PO ที่เพี้ยนทั้งใน `purchase_orders`, `purchase_order_items`, `inventory_movements`, และ `audit_events`

## Rollback Rules

ถ้าเจอ fallback warning, state เพี้ยน, หรือ stock movement ไม่ตรง:

1. ปิดเฉพาะ flag wave ล่าสุดกลับเป็น `0`
2. คง `POSTGRES_ORDERS_READ_ENABLED=1` ไว้ได้ ถ้า read parity ยังปกติ
3. อย่าเปิด `POSTGRES_INVENTORY_READ_ENABLED=1` เพื่อแก้ปัญหาเฉพาะหน้า
4. rerun:

```bash
npm run db:compare:postgres:orders-read
npm run db:compare:postgres:inventory
npm run smoke:postgres:orders-write-suite
```

5. ตรวจ order/audit/inventory movement ของเคสที่เพี้ยนก่อนเปิดกลับ

## Criteria ก่อนเปิด Inventory Reads

เปิด `POSTGRES_INVENTORY_READ_ENABLED=1` ได้ต่อเมื่อครบทุกข้อ:

- order lifecycle write flags บน staging ผ่านครบทุก wave
- purchase read flag และ PO receive write flags ผ่านครบทุก wave
- ไม่มี fallback warning ต่อเนื่องจาก order write paths
- ไม่มี fallback warning ต่อเนื่องจาก purchase read/write paths
- movement producers นอก order route ถูกย้ายหรือ dual-write แล้ว เช่น stock/purchase flows
- compare inventory parity ยังผ่านหลังมี traffic จริง

## Inventory Read Rollout

ก้อนนี้เป็น cutover ระดับ read truth ของ stock state ดังนั้นไม่ควรเปิดจาก parity baseline อย่างเดียว ต้องมี gate รวมของ order + purchase + inventory พร้อมกัน

### Inventory Read Preflight

```bash
npm run smoke:postgres:inventory-read-gate
```

หมายเหตุ:
- `npm run smoke:postgres:inventory-read-gate` ตอนนี้เป็น preflight chain ของ inventory read rollout แล้ว โดยรวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, `db:compare:postgres:orders-read`, `db:compare:postgres:purchase-read`, `db:compare:postgres:inventory`, `smoke:postgres:orders-write-suite`, `smoke:postgres:purchase-suite`, `lint`, และ `build`

### Inventory Read Wave 0: Keep Off

```env
POSTGRES_INVENTORY_READ_ENABLED=0
```

### Inventory Read Wave 1: Canary Enable

เปิด:

```env
POSTGRES_INVENTORY_READ_ENABLED=1
```

ตรวจ:

- หน้า `/stock` inventory list แสดง `on hand / reserved / available` ตรงกับค่าที่คาด
- หน้า `/orders/[orderId]` ยังตีความ stock state ถูกทั้งเคส reserve, out, release, return
- purchase receive flow หลังเปิด flag แล้วยังทำให้ stock สะท้อนทันทีในหน้า `/stock`
- ไม่มี fallback warning ต่อเนื่องจาก `inventory.read.pg`

### Inventory Read Manual UAT

อย่างน้อยให้ทดสอบเคสจริงบน staging ดังนี้:

1. สร้าง `Walk-in ค้างจ่าย` แล้วดู stock ว่า `reserved` เพิ่ม
2. สร้าง `Walk-in จ่ายทันที` แล้วดู stock ว่า `on hand` ลด
3. ทำ `submit_for_payment -> confirm_paid` และเช็ก order stock state ในหน้า detail
4. ทำ `cancel` ทั้งเคสที่ยัง reserve และเคสที่ out ไปแล้ว
5. สร้าง PO แบบ `receiveImmediately=true` แล้วเช็ก stock เพิ่มในหน้า `/stock`
6. รับ PO จาก `ORDERED/SHIPPED -> RECEIVED` แล้วเช็ก stock/cost

### Inventory Read Rollback Rules

ถ้าเจอ stock state เพี้ยน, parity fail, หรือ fallback warning ต่อเนื่อง:

1. ปิด `POSTGRES_INVENTORY_READ_ENABLED=0`
2. rerun:

```bash
npm run db:compare:postgres:inventory
npm run smoke:postgres:inventory-read-gate
```

3. ตรวจ movement ของเคสล่าสุดใน `inventory_movements` เทียบกับ order/purchase refs ก่อนเปิดกลับ

## Reports Read Rollout

ก้อนนี้ควรเปิดหลัง inventory read rollout ผ่านแล้วเท่านั้น เพราะ `/reports`, AP summary/statement, และ CSV export พึ่ง order/purchase/inventory aggregates ร่วมกัน

### Reports Read Preflight

```bash
npm run smoke:postgres:reports-read-gate
```

คำสั่งนี้จะรันทั้ง cutover preconditions และ parity ของ reports/AP เพื่อหยุด rollout ทันทีถ้าฐานข้อมูลสองฝั่งเริ่มไม่ตรงกัน

### Reports Read Wave 0: Keep Off

```env
POSTGRES_REPORTS_READ_ENABLED=0
```

### Reports Read Wave 1: Canary Enable

เปิด:

```env
POSTGRES_REPORTS_READ_ENABLED=1
```

ตรวจ:

- หน้า `/reports` แสดงตัวเลข `ยอดขายวันนี้/เดือนนี้`, `กำไรขั้นต้น`, `COD`, `FX`, และ `AP Aging` ตรงกับ baseline
- `GET /api/stock/purchase-orders/outstanding/export-csv` ส่งออกยอด `outstanding/fx` ตรงกับที่หน้า `/reports` แสดง
- `GET /api/stock/purchase-orders/ap-by-supplier/statement` และ summary ที่หน้า stock ยังไม่เพี้ยน
- ไม่มี fallback warning ต่อเนื่องจาก `reports.read.pg`

### Reports Read Manual UAT

อย่างน้อยให้ทดสอบบน staging ดังนี้:

1. เปิด `/reports` แล้ว snapshot ตัวเลขหลักเทียบก่อน/หลังเปิด flag
2. export CSV เจ้าหนี้ค้างจ่าย แล้วเช็ก supplier totals กับหน้า `/reports`
3. เปิด AP statement ของ supplier ที่มี PO ค้างหลายใบและเช็ก due bucket / outstanding
4. ทำ canary flow หลังมี traffic จริง:
   - สร้าง order ที่ส่งผลต่อยอดขาย
   - ทำ PO receive / payment ที่เปลี่ยน AP
   - refresh `/reports` และ export อีกครั้ง

### Reports Read Rollback Rules

ถ้าเจอ parity fail, export ตัวเลขไม่ตรง, หรือมี fallback warning ต่อเนื่อง:

1. ปิด `POSTGRES_REPORTS_READ_ENABLED=0`
2. rerun:

```bash
npm run db:compare:postgres:reports-read
npm run smoke:postgres:reports-read-gate
```

3. ตรวจเคสล่าสุดที่กระทบ:
   - `orders`
   - `purchase_orders`
   - `purchase_order_payments`
   - `inventory_movements`

## Recommendation ถัดไป

หลังจบ phase นี้ ควรทำ `reports canary rollout จริงบน staging`:

- เปิด `POSTGRES_REPORTS_READ_ENABLED=1` ตาม wave ด้านบน
- observe `/reports`, AP summary/statement, และ CSV export ภายใต้ traffic จริง
- ถ้าไม่มี `reports.read.pg` fallback warnings และตัวเลขนิ่ง ค่อยขยับไป phase ลดบทบาท Turso ฝั่ง inventory/reporting

หลังจาก observe ผ่านแล้ว จึงค่อยทำแผน `decommission fallback/read paths` ของ reports และเริ่มลดการพึ่ง Turso ในโดเมน inventory/reporting ต่อ
