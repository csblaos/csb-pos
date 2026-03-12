# Handoff

## Snapshot Date

- March 11, 2026

## Changed (ล่าสุด)

- phase `settings/superadmin + settings pages caller reduction` ล่าสุด
  - เปลี่ยนหน้า read-heavy ให้ใช้ PostgreSQL query-first แล้วใน:
    - [app/(app)/settings/pdf/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/pdf/page.tsx)
    - [app/(app)/settings/profile/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/profile/page.tsx)
    - [app/(app)/settings/security/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/security/page.tsx)
    - [app/(app)/settings/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/stock/page.tsx)
    - [app/(app)/settings/store/shipping-providers/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/shipping-providers/page.tsx)
    - [app/(app)/settings/roles/[roleId]/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/roles/[roleId]/page.tsx)
    - [app/(app)/settings/superadmin/stores/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/stores/page.tsx)
    - [app/(system-admin)/system-admin/config/stores-users/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(system-admin)/system-admin/config/stores-users/page.tsx)
  - เก็บ helper ให้ไม่ fallback ไป Turso แล้วใน:
    - [lib/rbac/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/queries.ts)
    - [lib/superadmin/global-config.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/global-config.ts)
    - [lib/superadmin/overview.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/overview.ts)
    - [lib/superadmin/home-dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/home-dashboard.ts)
  - จากนั้นเก็บ 5 หน้าสุดท้ายในก้อนนี้ต่อจนไม่เหลือ `getTursoDb` แล้ว:
    - [app/(app)/settings/audit-log/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/audit-log/page.tsx)
    - [app/(app)/settings/superadmin/audit-log/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/audit-log/page.tsx)
    - [app/(app)/settings/superadmin/integrations/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/integrations/page.tsx)
    - [app/(app)/settings/superadmin/quotas/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/quotas/page.tsx)
    - [app/(app)/settings/superadmin/security/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/security/page.tsx)
  - runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ล่าสุดลดเหลือ `39` ไฟล์
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - phase ถัดไปที่ควรตามคือ `purchase.service / purchase.repo` แล้วค่อย `audit.service / idempotency.service / order-shipment`

- phase `orders/store low-risk caller reduction` ล่าสุด
  - [app/api/orders/payment-accounts/[accountId]/qr-image/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/payment-accounts/[accountId]/qr-image/route.ts) ใช้ PostgreSQL helper ตรงแล้ว ไม่ fallback ไป Turso
  - [app/api/orders/[orderId]/shipments/upload-label/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/shipments/upload-label/route.ts) เปลี่ยน lookup `orders` ไป PostgreSQL query-first แล้ว
  - [lib/stores/financial.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/stores/financial.ts) ใช้ PostgreSQL store financial config ตรงแล้ว
  - runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `74` เหลือ `71` ไฟล์
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - phase ถัดไปที่ควรตามคือ `purchase write repo/service reduction` หรือถ้าจะเอา low-risk ก่อนให้เก็บ `settings/system-admin/store` callers ที่เหลือ

- phase `stock repo caller reduction` ล่าสุด
  - [server/repositories/stock.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/stock.repo.ts) เปลี่ยน `findStockMutationProduct`, `findUnitMultiplierToBase`, `createInventoryMovementRecord`, และ `getStockBalanceByProduct` ไปใช้ PostgreSQL query-first แล้ว
  - `stock.repo` ไม่ import [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) แล้ว
  - runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `75` เหลือ `74` ไฟล์
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - phase ถัดไปที่ควรตามคือ `purchase write repo/service reduction`

- phase `inventory/purchase caller reduction` ล่าสุด
  - [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts) เปลี่ยน `getStoreStockThresholds`, `getStockProductsForStore`, `getStockProductsForStorePage`, `getRecentInventoryMovements`, และ `getInventoryMovementsPage` ไป PostgreSQL แล้ว
  - [app/api/stock/purchase-orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/route.ts), [app/api/stock/purchase-orders/[poId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/route.ts), [app/api/stock/purchase-orders/pending-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/pending-rate/route.ts), [app/api/stock/purchase-orders/[poId]/settle/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/settle/route.ts), และ [app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts) ไม่อ่าน `stores.currency` ผ่าน Turso แล้ว แต่ใช้ PostgreSQL helper แทน
  - [app/(app)/stock/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/page.tsx) และ [app/(app)/stock/purchase-orders/[poId]/print/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/stock/purchase-orders/[poId]/print/page.tsx) เปลี่ยนมาใช้ helper จาก [lib/platform/postgres-store-settings.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings.ts) แทน Turso แล้ว
  - runtime callers ของ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `83` เหลือ `75` ไฟล์
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - phase ถัดไปที่ควรตามคือ `purchase service/repo + stock repo caller reduction`

- phase `runtime Turso cleanup` ล่าสุด
  - เปลี่ยน service/repository/route/page ที่ยัง top-level import `@/lib/db/client` ให้ใช้ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) แล้วในก้อน `audit`, `idempotency`, `purchase repo/service`, `order-shipment repo/service`, `stock pages`, `onboarding store`, `cod-reconcile`, `shipping label upload`, `generate-barcode`, และ purchase sub-routes
  - จากนั้นเก็บ `orders route + lib/orders + lib/inventory` ต่อใน wave เดียว และปิดท้ายด้วยการย้าย [server/repositories/stock.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/stock.repo.ts), [server/repositories/dashboard.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/dashboard.repo.ts), และ [server/repositories/onboarding-channels.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/onboarding-channels.repo.ts) ไป `turso-lazy`
  - ลบ [server/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/db/client.ts) แล้ว และปรับ [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) ให้ไม่ยิง health probe ตอน import
  - top-level imports ของ `@/lib/db/client` ใน runtime ลดจาก `22` เหลือ `0` ไฟล์
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - phase ถัดไปที่ควรตามคือ `dead Turso path removal` ที่ก้อน fallback/lazy legacy paths และ `TURSO_*` env/tooling cleanup

- phase `dead lazy Turso path cleanup` ล่าสุด
  - เปลี่ยน runtime paths ฝั่ง `platform/auth/settings` ให้ใช้ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) กลางแทน inline `import("@/lib/db/client")` แล้วใน `system-config`, `auth.system-admin`, `auth.store-creation`, `superadmin global-config/overview/home-dashboard`, `rbac access/catalog/queries`, `app shell`, `auth routes`, และ `onboarding channels route`
  - จากนั้นเก็บ `session + system-admin` และ `products/units` ต่อจนครบ ทำให้ remaining lazy Turso paths จาก `rg` เหลือ `1` จุด
  - แต่จุดนี้หมายถึงเหลือ direct entrypoint เดียวเท่านั้น; runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ยังมี `87` ไฟล์
  - อัปเดต [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) แล้วให้ `TURSO_*` อยู่ใน section `Legacy Turso / LibSQL` สำหรับ compare/backfill/repair scripts เท่านั้น
  - phase ถัดไปที่ควรตามคือ `turso-lazy caller reduction + TURSO_* tooling separation`

- phase `orders turso-lazy caller reduction` ล่าสุด
  - [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts) เปลี่ยน `POST /api/orders` ให้ใช้ PostgreSQL write path ตรงแล้ว ไม่เปิด Turso runtime ใน route นี้อีก
  - จากนั้นเก็บ [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts) และ [app/api/orders/cod-reconcile/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/cod-reconcile/route.ts) ให้ใช้ PostgreSQL ล้วนแล้ว
  - helper ใน [lib/orders/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/queries.ts) ที่เป็น `generateOrderNo`, `getOrderItemsForOrder`, `listPendingCodReconcile`, `listPendingCodReconcileProviders`, และ `getOrderCatalogForStore` เปลี่ยนเป็น PostgreSQL แล้ว
  - runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `87` เหลือ `83` ไฟล์
  - `npm run lint` และ `npm run build` ผ่าน
  - phase ถัดไปที่ควรตามคือ `inventory/purchase/stores caller reduction`

- เริ่ม `write fallback removal wave 3` ที่ `orders write`
  - [app/api/orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/route.ts) ไม่ fallback กลับ Turso แล้วเมื่อเข้า PostgreSQL branch ของ `POST /api/orders`
  - [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts) ไม่ fallback กลับ Turso แล้วเมื่อเข้า PostgreSQL branches ของ `update_shipping`, `submit_for_payment`, `submit_payment_slip`, `confirm_paid`, `mark_picked_up_unpaid`, `mark_packed`, `mark_shipped`, `mark_cod_returned`, และ `cancel`
  - `npm run smoke:postgres:orders-write-suite` ผ่านหลังเปลี่ยน และครอบ parity + smoke ของทุก action + `lint` + `build`
  - phase ถัดไปที่ควรตามคือ `runtime Turso cleanup / remaining platform fallbacks`

- เริ่ม `write fallback removal wave 2` ที่ `purchase write`
  - [app/api/stock/purchase-orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/route.ts) ไม่ fallback กลับ Turso แล้วเมื่อเข้า PostgreSQL branch ของ `receiveImmediately=true`
  - [app/api/stock/purchase-orders/[poId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/route.ts) ไม่ fallback กลับ Turso แล้วเมื่อเข้า PostgreSQL branch ของ transition `status=RECEIVED`
  - purchase write runtime ตอนนี้ยังคงใช้ feature flag เดิม แต่เมื่อเข้า PG branch แล้วจะ fail ตรง แทนการไหลกลับ Turso
  - `npm run smoke:postgres:po-create-received` และ `npm run smoke:postgres:po-status-received` ผ่านหลังเปลี่ยน (ทั้งคู่ `ok (transaction rolled back)`) และ `npm run lint` / `npm run build` ผ่าน
  - wave ถัดไปที่ควรตามคือ `orders write`

- เริ่ม `write fallback removal wave 1` ที่ `stock movement`
  - [server/services/stock.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/stock.service.ts) ไม่ fallback กลับ Turso transaction path แล้วใน `postStockMovement()`
  - manual stock movement runtime ตอนนี้บังคับใช้ PostgreSQL write path โดยตรง; ถ้า PostgreSQL path ไม่พร้อมจะ fail ตรงแทนการไหลกลับ Turso
  - `npm run smoke:postgres:stock-movement` ผ่านหลังเปลี่ยน (`[pg:smoke:stock_movement] ok (transaction rolled back)`) และ `npm run lint` / `npm run build` ผ่าน
  - wave ถัดไปที่ควรตามคือ `purchase write -> orders write`

- เริ่ม `fallback removal wave 4` ที่ `orders read`
  - ตัด Turso fallback/runtime branch ออกจาก [lib/orders/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/queries.ts) แล้ว สำหรับ `listOrdersByTab`, `getOrderDetail`, และ `getActiveQrPaymentAccountsForStore`
  - orders read path ชุดนี้บังคับใช้ PostgreSQL query path โดยตรงใน runtime แล้ว และลบ dead code ของ legacy/Turso read fallback ออก
  - top-level imports ของ `@/lib/db/client` ใน runtime ยังอยู่ที่ `22` ไฟล์ เพราะ `lib/orders/queries.ts` ยังมี Drizzle-backed catalog/generator paths อื่นที่ยังไม่ถูกย้าย
  - `npm run db:compare:postgres:orders-read` ผ่านหลังเปลี่ยน (`parity ok stores=1 orderDetails=72`) และ `npm run lint` / `npm run build` ผ่าน
  - wave ถัดไปที่ควรตามคือ `write fallbacks`

- เริ่ม `fallback removal wave 3` ที่ `inventory read`
  - ตัด Turso fallback/runtime branch ออกจาก [lib/inventory/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/queries.ts) แล้ว สำหรับ `getInventoryBalancesByStore`, `getInventoryBalancesByStoreForProducts`, `getInventoryBalanceForProduct`, และ `getOrderStockStateForOrder`
  - inventory read path ชุดนี้บังคับใช้ PostgreSQL query path โดยตรงใน runtime แล้ว และลบ dead code ของ Turso balance fallback ออก
  - top-level imports ของ `@/lib/db/client` ใน runtime ยังอยู่ที่ `22` ไฟล์ เพราะ `lib/inventory/queries.ts` ยังมี Drizzle read paths อื่นที่ยังไม่ถูกย้าย
  - `npm run db:compare:postgres:inventory` ผ่านหลังเปลี่ยน (`parity ok stores=6 orders=72`) และ `npm run lint` / `npm run build` ผ่าน
  - wave ถัดไปที่ควรตามคือ `orders read -> write fallbacks`

- เริ่ม `fallback removal wave 2` ที่ `purchase read`
  - ตัด Turso fallback/runtime branch ออกจาก [lib/purchases/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/purchases/queries.ts) แล้ว และบังคับใช้ PostgreSQL query path โดยตรงใน runtime
  - [server/services/purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts) ไม่ fallback กลับ purchase repository read path เดิมแล้วใน `getPurchaseOrderList`, `getPurchaseOrderListPage`, `getPendingExchangeRateQueue`, และ `getPurchaseOrderDetail`
  - parity ของ purchase ยังผ่านหลังเปลี่ยน: `npm run db:compare:postgres:purchase-read`
  - wave ถัดไปที่ควรตามคือ `inventory read -> orders read -> write fallbacks`

- เริ่ม `fallback removal wave 1` ที่ `reports read`
  - ตัด Turso fallback/runtime branch ออกจาก [lib/reports/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/reports/queries.ts) แล้ว และบังคับใช้ PostgreSQL query path โดยตรงใน runtime
  - top-level imports ของ `@/lib/db/client` ใน runtime ลดจาก `23` เหลือ `22` ไฟล์
  - parity ของ reports ยังผ่านหลังเปลี่ยน: `npm run db:compare:postgres:reports-read`
  - wave ถัดไปที่ควรตามคือ `purchase read -> inventory read -> orders read -> write fallbacks`

- สลับ dev machine นี้เป็น `PostgreSQL-first hard switch`
  - เปิด PostgreSQL runtime flags ทั้งชุดใน [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local) แล้ว ครอบ `auth/rbac`, `settings/system-admin`, `branches`, `store settings/payment accounts`, `notifications`, `products`, `purchase`, `inventory`, `reports`, `stock movement`, และ `orders write` ทุก action
  - คง `TURSO_*` env ไว้ชั่วคราวเพื่อ compare scripts / legacy fallback / audit ระหว่างช่วงเก็บ `zero-fallback` ใน dev
  - เป้าหมายของเครื่องนี้เปลี่ยนจาก dual-path canary เป็นใช้ PostgreSQL เป็น runtime หลัก แล้วค่อยถอด fallback/Turso paths ต่อเป็น wave

- อัปเดต `all-postgres runtime observe + fallback removal support`
  - เพิ่ม [scripts/smoke-postgres-all-postgres-observe-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-all-postgres-observe-gate.mjs) และคำสั่ง `npm run smoke:postgres:all-postgres-observe-gate`
  - อัปเดต [docs/postgres-all-postgres-observe-fallback-removal.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-all-postgres-observe-fallback-removal.md) ให้ใช้ gate ใหม่นี้เป็น Observe Preflight หลักก่อนเริ่ม zero-fallback window และก่อนถอด fallback แต่ละ wave
  - เพิ่มหมายเหตุใน [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) และ [docs/postgres-full-cutover-checklist.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-full-cutover-checklist.md) ว่า gate นี้เป็น operational checkpoint กลางของ phase observe/fallback removal
  - รันจริงแล้ว: `npm run smoke:postgres:all-postgres-observe-gate` ผ่าน

- อัปเดต `stock movement staging canary support`
  - เพิ่ม [scripts/smoke-postgres-stock-movement-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-stock-movement-gate.mjs) และคำสั่ง `npm run smoke:postgres:stock-movement-gate`
  - อัปเดต [docs/postgres-stock-movement-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-stock-movement-rollout-execution.md) ให้ใช้ gate ใหม่นี้เป็น preflight หลัก และย้ำ precondition เรื่อง `POSTGRES_AUTH_RBAC_READ_ENABLED=1` กับ `POSTGRES_BRANCHES_ENABLED=1`
  - เพิ่มหมายเหตุใน [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ว่า `smoke:postgres:stock-movement-gate` เป็น preflight chain สำหรับ stock movement rollout แล้ว
  - รันจริงแล้ว: `npm run smoke:postgres:stock-movement-gate` ผ่าน

- อัปเดต `orders write staging canary support`
  - ขยาย [scripts/smoke-postgres-orders-write-suite.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-orders-write-suite.mjs) ให้เป็น preflight chain ที่รวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, order/purchase/inventory/reports parity, order write smokes ทั้งชุด, `lint`, และ `build`
  - อัปเดต [docs/postgres-orders-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-orders-write-rollout-execution.md) ให้ใช้ `npm run smoke:postgres:orders-write-suite` เป็น preflight หลัก และย้ำ precondition เรื่อง `POSTGRES_AUTH_RBAC_READ_ENABLED=1`
  - เพิ่มหมายเหตุใน [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ว่า `smoke:postgres:orders-write-suite` เป็น preflight chain สำหรับ orders write rollout แล้ว
  - รันจริงแล้ว: `npm run smoke:postgres:orders-write-suite` ผ่าน

- อัปเดต `purchase staging canary support`
  - ขยาย [scripts/smoke-postgres-purchase-suite.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-purchase-suite.mjs) ให้เป็น preflight chain ที่รวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, `db:backfill:postgres:purchase-read`, `db:compare:postgres:purchase-read`, purchase smokes, `db:compare:postgres:inventory`, `lint`, และ `build`
  - อัปเดต [docs/postgres-purchase-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-purchase-rollout-execution.md) ให้ตรวจ downstream AP views (`ap-by-supplier`, `statement`, `export-csv`) ก่อนเปิด canary
  - เพิ่มหมายเหตุใน [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ว่า `smoke:postgres:purchase-suite` เป็น preflight chain สำหรับ purchase rollout แล้ว
  - รันจริงแล้ว: `npm run smoke:postgres:purchase-suite` ผ่าน

- อัปเดต `inventory read staging canary support`
  - ขยาย [scripts/smoke-postgres-inventory-read-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-inventory-read-gate.mjs) ให้เป็น preflight chain ที่รวม `db:check:postgres`, `db:migrate:postgres`, `db:compare:postgres:auth-rbac-read`, order/purchase/inventory parity, `smoke:postgres:orders-write-suite`, `smoke:postgres:purchase-suite`, `lint`, และ `build`
  - อัปเดต [docs/postgres-inventory-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-inventory-read-rollout-execution.md) ให้ใช้ `smoke:postgres:inventory-read-gate` เป็น preflight หลัก และย้ำ UAT เรื่อง stock page + app shell/store context
  - เพิ่มหมายเหตุใน [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ว่า `smoke:postgres:inventory-read-gate` เป็น preflight chain สำหรับ inventory read rollout แล้ว
  - รันจริงแล้ว: `npm run smoke:postgres:inventory-read-gate` ผ่าน

- เพิ่ม `settings/system-admin write rollout gate + execution checklist`
  - เพิ่ม script [scripts/smoke-postgres-settings-system-admin-write-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-settings-system-admin-write-gate.mjs) และคำสั่ง `npm run smoke:postgres:settings-system-admin-write-gate`
  - เพิ่ม checklist ปฏิบัติจริงที่ [docs/postgres-settings-system-admin-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-settings-system-admin-write-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี wave สำหรับ `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว
  - รันจริงแล้ว: `npm run smoke:postgres:settings-system-admin-write-gate` ผ่าน

- เพิ่ม `system-admin write foundation`
  - เพิ่ม helper write ใหม่ที่ [lib/platform/postgres-settings-admin-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-settings-admin-write.ts)
  - เพิ่ม env flag `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - เพิ่ม smoke script [scripts/smoke-postgres-settings-system-admin-write.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-settings-system-admin-write.mjs) และคำสั่ง `npm run smoke:postgres:settings-system-admin-write`
  - ต่อ PostgreSQL write path แบบ flag-gated แล้วใน:
    - [app/api/system-admin/superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts)
    - [app/api/system-admin/superadmins/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/[userId]/route.ts)
    - [app/api/system-admin/config/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/users/[userId]/route.ts)
    - [app/api/system-admin/config/stores/[storeId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/stores/[storeId]/route.ts)
    - [app/api/system-admin/config/session-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/session-policy/route.ts)
    - [app/api/system-admin/config/store-logo-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/store-logo-policy/route.ts)
    - [app/api/settings/superadmin/payment-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/superadmin/payment-policy/route.ts)
    - [lib/system-config/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-config/policy.ts)
  - รันจริงแล้ว:
    - `npm run smoke:postgres:settings-system-admin-write` ผ่าน
    - `npm run lint` ผ่าน
    - `npm run build` ผ่าน
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `27` เหลือ `23` ไฟล์

- เพิ่ม `branches rollout gate + execution checklist`
  - เพิ่ม script [scripts/smoke-postgres-branches-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-branches-gate.mjs) และคำสั่ง `npm run smoke:postgres:branches-gate`
  - เพิ่ม checklist ปฏิบัติจริงที่ [docs/postgres-branches-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-branches-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี wave สำหรับ `POSTGRES_BRANCHES_ENABLED`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว
  - อัปเดต gate/runbook ให้เช็ก `db:compare:postgres:settings-system-admin-read` และ downstream pages `/settings/users`, `/system-admin/config/stores-users` ก่อนเปิด canary branches
  - รันจริงแล้ว: `npm run smoke:postgres:branches-gate` ผ่าน

- เพิ่ม `stores/branches + branch policy PostgreSQL foundation`
  - เพิ่ม helper query-first ใหม่ที่ [lib/platform/postgres-branches.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-branches.ts)
  - ใช้ schema เดิมจาก [postgres/migrations/0004_auth_rbac_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0004_auth_rbac_foundation.sql) ต่อได้เลย ไม่ต้องเพิ่ม migration ใหม่
  - เพิ่ม env flag `POSTGRES_BRANCHES_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - เพิ่ม script [scripts/compare-postgres-branches.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-branches.mjs) และคำสั่ง `npm run db:compare:postgres:branches`
  - ต่อ PostgreSQL path แบบ flag-gated แล้วใน:
    - [lib/branches/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts)
    - [lib/branches/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/access.ts)
    - [app/api/stores/branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts)
    - [app/api/stores/branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts)
    - [app/api/settings/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts)
  - รันจริงแล้ว:
    - `npm run db:compare:postgres:branches` ผ่าน (`branch_policy=1`, `user_branch_overrides=9`, `store_branch_overrides=6`, `store_branches=8`, `store_member_branches=0`)
    - `npm run lint` ผ่าน
    - `npm run build` ผ่าน
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `30` เหลือ `27` ไฟล์

- เพิ่ม `notifications rollout gate + execution checklist`
  - เพิ่ม script [scripts/smoke-postgres-notifications-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-notifications-gate.mjs) และคำสั่ง `npm run smoke:postgres:notifications-gate`
  - เพิ่ม checklist ปฏิบัติจริงที่ [docs/postgres-notifications-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-notifications-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี wave สำหรับ `POSTGRES_NOTIFICATIONS_ENABLED`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว
  - อัปเดต gate/runbook ให้เช็ก `db:compare:postgres:purchase-read` และ downstream AP page ก่อนเปิด canary notifications
  - รันจริงแล้ว: `npm run smoke:postgres:notifications-gate` ผ่าน

- เพิ่ม `notifications PostgreSQL foundation`
  - เพิ่ม migration [postgres/migrations/0008_notifications_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0008_notifications_foundation.sql) สำหรับ `notification_inbox` และ `notification_rules`
  - เพิ่ม helper query-first ใหม่ที่ [lib/platform/postgres-notifications.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-notifications.ts)
  - เพิ่ม env flag `POSTGRES_NOTIFICATIONS_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - เพิ่ม scripts:
    - `npm run db:backfill:postgres:notifications`
    - `npm run db:compare:postgres:notifications`
  - ต่อ PostgreSQL path แบบ flag-gated เข้า [server/services/notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts) ครอบ inbox read/actions, rule update, และ cron sync AP reminders
  - รันจริงแล้ว:
    - `npm run db:migrate:postgres` apply `0008_notifications_foundation.sql`
    - `npm run db:backfill:postgres:notifications` ผ่าน (`notification_inbox=0`, `notification_rules=0`)
    - `npm run db:compare:postgres:notifications` ผ่าน (`notification_inbox=0`, `notification_rules=0`)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `31` เหลือ `30` ไฟล์

- เพิ่ม `store profile multipart/logo upload PostgreSQL write foundation`
  - ขยาย helper [lib/platform/postgres-store-settings-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings-write.ts) ให้รองรับ `name/address/phone/logo_name/logo_url`
  - ต่อ PostgreSQL write path แบบ fallback-safe เข้า [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) สำหรับ `PATCH` แบบ `multipart/form-data`
  - side effects ฝั่ง `Cloudflare R2` และ logo policy ยังอยู่ที่ route เดิม แต่ DB update ของ store profile/logo วิ่ง PostgreSQL ได้แล้วเมื่อเปิด `POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1`
  - อัปเดต rollout docs ของ store settings ให้ Wave 2 ครอบ `logo upload` แล้ว
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `32` เหลือ `31` ไฟล์

- เพิ่ม `store settings + payment accounts rollout gate + execution checklist`
  - เพิ่ม script [scripts/smoke-postgres-store-settings-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-store-settings-gate.mjs) และคำสั่ง `npm run smoke:postgres:store-settings-gate`
  - เพิ่ม checklist ปฏิบัติจริงที่ [docs/postgres-store-settings-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-store-settings-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี wave สำหรับ `store settings + payment accounts`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว
  - อัปเดต gate/runbook ให้ผูก dependency กับ `settings/system-admin write` แล้ว เพื่อให้ canary ของ store settings ใช้ preflight chain ล่าสุดจริง
  - รันจริงแล้ว: `npm run smoke:postgres:store-settings-gate` ผ่าน

- เพิ่ม `store settings + payment accounts PostgreSQL write foundation`
  - เพิ่ม helper write ใหม่ที่ [lib/platform/postgres-store-settings-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings-write.ts)
  - เพิ่ม env flags:
    - `POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0`
    - `POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0`
    ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - ต่อ PostgreSQL write path แบบ fallback-safe แล้วใน:
    - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) เฉพาะ `PATCH` แบบ JSON
    - [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
    - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts) สำหรับ `POST/PATCH/DELETE`
  - รอบนี้ยังไม่ย้าย `multipart/logo upload` ของ [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) ไป PostgreSQL write path เพื่อหลีกเลี่ยง side effects ของ R2/policy ใน phase เดียว
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ยังอยู่ที่ `32` ไฟล์ (รอบนี้เป็น write foundation ไม่ได้ลด import count เพิ่ม)

- เพิ่ม `store settings + payment accounts PostgreSQL read foundation`
  - เพิ่ม helper query-first ใหม่ที่ [lib/platform/postgres-store-settings.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings.ts)
  - เพิ่ม env flag `POSTGRES_STORE_SETTINGS_READ_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - เพิ่ม scripts:
    - `npm run db:backfill:postgres:store-settings-read`
    - `npm run db:compare:postgres:store-settings-read`
  - รันกับ Aiven จริงแล้ว:
    - backfill ผ่าน (`stores=6`, `store_payment_accounts=2`)
    - parity compare ผ่าน (`stores=6`, `store_payment_accounts=2`)
  - ต่อ PostgreSQL read path แบบ flag-gated แล้วใน:
    - [lib/stores/financial.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/stores/financial.ts)
    - [app/(app)/settings/store/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/page.tsx)
    - [app/(app)/settings/store/payments/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/payments/page.tsx)
    - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
    - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
    - [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
    - [app/api/orders/payment-accounts/[accountId]/qr-image/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/payment-accounts/[accountId]/qr-image/route.ts)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `34` เหลือ `32` ไฟล์

- เพิ่ม `remaining settings API lazy import pass`
  - เปลี่ยน API routes ที่ยังค้างให้ lazy-load Turso ผ่าน [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) แล้วใน:
    - [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
    - [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
    - [app/api/settings/account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts)
    - [app/api/settings/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts)
    - [app/api/settings/users/candidates/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/candidates/route.ts)
  - หลัง phase นี้ `app/api/settings/**` ไม่เหลือ top-level import ของ `@/lib/db/client` แล้ว
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `39` เหลือ `34` ไฟล์

- เพิ่ม `settings/store + users/roles API lazy import pass`
  - เปลี่ยน API routes ให้ lazy-load Turso ผ่าน [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) แล้วใน:
    - [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
    - [app/api/settings/store/shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts)
    - [app/api/settings/users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts)
    - [app/api/settings/roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts)
    - [app/api/settings/roles/[roleId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/[roleId]/route.ts)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `44` เหลือ `39` ไฟล์

- เพิ่ม `settings/system-admin page-level lazy import pass`
  - เพิ่ม helper [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts)
  - เปลี่ยน server-rendered pages ใน `settings/system-admin` ให้เลิก `import { db } from "@/lib/db/client"` แบบ top-level แล้ว
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `62` เหลือ `44` ไฟล์

- เพิ่ม rollout gate + execution checklist สำหรับ `product CRUD + variant persistence` write slice
  - เพิ่ม script [scripts/smoke-postgres-products-write-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-products-write-gate.mjs) และคำสั่ง `npm run smoke:postgres:products-write-gate`
  - เพิ่ม runbook ปฏิบัติจริงที่ [docs/postgres-products-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-write-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี section `Products Write Rollout`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่ม PostgreSQL foundation สำหรับ `product CRUD + variant persistence`
  - เพิ่ม helper write ใหม่ที่ [lib/platform/postgres-products-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-write.ts)
  - เพิ่ม migration [postgres/migrations/0007_products_variant_write_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0007_products_variant_write_foundation.sql)
  - เพิ่ม scripts:
    - `npm run db:backfill:postgres:product-variants-foundation`
    - `npm run db:compare:postgres:product-variants-foundation`
    - `npm run smoke:postgres:products-write`
  - เพิ่ม env flag `POSTGRES_PRODUCTS_WRITE_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - ต่อ PostgreSQL write path แบบ fallback-safe แล้วใน:
    - [app/api/products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts)
    - [app/api/products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts)
  - scope รอบนี้ครอบ:
    - create product
    - update product data + variant persistence
    - set active
    - update cost + audit
    - product image url update/remove
  - ขยาย PostgreSQL read prep เพิ่มใน:
    - [app/api/products/models/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/models/route.ts)
    - [app/api/products/search/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/search/route.ts)
  - ถอด top-level Turso import ออกจาก:
    - [app/api/products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts)
    - [app/api/products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts)
    - [lib/products/variant-persistence.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/variant-persistence.ts)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `65` เหลือ `62` ไฟล์

- เพิ่ม rollout gate + execution checklist สำหรับ `products/units/onboarding` low-risk write slice
  - เพิ่ม script [scripts/smoke-postgres-products-units-onboarding-write-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-products-units-onboarding-write-gate.mjs) และคำสั่ง `npm run smoke:postgres:products-units-onboarding-write-gate`
  - เพิ่ม runbook ปฏิบัติจริงที่ [docs/postgres-products-units-onboarding-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-units-onboarding-write-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี section `Products/Units/Onboarding Write Rollout`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่ม PostgreSQL low-risk write foundation สำหรับ `products/units/onboarding`
  - เพิ่ม helper write ใหม่ที่ [lib/platform/postgres-products-onboarding-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-onboarding-write.ts)
  - เพิ่ม env flag `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - เพิ่ม smoke script [scripts/smoke-postgres-products-units-onboarding-write.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-products-units-onboarding-write.mjs) และคำสั่ง `npm run smoke:postgres:products-units-onboarding-write`
  - รันกับ Aiven จริงแล้วผ่านแบบ rollback
  - ต่อ PostgreSQL write path แบบ fallback-safe แล้วใน:
    - [app/api/units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts)
    - [app/api/units/[unitId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/[unitId]/route.ts)
    - [app/api/products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts)
    - [server/services/onboarding-channels.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/onboarding-channels.service.ts)
  - scope รอบนี้ครอบ:
    - units create/update/delete
    - product categories create/update/delete
    - onboarding channel connect
  - ยังไม่ครอบ product CRUD หลัก, variant persistence, และ onboarding store create
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `66` เหลือ `65` ไฟล์

- เพิ่ม rollout gate + execution checklist สำหรับ `products/units/onboarding` read slice
  - เพิ่ม script [scripts/smoke-postgres-products-units-onboarding-read-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-products-units-onboarding-read-gate.mjs) และคำสั่ง `npm run smoke:postgres:products-units-onboarding-read-gate`
  - เพิ่ม runbook ปฏิบัติจริงที่ [docs/postgres-products-units-onboarding-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-units-onboarding-read-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี section `Products/Units/Onboarding Read Rollout`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่ม PostgreSQL foundation สำหรับ `products/units/onboarding` read slice
  - เพิ่ม helper query-first ใหม่ที่ [lib/platform/postgres-products-onboarding.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-onboarding.ts)
  - เพิ่ม migration [postgres/migrations/0006_products_units_onboarding_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0006_products_units_onboarding_foundation.sql) ครอบ `product_categories`, `product_models`, และ `product_units`
  - เพิ่ม scripts:
    - `npm run db:backfill:postgres:products-units-onboarding-read`
    - `npm run db:compare:postgres:products-units-onboarding-read`
  - รันกับ Aiven จริงแล้ว:
    - `npm run db:migrate:postgres` apply `0006_products_units_onboarding_foundation.sql`
    - `npm run db:backfill:postgres:products-units-onboarding-read` ผ่าน (`product_categories=3`, `product_models=4`, `product_units=12`)
    - `npm run db:compare:postgres:products-units-onboarding-read` ผ่าน (`stores=6`, `product_categories=3`, `product_models=4`, `product_units=12`)
  - เพิ่ม env flag `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - refactor read path ให้หยุด import Turso ตรงแล้วใน:
    - [app/(app)/products/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/products/page.tsx)
    - [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts)
    - [app/api/products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts)
    - [app/api/units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts)
    - [app/api/onboarding/channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts)
    - [server/repositories/onboarding-channels.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/onboarding-channels.repo.ts)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `71` เหลือ `66` ไฟล์

- เพิ่ม rollout gate + execution checklist สำหรับ `settings/system-admin` read slice
  - เพิ่ม script [scripts/smoke-postgres-settings-system-admin-read-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-settings-system-admin-read-gate.mjs) และคำสั่ง `npm run smoke:postgres:settings-system-admin-read-gate`
  - เพิ่ม runbook ปฏิบัติจริงที่ [docs/postgres-settings-system-admin-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-settings-system-admin-read-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี section `Settings/System-Admin Read Rollout`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่ม PostgreSQL foundation สำหรับ `settings/system-admin` read slice
  - เพิ่ม helper query-first ใหม่ที่ [lib/platform/postgres-settings-admin.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-settings-admin.ts)
  - เพิ่ม migration [postgres/migrations/0005_settings_system_admin_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0005_settings_system_admin_foundation.sql) ครอบ `fb_connections` และ `wa_connections`
  - เพิ่ม scripts:
    - `npm run db:backfill:postgres:settings-system-admin-read`
    - `npm run db:compare:postgres:settings-system-admin-read`
  - รันกับ Aiven จริงแล้ว:
    - `npm run db:migrate:postgres` apply `0005_settings_system_admin_foundation.sql`
    - `npm run db:backfill:postgres:settings-system-admin-read` ผ่าน (`fb_connections=5`, `wa_connections=5`)
    - `npm run db:compare:postgres:settings-system-admin-read` ผ่าน (`superadmins=3`, `policyUsers=4`)
  - เพิ่ม env flag `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - refactor read path ให้หยุด import Turso ตรงในก้อนสำคัญแล้ว:
    - [lib/system-admin/superadmins.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/superadmins.ts)
    - [lib/system-admin/dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/dashboard.ts)
    - [lib/auth/store-creation.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/store-creation.ts)
    - [lib/superadmin/home-dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/home-dashboard.ts)
    - [lib/superadmin/overview.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/overview.ts)
    - [lib/superadmin/global-config.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/superadmin/global-config.ts)
    - [app/(app)/settings/superadmin/overview/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/overview/page.tsx)
    - [app/(app)/settings/superadmin/global-config/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/superadmin/global-config/page.tsx)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `77` เหลือ `71` ไฟล์

- เพิ่ม rollout gate + execution checklist สำหรับ `auth/session + RBAC + app shell`
  - เพิ่ม script [scripts/smoke-postgres-auth-rbac-read-gate.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-postgres-auth-rbac-read-gate.mjs) และคำสั่ง `npm run smoke:postgres:auth-rbac-read-gate`
  - เพิ่ม runbook ปฏิบัติจริงที่ [docs/postgres-auth-rbac-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-auth-rbac-read-rollout-execution.md)
  - ขยาย [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md) ให้มี section `Auth/RBAC Read Rollout`
  - เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่ม PostgreSQL foundation สำหรับ `auth/session + RBAC + app shell`
  - เพิ่ม helper query-first ใหม่ที่ [lib/platform/postgres-auth-rbac.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-auth-rbac.ts)
  - เพิ่ม migration [postgres/migrations/0004_auth_rbac_foundation.sql](/Users/csl-dev/Desktop/alex/csb-pos/postgres/migrations/0004_auth_rbac_foundation.sql)
  - เพิ่ม scripts:
    - `npm run db:backfill:postgres:auth-rbac-read`
    - `npm run db:compare:postgres:auth-rbac-read`
  - รันกับ Aiven จริงแล้ว:
    - `npm run db:migrate:postgres` apply `0004_auth_rbac_foundation.sql`
    - `npm run db:backfill:postgres:auth-rbac-read` ผ่าน
    - `npm run db:compare:postgres:auth-rbac-read` ผ่าน
  - ปริมาณข้อมูลที่ backfill รอบนี้:
    - `system_config=1`
    - `permissions=95`
    - `roles=24`
    - `store_members=11`
    - `store_branches=8`
    - `store_member_branches=0`
    - `role_permissions=894`
  - เพิ่ม env flag `POSTGRES_AUTH_RBAC_READ_ENABLED=0` ใน [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [.env.local](/Users/csl-dev/Desktop/alex/csb-pos/.env.local)
  - route/helper ที่เปลี่ยนให้พึ่ง PostgreSQL path ได้แล้ว และถอด top-level Turso import ออกจาก app shell/auth flow:
    - [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx)
    - [app/api/auth/login/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/login/route.ts)
    - [app/api/auth/signup/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/signup/route.ts)
    - [lib/auth/session.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/session.ts)
    - [lib/auth/session-db.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/session-db.ts)
    - [lib/auth/system-admin.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/system-admin.ts)
    - [lib/system-config/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-config/policy.ts)
    - [lib/rbac/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/access.ts)
    - [lib/rbac/queries.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/queries.ts)
    - [lib/rbac/catalog.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/catalog.ts)
    - [lib/branches/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/access.ts)
  - re-audit import graph แล้ว top-level imports ของ `@/lib/db/client` ใน `app/lib/server` ลดจาก `91` เหลือ `77` ไฟล์

- เพิ่ม runtime dependency audit ใหม่ที่ [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)
  - ใช้ `rg` audit จริงแล้วพบ runtime files ที่ยัง import `@/lib/db/client` อยู่ `91` ไฟล์
  - ยืนยันว่า root cause ของ log `ENOTFOUND ... turso.io` ระหว่าง `next build` ยังมาจาก [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) ที่ init client + ยิง health probe ทันทีเมื่อมี import แรก
  - แยก dependency เป็น 3 bucket:
    - `dual-path / ready-for-removal-queue`: orders, purchase, inventory, reports
    - `still Turso-primary`: auth/session, RBAC, app shell, settings/system-admin, products/units/onboarding
    - `tooling-only`: drizzle config, backfill/compare/seed/repair scripts
  - สรุปว่าก้อนที่ควรย้ายก่อนเพื่อถอน Turso runtime จริงไม่ใช่ fallback ของ orders ก่อน แต่คือ `auth/session + RBAC + app shell`
- เชื่อม audit นี้เข้า [docs/postgres-turso-drizzle-retirement-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-drizzle-retirement-plan.md), [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md), และ [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) แล้ว

- ขยาย phase `RequestContext + audit/idempotency decoupling` ต่อไปยัง flow สำคัญอีกชุด:
  - [app/api/orders/cod-reconcile/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/cod-reconcile/route.ts)
  - [server/services/order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts)
  - [app/api/orders/[orderId]/shipments/label/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/shipments/label/route.ts)
  - [app/api/orders/[orderId]/shipments/upload-label/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/shipments/upload-label/route.ts)
  - purchase sub-routes:
    - [app/api/stock/purchase-orders/[poId]/settle/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/settle/route.ts)
    - [app/api/stock/purchase-orders/[poId]/apply-extra-cost/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/apply-extra-cost/route.ts)
    - [app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/finalize-rate/route.ts)
    - [app/api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse/route.ts)
- route กลุ่มนี้ map `Request -> RequestContext` ที่ต้น route แล้ว และเปลี่ยน idempotency header parsing ไปใช้ `getIdempotencyKeyFromHeaders(...)`
- [app/api/orders/[orderId]/send-qr/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/send-qr/route.ts) กับ [app/api/orders/[orderId]/send-shipping/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/send-shipping/route.ts) ถูกตรวจแล้ว แต่ยังไม่ต้องแก้ใน phase นี้เพราะ route ไม่ได้ส่ง `Request` ลง service/audit/idempotency path

- ขยาย phase `RequestContext + audit/idempotency decoupling` จาก `orders` ไป `stock/purchase` แล้ว:
  - ปรับ [server/services/stock.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/stock.service.ts) และ [server/services/purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts) ให้รับ `requestContext` ใน audit context
  - ปรับ [lib/inventory/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/inventory/postgres-write.ts) และ [lib/purchases/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/purchases/postgres-write.ts) ให้ส่ง `requestContext` ลง audit values ได้
  - route ที่ map `Request -> RequestContext` แล้วมี [app/api/stock/movements/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/movements/route.ts), [app/api/stock/purchase-orders/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/route.ts), [app/api/stock/purchase-orders/[poId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stock/purchase-orders/[poId]/route.ts)
  - `idempotency` ของ route กลุ่มนี้เปลี่ยนไปใช้ `getIdempotencyKeyFromHeaders(...)` แล้ว
- อัปเดต [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) ให้สะท้อนสถานะล่าสุดของ `RequestContext` rollout แล้ว

- เริ่มลงโค้ด phase `RequestContext + audit/idempotency decoupling` แล้ว:
  - เพิ่ม helper [lib/http/request-context.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/http/request-context.ts) สำหรับ map headers/request -> `RequestContext`
  - ปรับ [server/services/audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts) ให้รองรับ `requestContext` โดยยัง backward compatible กับ `request`
  - ปรับ [server/services/idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts) ให้มี `getIdempotencyKeyFromHeaders(...)` เพื่อแยก header parsing ออกจาก core logic
  - pilot ใช้จริงแล้วใน [app/api/orders/[orderId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/[orderId]/route.ts) และ [lib/orders/postgres-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/orders/postgres-write.ts)
- อัปเดต [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) ให้สะท้อนสถานะ Express-readiness ล่าสุดแล้ว

- เพิ่มเอกสาร [docs/express-readiness-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/express-readiness-plan.md) สำหรับเตรียมย้าย API จาก Next.js ไป Express + TypeScript:
  - audit จุดที่ยังผูก `Request` / Next transport อยู่
  - target boundary แบบ `transport adapter -> service -> repository`
  - ลำดับ refactor ที่แนะนำ โดยเริ่มจาก `RequestContext`, `audit`, และ `idempotency`
- เพิ่ม ADR-023 ใน [docs/DECISIONS.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/DECISIONS.md) ว่าควรแยก `RequestContext` ออกจาก service ก่อนย้าย transport จริง
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md), [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md), และเชื่อมจาก [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-turso-drizzle-retirement-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-drizzle-retirement-plan.md) สำหรับ phase ถอน Turso/Drizzle หลังจบ observe/fallback removal:
  - ลำดับถอน runtime dependency -> repositories -> env/ops docs -> migration tooling -> Turso infra
  - validation commands และ rollback rules ของแต่ละ wave
  - ปิดท้ายด้วย next phase ไปสู่ `Express readiness plan`
- เพิ่ม ADR-022 ใน [docs/DECISIONS.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/DECISIONS.md) ว่าการถอน Turso/Drizzle ต้องทำทีละโดเมนหลังผ่านเกณฑ์ `zero fallback`
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md), [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md), และเชื่อมจาก [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-all-postgres-observe-fallback-removal.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-all-postgres-observe-fallback-removal.md) สำหรับ phase หลังเปิด PostgreSQL runtime เกือบครบ:
  - เกณฑ์ `zero fallback`
  - สิ่งที่ต้อง observe ใน logs / parity / business UAT
  - ลำดับถอด fallback ของ `reports -> purchase -> inventory -> orders -> write paths`
  - rollback rules ระหว่างถอด fallback ทีละโดเมน
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-stock-movement-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-stock-movement-rollout-execution.md) สำหรับ stock movement rollout บน staging แบบลงมือทำจริง:
  - preflight commands
  - Wave 1 execution สำหรับ `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1`
  - canary flows ของ manual `IN` / `OUT` / `ADJUST`
  - compare/log review และ rollback rules
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-orders-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-orders-write-rollout-execution.md) สำหรับ orders write rollout บน staging แบบลงมือทำจริง:
  - แยก wave ตามความเสี่ยงของ create / fulfillment / return-cancel-pickup / high-risk payment
  - มี canary steps, compare commands, log review, และ rollback rules ต่อ wave
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-inventory-read-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-inventory-read-rollout-execution.md) สำหรับ inventory read rollout บน staging แบบลงมือทำจริง:
  - preflight
  - canary flows ของ `/stock` และ `/orders/[orderId]`
  - stock/order/purchase UAT matrix
  - rollback rules
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-purchase-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-purchase-rollout-execution.md) สำหรับ rollout purchase runtime บน staging แบบลงมือทำจริง:
  - preflight commands
  - Wave 1 / Wave 2 execution steps
  - UAT matrix
  - log review
  - rollback rules
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่มเอกสาร [docs/postgres-full-cutover-checklist.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-full-cutover-checklist.md) เป็น master checklist สำหรับ:
  - สถานะ runtime ปัจจุบันว่าอะไรเปิด PostgreSQL แล้ว
  - อะไรยังใช้ Turso อยู่จริง
  - ลำดับ rollout จนถึง remove fallback และ retire Turso
- เพิ่มไฟล์นี้เข้า [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md) และ [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md) แล้ว

- เพิ่ม gate script `npm run smoke:postgres:reports-read-gate` ผ่าน `scripts/smoke-postgres-reports-read-gate.mjs` เพื่อใช้เป็น preflight ก่อนเปิด `POSTGRES_REPORTS_READ_ENABLED=1` บน staging
- ขยาย runbook `docs/postgres-staging-rollout.md` ให้มี section `Reports Read Rollout` ครบทั้ง preflight, canary enable, manual UAT, และ rollback rules ของ `/reports`, AP summary/statement, และ CSV export
- ขยาย `docs/postgres-cutover-plan.md` ให้ใช้ `smoke:postgres:reports-read-gate` เป็น pre-cutover command และเพิ่ม UAT ของ report export/AP statement
- รัน `npm run smoke:postgres:reports-read-gate` ผ่านแล้วกับฐานจริง (Aiven + Turso)

- เพิ่ม PostgreSQL read path สำหรับ reports/AP aggregation ใน `lib/reports/queries.ts` ผ่าน flag `POSTGRES_REPORTS_READ_ENABLED`
- เพิ่ม helper `getReportStoreCurrency` แล้วให้ `server/services/reports.service.ts` และ `server/services/purchase-ap.service.ts` ใช้ตัวเดียวกัน เพื่อให้ `/reports`, AP summary/statement และ CSV export ไม่ต้องกลับไปอ่าน `stores.currency` จาก Turso เมื่อเปิด flag
- เพิ่ม script `npm run db:compare:postgres:reports-read` ผ่าน `scripts/compare-postgres-reports-read.mjs` สำหรับเทียบ parity ของ `/reports` overview และ `outstanding PO/AP` ระหว่าง Turso กับ PostgreSQL
- รัน parity-check reports ผ่านแล้ว: `reports overview` และ `outstanding rows` ตรงกัน (`stores=1`)
- `.env.local` ของเครื่องนี้เปิด `POSTGRES_REPORTS_READ_ENABLED=1` แล้ว เพื่อให้ local `/reports`, AP summary/statement และ CSV export ใช้ PostgreSQL read path จริงระหว่างช่วง observe

- วาง foundation สำหรับ migration ไป `Aiven PostgreSQL + Sequelize query-first`:
  - ติดตั้ง dependency `sequelize`, `pg`, `pg-hstore`
  - เพิ่ม `lib/db/sequelize.ts` สำหรับ singleton, pool, SSL config, และ connection probe
  - เพิ่ม `lib/db/query.ts` สำหรับ helper `queryMany/queryOne/execute/queryValue`
  - เพิ่ม `lib/db/transaction.ts` สำหรับ `runInTransaction`
  - เพิ่ม `lib/db/sql.ts` เป็น template helper สำหรับจัดรูป SQL string
  - เพิ่ม script `npm run db:check:postgres` ผ่าน `scripts/check-postgres.mjs`
  - เพิ่ม script `npm run db:migrate:postgres` ผ่าน `scripts/migrate-postgres.mjs`
  - เพิ่ม script `npm run db:backfill:postgres:orders-read` ผ่าน `scripts/backfill-postgres-orders-read.mjs`
  - เพิ่ม script `npm run db:backfill:postgres:inventory-movements` ผ่าน `scripts/backfill-postgres-inventory-movements.mjs`
  - เพิ่ม script `npm run db:compare:postgres:orders-read` ผ่าน `scripts/compare-postgres-orders-read.mjs`
  - เพิ่ม script `npm run db:compare:postgres:inventory` ผ่าน `scripts/compare-postgres-inventory-parity.mjs`
  - เพิ่ม script `npm run smoke:postgres:update-shipping` ผ่าน `scripts/smoke-postgres-update-shipping.mjs`
  - เพิ่ม script `npm run smoke:postgres:cancel` ผ่าน `scripts/smoke-postgres-cancel-order.mjs`
  - เพิ่ม script `npm run smoke:postgres:confirm-paid` ผ่าน `scripts/smoke-postgres-confirm-paid.mjs`
  - เพิ่ม script `npm run smoke:postgres:mark-cod-returned` ผ่าน `scripts/smoke-postgres-mark-cod-returned.mjs`
  - เพิ่ม script `npm run smoke:postgres:mark-packed` ผ่าน `scripts/smoke-postgres-mark-packed.mjs`
  - เพิ่ม script `npm run smoke:postgres:mark-picked-up-unpaid` ผ่าน `scripts/smoke-postgres-mark-picked-up-unpaid.mjs`
  - เพิ่ม script `npm run smoke:postgres:mark-shipped` ผ่าน `scripts/smoke-postgres-mark-shipped.mjs`
  - เพิ่ม script `npm run smoke:postgres:submit-for-payment` ผ่าน `scripts/smoke-postgres-submit-for-payment.mjs`
  - เพิ่ม script `npm run smoke:postgres:submit-payment-slip` ผ่าน `scripts/smoke-postgres-submit-payment-slip.mjs`
  - เพิ่ม `scripts/load-local-env.mjs` เพื่อให้ script PostgreSQL โหลด `.env` / `.env.local` ได้เองโดยไม่ต้อง `source` ใน shell ก่อนรัน
  - เติม placeholder env สำหรับ Aiven PostgreSQL ใน `.env.local` แล้ว โดยยังคง Turso env เดิมไว้ระหว่าง migration
  - ตัด `sslmode=require` ออกจาก `POSTGRES_DATABASE_URL` และ sanitize SSL query params ออกจาก URL ใน runtime/script เพื่อให้ใช้ `POSTGRES_SSL_MODE` + `POSTGRES_SSL_REJECT_UNAUTHORIZED` เป็นแหล่งจริงตัวเดียว
  - เพิ่ม env flag `POSTGRES_ORDERS_READ_ENABLED` (default `0`) สำหรับเปิด vertical slice แรกของ orders read
  - `lib/orders/queries.ts` รองรับ PostgreSQL read path สำหรับ `listOrdersByTab` และ `getOrderDetail` ผ่าน `sequelize.query(...)` แล้ว; ถ้า query ฝั่ง PostgreSQL fail จะ fallback กลับ Turso/Drizzle พร้อม log เตือน
  - เพิ่ม baseline migration `postgres/migrations/0001_orders_read_foundation.sql` สำหรับ schema ชุดแรกที่ orders read ต้องใช้ (`users`, `stores`, `contacts`, `store_payment_accounts`, `units`, `products`, `orders`, `order_items`, `audit_events`)
  - migration runner จะ track ไฟล์ที่ apply แล้วในตาราง `__app_postgres_migrations` และตรวจ checksum กัน drift
  - เพิ่ม backfill script แบบ upsert/re-run safe สำหรับ 9 ตาราง baseline นี้ และสรุปจำนวนแถว source/target หลังรันแต่ละ table
  - รัน backfill baseline เข้า Aiven สำเร็จแล้ว: `users=9`, `stores=6`, `contacts=2`, `store_payment_accounts=2`, `units=7`, `products=16`, `orders=72`, `order_items=81`, `audit_events=157`
  - เพิ่ม parity-check script สำหรับเทียบ `QR accounts`, `orders list` ทุก tab และ `order detail` ทุก order ระหว่าง Turso กับ PostgreSQL ก่อนเปิด flag จริง
  - รัน parity-check ผ่านแล้ว: `QR accounts`, `orders list` ทุก tab และ `order detail` ทั้ง 72 ออเดอร์ของ `store_demo_main` ตรงกันระหว่างสองฐาน
  - เพิ่ม PostgreSQL read path ให้ `getActiveQrPaymentAccountsForStore` แล้ว ทำให้หน้า `/orders/[orderId]` วิ่งผ่าน PostgreSQL ครบทั้ง order + QR accounts เมื่อเปิด flag
  - เปิด `POSTGRES_ORDERS_READ_ENABLED=1` ใน `.env.local` ของเครื่องนี้แล้วเพื่อเริ่มใช้งาน PostgreSQL orders read path จริง
  - เพิ่ม PostgreSQL read helper ใน `lib/inventory/queries.ts` สำหรับ inventory balances และ order stock state เมื่อเปิด `POSTGRES_INVENTORY_READ_ENABLED=1`
  - เพิ่ม backfill script `scripts/backfill-postgres-inventory-movements.mjs` แบบ upsert/re-run safe สำหรับ `inventory_movements`
  - เพิ่ม compare script `scripts/compare-postgres-inventory-parity.mjs` สำหรับเทียบ parity ของ inventory balances ต่อ store และ order stock state ต่อ order
  - คง `POSTGRES_INVENTORY_READ_ENABLED=0` ไว้ก่อนใน `.env.local` เพราะ stock writes หลักของระบบยังไม่ได้ dual-write ไป PostgreSQL ครบทุก flow
  - เพิ่ม PostgreSQL write path สำหรับ `POST /api/stock/movements` ผ่าน `lib/inventory/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:stock-movement`
  - service `postStockMovement` ยังใช้ permission/product/unit conversion/qty validation เดิม แล้วแยกเฉพาะ movement+audit write ไป PostgreSQL เมื่อเปิด `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=1`
  - `.env.local` ของเครื่องนี้ยังคง `POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED=0` ไว้ก่อน ระหว่างรอ rollout บน staging และ phase PO receive
  - เพิ่ม PostgreSQL migration `postgres/migrations/0003_purchase_orders_foundation.sql` สำหรับ `purchase_orders`, `purchase_order_items`, และ `purchase_order_payments`
  - เพิ่ม PostgreSQL read helper `lib/purchases/queries.ts` สำหรับ purchase list, purchase detail, และ pending-rate queue
  - `server/services/purchase.service.ts` รองรับ PostgreSQL read path แล้วสำหรับ `getPurchaseOrderList`, `getPurchaseOrderListPage`, `getPurchaseOrderDetail`, และ `getPendingExchangeRateQueue` เมื่อเปิด `POSTGRES_PURCHASE_READ_ENABLED=1`
  - เพิ่ม script `npm run db:backfill:postgres:purchase-read` และ `npm run db:compare:postgres:purchase-read`
  - เพิ่ม script `npm run smoke:postgres:purchase-suite` สำหรับใช้เป็น pre-rollout gate ของ purchase slice บน staging
  - เพิ่ม script `npm run smoke:postgres:inventory-read-gate` สำหรับใช้เป็น pre-rollout gate ก่อนเปิด `POSTGRES_INVENTORY_READ_ENABLED=1`
  - เพิ่ม script `npm run smoke:postgres:cutover-gate` สำหรับใช้เป็น pre-cutover gate ของ inventory/reporting
  - รัน backfill purchase baseline เข้า Aiven สำเร็จแล้ว: `purchase_orders=9`, `purchase_order_items=9`, `purchase_order_payments=1`
  - รัน parity-check purchase read ผ่านแล้ว: `purchase list`, `purchase detail`, และ `pending exchange-rate queue` ตรงกัน (`stores=1`, `purchaseOrders=9`)
  - เพิ่ม PostgreSQL write path สำหรับ `POST /api/stock/purchase-orders` เฉพาะ branch `receiveImmediately=true` ผ่าน `lib/purchases/postgres-write.ts`
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/stock/purchase-orders/[poId]` เฉพาะ transition ไป `RECEIVED` ผ่าน `lib/purchases/postgres-write.ts`
  - เพิ่ม smoke scripts `npm run smoke:postgres:po-create-received` และ `npm run smoke:postgres:po-status-received`
  - apply migration `0003_purchase_orders_foundation.sql` เข้า Aiven แล้ว และ smoke PO receive ทั้งสองตัวผ่านแบบ rollback
  - `.env.local` ของเครื่องนี้ยังคง `POSTGRES_PURCHASE_READ_ENABLED=0`, `POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED=0`, และ `POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED=0` ไว้ก่อน เพื่อรอเปิด read/write purchase พร้อมกันบน staging และกัน UI stale ระหว่างสองฐาน
  - `docs/postgres-staging-rollout.md` ถูกขยายให้ครอบ purchase rollout แล้ว: มี preflight, wave เปิด flags, UAT, และ rollback rules ของ purchase slice
  - `docs/postgres-staging-rollout.md` ถูกขยายต่อให้ครอบ inventory read rollout แล้ว: มี gate รวมของ orders/purchase/inventory, canary UAT, และ rollback rules ก่อนเปิด `POSTGRES_INVENTORY_READ_ENABLED=1`
  - เพิ่ม `docs/postgres-cutover-plan.md` สำหรับวาง phase cutover ของ inventory/reporting หลัง inventory read rollout ผ่านแล้ว และเพิ่ม ADR-021 ยืนยันว่าไม่ทำ big-bang cutover
  - เพิ่ม PostgreSQL write path สำหรับ `POST /api/orders` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:create-order`
  - route `POST /api/orders` ยังใช้ validation/catalog/stock-check เดิมใน route แต่แยก transaction write ไป PostgreSQL เมื่อเปิด `POSTGRES_ORDERS_WRITE_CREATE_ENABLED=1`
  - เพิ่ม guard เช็ก `orderNo` ซ้ำฝั่ง PostgreSQL เพราะ generator เดิมยังอ้างอิง Turso ระหว่างช่วง migration
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `update_shipping` ผ่าน `lib/orders/postgres-write.ts` และเปิด `POSTGRES_ORDERS_WRITE_UPDATE_SHIPPING_ENABLED=1` ใน `.env.local` ของเครื่องนี้แล้ว
  - ถ้า PostgreSQL write path ของ `update_shipping` fail ระบบจะ fallback กลับ Turso path เดิม; ส่วน idempotency ยัง mark สำเร็จใน Turso หลัง PostgreSQL commit เพื่อเลี่ยงการย้ายหลายตารางพร้อมกันใน phase นี้
  - เพิ่ม PostgreSQL migration `postgres/migrations/0002_inventory_movements_foundation.sql` เพื่อรองรับ stock reserve/out path ของ orders write
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `submit_for_payment` ผ่าน `lib/orders/postgres-write.ts`
  - คง `POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED=0` ไว้ก่อนใน `.env.local` เพราะตอนนี้ stock balance/reserve parity หลักยังอ่านจาก Turso อยู่บางจุด จึงยังไม่ควรเปิด path นี้จริงทันที
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `confirm_paid` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:confirm-paid`
  - คง `POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED=0` ไว้ก่อนใน `.env.local` เพราะ movement producers อื่น เช่น `cancel` และ `mark_picked_up_unpaid` ยังไม่ได้ dual-write ไป PostgreSQL ครบ
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `mark_picked_up_unpaid` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:mark-picked-up-unpaid`
  - คง `POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED=0` ไว้ก่อนใน `.env.local` เพราะ movement producers อื่น เช่น `cancel` ยังไม่ได้ dual-write ไป PostgreSQL ครบ
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `cancel` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:cancel`
  - คง `POSTGRES_ORDERS_WRITE_CANCEL_ENABLED=0` ไว้ก่อนใน `.env.local` เพราะยังมี movement producer ฝั่ง order/inventory อื่น เช่น `mark_cod_returned` ที่ยังไม่ได้ dual-write ไป PostgreSQL ครบ
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `mark_cod_returned` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:mark-cod-returned`
  - คง `POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED=0` ไว้ก่อนใน `.env.local` ระหว่างที่ยังไม่ได้ประเมินเปิดกลุ่ม order write flags บน staging พร้อมกัน
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `mark_packed` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:mark-packed`
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `mark_shipped` ผ่าน `lib/orders/postgres-write.ts` และเพิ่ม smoke script `npm run smoke:postgres:mark-shipped`
  - เพิ่ม smoke suite `npm run smoke:postgres:orders-write-suite` สำหรับรัน order write smokes ทั้งชุดก่อนเปิด flags บน staging
  - เพิ่ม runbook `docs/postgres-staging-rollout.md` สำหรับ preflight, wave rollout, manual UAT, และ rollback rules ของ PostgreSQL staging rollout
  - `.env.local` ของเครื่องนี้ยังคง `POSTGRES_ORDERS_WRITE_CREATE_ENABLED=0` ไว้ก่อน ระหว่างรอ rollout บน staging
  - คง `POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED=0` และ `POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED=0` ไว้ก่อนใน `.env.local` ระหว่างรอแผนเปิดกลุ่ม order write flags บน staging
  - ทำ audit เพิ่มแล้วว่า movement producers ที่ยังค้างบน Turso หลังจบ order-route write migration คือ:
    - `POST /api/stock/purchase-orders` เฉพาะ `receiveImmediately=true`
    - `PATCH /api/stock/purchase-orders/[poId]` เฉพาะ transition ไป `RECEIVED`
  - เพิ่มเอกสาร `docs/postgres-inventory-producers-audit.md` เพื่อใช้เป็น source of truth สำหรับลำดับ migration ถัดไป
  - หลัง purchase read parity ผ่านแล้ว phase ถัดไปคือ rollout purchase flags บน staging (`POSTGRES_PURCHASE_READ_ENABLED` + สอง purchase write flags) แบบเป็น wave ก่อนค่อยประเมินเปิด `POSTGRES_INVENTORY_READ_ENABLED=1`
  - เพิ่ม PostgreSQL write path สำหรับ `PATCH /api/orders/[orderId]` action `submit_payment_slip` ผ่าน `lib/orders/postgres-write.ts` และเปิด `POSTGRES_ORDERS_WRITE_SUBMIT_PAYMENT_SLIP_ENABLED=1` ใน `.env.local` ของเครื่องนี้แล้ว
  - `next.config.ts` เพิ่ม `serverExternalPackages: ["sequelize", "pg", "pg-hstore"]` เพื่อให้ build ฝั่ง server ของ Next ไม่ bundle dependency migration ชุดนี้และลด warning จาก Sequelize
  - เพิ่มเอกสาร `docs/postgresql-sequelize-migration.md`
  - ตัดสินใจเชิงสถาปัตยกรรมใหม่ว่า migration รอบนี้จะใช้ `Sequelize` แบบ query-first (`sequelize.query(...)`) ไม่ใช้ ORM model เป็นแกนของโดเมนหลัก เพื่อให้ย้ายไป `Express + TypeScript` ง่ายในอนาคต

- ปรับ UX action rail ของ online order ในหน้า `/orders/[orderId]`:
  - ปุ่มหลักเหลือเฉพาะ next step เดียวตามสถานะจริง (`ยืนยันชำระแล้ว/ตรวจสลิปและยืนยันชำระ` -> `แพ็กสินค้า` -> `จัดส่งแล้ว` -> `ยืนยันรับเงินปลายทาง (COD)`)
  - เอาปุ่ม `แพ็กสินค้า` และ `จัดส่งแล้ว` ที่ซ้ำกับ primary action ออกจาก `การทำงานเพิ่มเติม`
  - ข้อความ empty state ของ action rail เปลี่ยนเป็นภาษางาน เช่น `ออเดอร์ออนไลน์นี้จัดส่งแล้ว ไม่มี action หลักเพิ่มเติม`
  - confirm modal ของ `confirm_paid` ปรับ title/description/button ให้สอดคล้องกับบริบท online และ COD มากขึ้น

- ปรับ stepper ของ online order ในหน้า `/orders/[orderId]`:
  - non-COD: `สร้างออเดอร์ -> ยืนยันชำระ -> แพ็กสินค้า -> จัดส่ง`
  - COD: `สร้างออเดอร์ -> แพ็กสินค้า -> จัดส่ง -> ปิดยอด COD`
  - เอา step `ปิดงาน` ออกจาก online flow เพราะไม่มี close action จริงสำหรับทุกเคส

- แก้ build issue ตอน `next build` ที่เคยสะดุดระหว่าง prerender:
  - บังคับ `app/api/stock/current/route.ts` เป็น `force-dynamic`
  - บังคับ `app/(app)/settings/audit-log/page.tsx` เป็น `force-dynamic`
  - ผลคือ `next build` ผ่านแล้วใน sandbox แม้จะยังมี log DNS ของ Turso ระหว่าง collect page data

- ปรับ media upload policy ให้คุม storage cost เข้มขึ้น:
  - `product image`, `shipping label`, และ `payment QR` รับเฉพาะไฟล์ raster (`JPG/PNG/WebP`) แล้ว; ไม่รับ `SVG`
  - ฝั่ง server (`lib/storage/r2.ts`) บังคับ optimize เป็น `WebP` ก่อนเก็บเสมอ และถ้า optimize ไม่สำเร็จจะ reject แทนการ fallback ไปเก็บไฟล์ดิบ
  - หน้า `/products` เพิ่ม client-side compression ก่อนอัปโหลดรูปสินค้า (`640px WebP`)
  - หน้า `/orders/[orderId]` เพิ่ม client-side compression ก่อนอัปโหลดรูปป้ายจัดส่ง (`1600px WebP`)
  - หน้า `/settings/store/payments` ปรับ file picker/validation ให้สอดคล้องกับ policy raster-only ของรูป QR

- ปรับ UX error ตอนอัปโหลดรูปป้ายจัดส่งในหน้า `/orders/[orderId]`:
  - ตรวจชนิดไฟล์และขนาด (`ไม่เกิน 6MB`) ตั้งแต่ฝั่ง client ก่อนยิง `POST /api/orders/[orderId]/shipments/upload-label`
  - เมื่อไฟล์ไม่ผ่าน validation หรือ upload/bind shipping ไม่สำเร็จ ระบบจะแสดง `toast` ทันที
  - คง inline error ไว้ใต้ปุ่ม `อัปโหลด/ถ่ายรูปป้าย` เพื่อให้ผู้ใช้เห็นจุดที่ต้องแก้แม้ toast จะหายไปแล้ว
  - helper text ใต้ปุ่มอัปโหลดระบุข้อจำกัดไฟล์รูป `ไม่เกิน 6MB` ชัดขึ้น
- ปรับ storage ของรูป QR บัญชีรับเงินให้เก็บเป็น `object key/path` ใน DB:
  - `POST/PATCH /api/settings/store/payment-accounts` จะเก็บค่า `upload.objectKey` แทน full public URL สำหรับไฟล์ที่อัปโหลดใหม่
  - ถ้าส่ง `qrImageUrl` เข้ามาเป็น full URL เดิมของ R2/CDN หรือเป็น key/path ของไฟล์ ระบบจะ normalize ให้เป็น key ก่อนบันทึก
  - ตอน query ออกหน้า settings, `/orders/new`, และ `/orders/[orderId]` จะ resolve key กลับเป็น public URL ด้วย `R2_PUBLIC_BASE_URL`
  - ข้อมูลเก่าที่ยังเป็น full URL (`r2.dev`/CDN) ยังอ่านและลบไฟล์ได้เหมือนเดิม

- ปรับ storage ของรูปสินค้าให้เก็บเป็น `object key/path` ใน DB เช่นกัน:
  - `PATCH /api/products/[productId]` (multipart upload image) จะเก็บ `upload.objectKey` ลง `products.imageUrl`
  - ตอน list product, create/update response, และ order catalog ของหน้า POS จะ resolve key กลับเป็น public URL ด้วย `R2_PUBLIC_BASE_URL`
  - ข้อมูลเก่าที่เป็น full URL ยังแสดงรูปและลบไฟล์ได้เหมือนเดิม
  - `next.config.ts` อ่าน `R2_PUBLIC_BASE_URL` แล้วเพิ่ม hostname/path เข้า `images.remotePatterns` อัตโนมัติ เพื่อให้ `next/image` โหลด custom CDN ได้

- ปรับ badge สถานะในหน้า `/orders` สำหรับ online order:
  - เลิกแปล `status=PENDING_PAYMENT` เป็น `ค้างจ่าย` แบบเหมารวมใน list
  - badge หลักของ online จะเป็น `รอดำเนินการ` แทน เพื่อสื่อสถานะงาน
  - badge รองอ่านจาก `paymentMethod/paymentStatus` เช่น `ยังไม่ชำระ`, `รอตรวจสลิป`, `COD`, `COD รอปิดยอด`, `ชำระแล้ว`
  - ใช้ helper เดียวกันทั้ง mobile card list และ desktop table เพื่อลดความคลาดเคลื่อนของการแสดงผล

- ปรับ UX เลือก `บัญชีรับเงิน (QR)` ใน modal checkout ของ `/orders/new`:
  - หลังเลือกบัญชี QR จะมี section `แสดง QR` แบบพับ/เปิด (default ปิด)
  - เมื่อเปิดจะแสดงรูป QR, ชื่อบัญชีที่แสดง, ธนาคาร, ชื่อเจ้าของบัญชี, และเลขบัญชีด้านล่าง พร้อมปุ่ม `คัดลอกเลขบัญชี`
  - บนการ์ดรูป QR มีปุ่มไอคอน `เปิดรูปเต็ม` และ `ดาวน์โหลด`
  - `เปิดรูปเต็ม` เปลี่ยนเป็น preview overlay ในหน้าเดิมเพื่อไม่หลุดจาก flow checkout; ภายใน overlay มี action รอง `เปิดแท็บใหม่`, `ดาวน์โหลด`, และ `ปิด`
  - ปุ่มดาวน์โหลดเปลี่ยนไปเรียก route same-origin `GET /api/orders/payment-accounts/[accountId]/qr-image?download=1` ก่อน เพื่อลดปัญหา CORS/CDN download; ถ้าไม่สำเร็จจะ fallback ไปเปิดรูปในแท็บใหม่

- ปรับ section `ชำระด้วย QR โอนเงิน` ในหน้า `/orders/[orderId]`:
  - หน้า detail ตัด field `ลิงก์หลักฐานการชำระ`, placeholder `https://...`, และปุ่ม `แนบหลักฐาน / ส่งรอตรวจสอบ` ออกแล้ว เพื่อให้ตรงกับ workflow ใช้งานจริงในลาว
  - เคส `Walk-in + ชำระแล้ว` ยังคงเหลือเฉพาะรูป QR + ชื่อบัญชี + ธนาคาร + เลขบัญชีแบบ read-only
  - เพิ่มปุ่ม `ดูรูปเต็ม` และ `ดาวน์โหลด QR` ให้บล็อก QR summary ในหน้า detail แล้ว; ปุ่มดาวน์โหลดจะใช้ route same-origin ก่อนและ fallback เปิดรูปในแท็บใหม่ถ้าดาวน์โหลดไม่สำเร็จ
  - เคส `Pickup/Online` ให้พนักงานตรวจสลิปจากแชต/ช่องทางภายนอก แล้วค่อยกด action หลัก `ยืนยันชำระแล้ว` หรือ `ตรวจสลิปและยืนยันชำระ` ในหน้า detail แทนการบันทึกลิงก์ลงออเดอร์; backend `confirm_paid` เลิกบังคับ `paymentSlipUrl` สำหรับ flow นี้แล้ว
  - reopen checkout modal แล้ว section นี้จะกลับไปปิดเสมอ เพื่อลดความยาวของฟอร์มในจอเล็ก

- ปรับ section `การส่งข้อความ` ในหน้า `/orders/[orderId]`:
  - เอาปุ่ม `Send QR` และข้อความอ้างว่า `ส่งอัตโนมัติได้` ออกแล้ว
  - เปลี่ยนหัวข้อเป็น `ข้อความสำหรับส่งลูกค้า`
  - ปุ่มเป็น contextual actions ตาม channel จริงของออเดอร์: `คัดลอกข้อความ` มีเสมอ, `เปิด WhatsApp` จะแสดงเฉพาะออเดอร์ WhatsApp ที่มี deep link, `เปิด Facebook` จะแสดงเฉพาะออเดอร์ Facebook
  - เพิ่มข้อความชัดเจนว่า system ยังไม่เชื่อม Facebook/WhatsApp API จริง จึงต้องส่งเองจากภายนอก

- ปรับ UX modal `ชำระเงินและรายละเอียดออเดอร์` ในหน้า `/orders/new`:
  - เพิ่ม option `scrollToTopOnOpen` ใน `SlideUpSheet` (default `false`)
  - เปิดใช้กับ checkout sheet เพื่อให้ทุกครั้งที่เปิด modal จะเริ่มจากด้านบนของฟอร์มเสมอ (ไม่ค้างตำแหน่ง scroll เดิม)

- ปรับบล็อก `การจัดส่ง` ในหน้า `/orders/[orderId]` (โหมดออนไลน์) เป็น manual upload-first:
  - เอาช่องกรอก manual (`ขนส่ง/เลขพัสดุ/ลิงก์/ต้นทุน`) และ action เก่า (`สร้าง Shipping Label`, `ส่งข้อมูลจัดส่งให้ลูกค้า`) ออกจากบล็อกนี้
  - คงเฉพาะสรุปข้อมูลจัดส่ง + preview รูปล่าสุด + ปุ่มเดียว `อัปโหลด/ถ่ายรูปป้าย`
  - เมื่อกดปุ่มจะเปิด chooser แบบ `SlideUpSheet` ให้เลือก `เลือกรูปจากเครื่อง` หรือ `ถ่ายรูปจากกล้อง`; บนมือถือเป็น slide-up และ swipe down ปิดได้, ถ้าเครื่อง/ browser ไม่รองรับกล้องจะ disable option กล้องแทน
  - หลังอัปโหลดสำเร็จ ระบบจะ PATCH `update_shipping` ให้อัตโนมัติทันที (ไม่ต้องกดบันทึกซ้ำ)
  - มือถือรองรับการเปิดกล้องโดยตรงผ่าน input `capture="environment"` เมื่อเลือกทาง `ถ่ายรูปจากกล้อง`
  - ถ้ามีรูปป้ายอยู่แล้ว จะมีปุ่ม `ลบรูปป้าย` พร้อม custom confirm modal; การลบรอบนี้จะเคลียร์เฉพาะ `shippingLabelUrl` ออกจากออเดอร์และคงข้อมูลขนส่งอื่นไว้

- ปรับการแสดง `ช่องทาง` ในหน้า `/orders`:
  - desktop เพิ่มคอลัมน์ `ช่องทาง` ใหม่ (แสดงค่าในรูป `Facebook • LAK • COD`) และคอลัมน์ `ยอดรวม` เหลือเฉพาะยอดเงิน
  - ใช้ข้อความเดียวกันทุกหน้าจอเป็น `Facebook` / `WhatsApp` / `Walk-in` / `Pickup`
  - mobile คงรูปแบบบรรทัดเดียวเดิม และแสดงเป็น `Facebook • LAK • COD` (ไม่มี prefix `ช่องทาง`/`จ่าย`)

- ปรับสถานะเริ่มต้นของการสร้างออเดอร์ `ONLINE_DELIVERY` ใน `POST /api/orders`:
  - จากเดิม `DRAFT` เปลี่ยนเป็น `PENDING_PAYMENT` ทันที
  - จองสต็อก (`RESERVE`) ตั้งแต่ตอนสร้างออเดอร์ออนไลน์ เพื่อไม่ต้องกด action เพิ่มในหน้า detail
  - ไม่กระทบ flow เดิมของ `Walk-in` และ `Pickup later`

- ปรับระบบพิมพ์ใน success modal ของหน้า `/orders/new` ให้รองรับ iOS ดีขึ้น:
  - เปลี่ยนจาก hidden iframe (`iframe.contentWindow.print()`) เป็น `window.print()` บนหน้าเดิม
  - ใช้ print-root + print CSS เพื่อพิมพ์เฉพาะบิล/สติ๊กเกอร์ (ไม่พิมพ์ทั้งหน้า)
  - ปุ่มพิมพ์จะรอให้ preview พร้อมก่อน เพื่อหลีกเลี่ยงเคส mobile iOS บล็อก print หลัง async

- ปรับระบบพิมพ์หน้า `/orders/[orderId]` ให้รองรับ iOS ดีขึ้น:
  - เปลี่ยนจาก hidden iframe (`iframe.contentWindow.print()`) เป็น `window.print()` บนหน้าเดิม
  - ตอนกดพิมพ์ ระบบจะ inject print-root เฉพาะเอกสารที่ต้องพิมพ์ (`ใบเสร็จ`/`ป้ายจัดส่ง`) และใช้ print CSS ซ่อนคอนเทนต์อื่นทั้งหมด
  - ผลลัพธ์คือยังคง UX “พิมพ์ในหน้าเดิม” โดยไม่พิมพ์ทั้งหน้า และลดปัญหาปุ่มพิมพ์ไม่ทำงานบน mobile iOS

- ปรับคำใน badge สถานะออเดอร์:
  - เปลี่ยนจาก `รอชำระ` เป็น `ค้างจ่าย` ในหน้า `/orders` และ `/orders/[orderId]`
  - สถานะผสมปรับตาม เช่น `รับสินค้าแล้ว (รอชำระ)` -> `รับสินค้าแล้ว (ค้างจ่าย)`

- ปรับ UX สถานะในหน้า `/orders` ให้แยกเคสรับที่ร้านที่จ่ายแล้ว/ค้างจ่าย:
  - ขยาย `OrderListItem` และ query `listOrdersByTab` ให้คืน `paymentStatus` ใน `GET /api/orders`
  - สถานะหลักยังคงเป็น `รอรับที่ร้าน` แต่เพิ่ม badge รองจาก `paymentStatus`:
    - `PAID/COD_SETTLED` => `ชำระแล้ว`
    - `PENDING_PROOF` => `รอตรวจสลิป`
    - อื่น ๆ => `ค้างจ่าย`
  - แสดงผลทั้ง mobile card list และ desktop/tablet table ของหน้า `/orders`

- ปรับดีไซน์ `สถานะงาน` ในหน้า `/orders/[orderId]`:
  - Mobile ใช้ `ขั้นปัจจุบัน + progress bar` และ stepper compact 1 แถว (`flex-1` ต่อขั้น) พร้อม label 2 บรรทัดเพื่อเห็นครบและไม่ล้นจอ
  - Desktop/Tablet ใช้ stepper แนวนอนบรรทัดเดียว พร้อมเส้นเชื่อมระหว่างขั้น
  - คงลำดับขั้นตาม flow เดิม (`walk-in`, `pickup`, `online`) แต่ visual ชัดขึ้นและสแกนสถานะเร็วขึ้น
  - แก้ bug overflow บน mobile: เอา `-mx` ออกจาก container stepper, เพิ่ม `min-w-0` ที่ rail หลัก, และปรับ stepper ให้ไม่ใช้ `w-max/nowrap`
  - เสริม guard ที่ root ของหน้า detail ด้วย `overflow-x-hidden` กันกรณีข้อความยาวผิดปกติดันหน้าเกินจอ

- เพิ่ม flow pickup แบบ 2 ลำดับในหน้า `/orders/[orderId]` และ API:
  - รองรับทั้ง `ยืนยันรับชำระ -> ยืนยันรับสินค้า` และ `ยืนยันรับสินค้า (ค้างจ่าย) -> ยืนยันรับชำระ`
  - เพิ่ม action ใหม่ `mark_picked_up_unpaid` ใน `PATCH /api/orders/[orderId]` เพื่อรับสินค้าไปก่อน (ปล่อยจอง+ตัดสต็อก) แล้วเปลี่ยนสถานะเป็น `PICKED_UP_PENDING_PAYMENT`
  - ปรับ `confirm_paid` ให้รองรับสถานะ `PICKED_UP_PENDING_PAYMENT` (ปิดยอดโดยไม่ตัดสต็อกซ้ำ) และปรับเคส `READY_FOR_PICKUP + ยังไม่จ่าย` ให้เป็นยืนยันรับชำระอย่างเดียวก่อน
  - ถ้าออเดอร์หน้าร้าน (`Walk-in/Pickup`) อยู่ในโหมด `ค้างจ่าย` (`paymentMethod=ON_CREDIT`) modal `ยืนยันรับชำระ` จะให้เลือกวิธีรับเงินจริงเป็น `เงินสด` หรือ `QR โอน`; ถ้าเลือก QR ต้องเลือกบัญชี QR ของร้านก่อนบันทึก และ modal จะแสดง preview QR พร้อมชื่อบัญชี/ธนาคาร/เลขบัญชี, ปุ่ม `คัดลอกเลขบัญชี`, ปุ่มไอคอน `ดูรูปเต็ม`, และปุ่มไอคอน `ดาวน์โหลด`
  - ฝั่ง API `confirm_paid` จะรับ `paymentMethod/paymentAccountId` สำหรับ in-store credit settlement เท่านั้น และจะอัปเดตค่าบน order ให้ตรงกับการรับเงินจริง โดยไม่บังคับแนบสลิปสำหรับ QR ที่รับชำระหน้าเคาน์เตอร์
  - ปรับ `submit_payment_slip` ให้รองรับ `PICKED_UP_PENDING_PAYMENT`
  - ปรับ `cancel` ให้แยกการคืนสต็อกตาม movement จริง: เคสยังจองใช้ `RELEASE`, เคสรับสินค้าแล้วใช้ `RETURN`
  - หน้า detail เพิ่มปุ่ม `ยืนยันรับสินค้า (ค้างจ่าย)` พร้อม custom confirm modal และซ่อน `การทำงานเพิ่มเติม` สำหรับสถานะ `PICKED_UP_PENDING_PAYMENT`
  - ปรับ badge/label/filter/report ให้รองรับสถานะใหม่ (`PICKED_UP_PENDING_PAYMENT`) ครบทั้ง list/reports/query layer

- ปรับ UX หน้า `/orders/[orderId]` ให้เป็น flat/no-card:
  - เอาโครง card ซ้อนหลายชั้นออก แล้วใช้เส้นคั่น section (`border-b`) + spacing เพื่อใช้พื้นที่คุ้มขึ้น โดยเฉพาะหน้าจอเล็ก
  - เพิ่ม badge บอก `ประเภท flow` (`Walk-in ทันที` / `มารับที่ร้านภายหลัง` / `สั่งออนไลน์/จัดส่ง`) ที่ header ของ detail
  - ซ่อนบล็อก `การจัดส่ง` อัตโนมัติเมื่อเป็นออเดอร์หน้าร้าน/รับที่ร้านที่ไม่มีข้อมูลจัดส่ง เพื่อลด noise
  - ปุ่ม action ใน detail ปรับถ้อยคำไทยให้ชัด (`ยืนยันแพ็กแล้ว`, `ยืนยันจัดส่งแล้ว`, `ยกเลิกออเดอร์`)
  - เคส `Walk-in + ชำระแล้ว` ปรับเป็นหน้าสรุปจบงาน: action rail ซ่อน `แพ็ก/จัดส่ง` และซ่อนข้อความ `ไม่มีป้าย` แต่ยังมี `พิมพ์ใบเสร็จ` และ `ยกเลิกออเดอร์` (เมื่อผู้ใช้มีสิทธิ์) เพื่อรองรับการแก้รายการหน้างาน
  - แก้เงื่อนไข `Walk-in ปิดงาน` ให้ยึด `status=PAID` เท่านั้น (ไม่ใช้ `paymentStatus=PAID` อย่างเดียว) เพื่อให้เคส `READY_FOR_PICKUP + PAID` ยังเห็นปุ่ม `ยืนยันรับสินค้า`
  - เคส `Walk-in + ยกเลิกแล้ว` ซ่อนเมนู `การทำงานเพิ่มเติม` ใน action rail เพื่อลดความสับสน (ไม่มี action ต่อใน flow นี้)
  - เคส `Walk-in + รอชำระ` ซ่อนเมนู `การทำงานเพิ่มเติม` ใน action rail เพื่อให้หน้าโฟกัสแค่ `ยืนยันชำระ` และ `ยกเลิกออเดอร์`
  - เคส `มารับที่ร้านภายหลัง + รอรับที่ร้าน` (ทั้งจ่ายแล้ว/ยังไม่จ่าย) ซ่อนเมนู `การทำงานเพิ่มเติม` ใน action rail เพื่อให้หน้าโฟกัส action หลัก (`ยืนยันชำระ/ยืนยันรับสินค้า/ยกเลิกออเดอร์`)
  - ปุ่ม `ยืนยันรับชำระ` และ `ยืนยันรับสินค้า` (รับที่ร้าน/จ่ายแล้ว) ในหน้า detail เพิ่ม custom confirm modal ก่อนส่ง action `confirm_paid`
  - ซ่อน `ข้อมูลลูกค้า` อัตโนมัติเมื่อเป็นค่า default ของ walk-in (`ลูกค้าหน้าร้าน` + โทร/ที่อยู่ว่าง)
  - ปรับ `รายการสินค้า` ให้อ่านง่ายขึ้นแบบ 2 แถวต่อสินค้า (ชื่อ+ยอดบรรทัด / SKU+จำนวน+หน่วยฐาน) และปรับ summary ด้านล่างให้ตัวเลขชิดขวา (`tabular-nums`) เพื่อสแกนยอดเร็วขึ้น
  - บนจอ `lg+` (รวม tablet แนวนอน) ปรับรายการสินค้าเป็นตารางแนวบิล `รายการ | จำนวน | รวม` เพื่อให้การอ่านเหมือน desktop
  - ปรับ breakpoint หน้า detail ให้ action rail ด้านขวาเริ่มที่ `lg` (tablet แนวนอนใช้ layout เดียวกับ desktop)
  - รวมปุ่มพิมพ์ใบเสร็จที่ซ้ำกันให้เหลือ action เดียวใน action rail และเปลี่ยนพิมพ์ใบเสร็จ/ป้ายเป็น `window.print()` + print-root ในหน้าเดิม (ไม่เปิดแท็บใหม่)
  - แก้ issue พิมพ์ครั้งแรกข้อมูลว่างในหน้า detail: เปลี่ยน flow ให้ iframe โหลดปลายทางด้วย `autoprint=1` แล้วให้หน้าพิมพ์เรียก `window.print()` เองหลัง render data แทนการสั่งจาก parent เร็วเกินไป
  - ปรับการแสดงผลสกุลเงินในหน้า detail/หน้าพิมพ์ให้ใช้ symbol (`₭`, `฿`, `$`) แทนรหัส (`LAK`, `THB`, `USD`) ในจุดแสดงยอดหลัก
  - เอา text link `กลับไปหน้ารายการขาย` ออกจากหน้า detail เพื่อลดปุ่มซ้ำกับ navigation หลักของระบบ

- ปรับ UX หน้า `/orders` ในตาราง desktop/tablet:
  - คลิกได้ทั้งแถวเพื่อเปิดรายละเอียดออเดอร์ (`/orders/[orderId]`) และรองรับคีย์บอร์ด (`Enter`/`Space`)
  - คงตัวอักษรเลขออเดอร์เป็นสีเน้นเพื่อสื่อว่าเป็นรายการที่เปิดดูต่อได้

- ปรับ matrix สถานะสร้างออเดอร์ให้ตรง flow หน้างาน (Walk-in/Pickup):
  - `Walk-in ทันที + เงินสด/QR/โอน` -> สร้างเป็น `PAID` และลง movement `OUT` ทันที
  - `Walk-in ทันที + ค้างจ่าย` -> สร้างเป็น `PENDING_PAYMENT` และลง movement `RESERVE`
  - `มารับที่ร้านภายหลัง` -> สร้างเป็น `READY_FOR_PICKUP` และลง movement `RESERVE` เสมอ; ถ้าชำระแล้วจะตั้ง `paymentStatus=PAID` แต่ยังไม่ตัดสต็อกจนกดยืนยันรับสินค้า
  - ปรับ `confirm_paid` ให้รองรับเคส `READY_FOR_PICKUP + paymentStatus=PAID` เป็นการยืนยันรับสินค้า (ปล่อยจอง+ตัดสต็อก) และไม่บังคับสลิปซ้ำ

- เพิ่ม policy ยกเลิกออเดอร์แบบ step-up approval ในหน้า `/orders/[orderId]`:
  - ผู้กดปุ่มยกเลิกต้องมีสิทธิ์ส่งคำขออย่างน้อยหนึ่งสิทธิ์ (`orders.update` หรือ `orders.cancel` หรือ `orders.delete`)
  - รองรับ 2 โหมดยืนยัน:
    - `Owner/Manager` ยืนยันเองด้วย `เหตุผล + สไลด์ยืนยัน` (`approvalMode=SELF_SLIDE`)
    - role อื่นยืนยันด้วย `อีเมลผู้อนุมัติ + รหัสผ่านผู้อนุมัติ + เหตุผล` (`approvalMode=MANAGER_PASSWORD`)
  - API ตรวจ role ฝั่ง server ว่าโหมด `SELF_SLIDE` ใช้ได้เฉพาะ `Owner/Manager` เท่านั้น
  - เมื่อยกเลิกสำเร็จ จะเก็บ `cancelReason` และข้อมูลผู้อนุมัติ (`approvedBy*`) ใน audit metadata
  - ปรับ UI จาก inline form เป็น modal กลางแบบ adaptive ตาม role (คอมโพเนนต์เดียวสำหรับ reuse)
  - เพิ่ม throttle ฝั่ง UI ในโหมดรหัสผ่าน: ถ้ายืนยันไม่สำเร็จติดกันหลายครั้ง ระบบจะพักการยืนยันชั่วคราว (cooldown) ก่อนลองใหม่
  - หน้า detail แสดงสรุป `การอนุมัติยกเลิก` หลังยกเลิกสำเร็จ โดยอ่านจาก `audit_events` (`order.cancel`) เช่น เหตุผล, ผู้อนุมัติ, ผู้กดยกเลิก, เวลาอนุมัติ
  - ปุ่ม `ยกเลิกออเดอร์` ย้ายมาอยู่ action rail หลักของหน้า detail แล้ว (ไม่ซ่อนใน `การทำงานเพิ่มเติม`) เพื่อกดได้ทันที
  - เพิ่มเอกสารเทส `docs/UAT_CANCEL_APPROVAL.md` (6 เคส) ให้ทีมใช้ทดสอบ flow เดียวกัน

- เพิ่ม `Shipping Provider Master` สำหรับ flow ออนไลน์:
  - เพิ่มตารางใหม่ `shipping_providers` (migration `0037_bouncy_leper_queen.sql`) เก็บ master ต่อร้าน (`code`, `displayName`, `branchName`, `aliases`, `active`, `sortOrder`)
  - `getOrderCatalogForStore` คืน `catalog.shippingProviders` จากตารางจริง และมี fallback ค่า default ถ้ายังไม่ได้ migrate
  - หน้า `/orders/new` เปลี่ยนจาก hardcode ขนส่งเป็นอ่านปุ่ม grid จาก `catalog.shippingProviders` + ปุ่ม `อื่นๆ`
  - เพิ่มหน้า settings `/settings/store/shipping-providers` + component `store-shipping-providers-settings` สำหรับจัดการรายการขนส่ง (เพิ่ม/แก้ไข/ปิดใช้งาน/ลบ)
  - เพิ่ม API `/api/settings/store/shipping-providers` (`GET/POST/PATCH/DELETE`) สำหรับ CRUD master ขนส่งของร้าน
  - `POST /api/onboarding/store` seed provider เริ่มต้นให้ร้านใหม่อัตโนมัติ (`Houngaloun`, `Anousith`, `Mixay`)
  - `scripts/repair-migrations.mjs` รองรับสร้างตาราง + index + backfill provider default ให้ฐานเดิม

- เพิ่ม `COD Reconcile Panel (MVP)` สำหรับปิดยอด COD รายวันแบบหลายรายการ:
  - หน้าใหม่ `/orders/cod-reconcile` (client: `components/app/orders-cod-reconcile.tsx`)
  - หน้า `/orders` เพิ่มปุ่มลัด `ปิดยอด COD รายวัน` (แสดงเฉพาะผู้มีสิทธิ์ `orders.mark_paid`)
  - รองรับ filter `dateFrom/dateTo`, `provider`, `q` และ pagination
  - ผู้ใช้แก้ `ยอดโอนจริง` + `codFee` รายรายการ แล้วเลือกหลายรายการเพื่อ `ยืนยันปิดยอดที่เลือก` ได้
  - มี summary card real-time (ยอดต้องได้/ยอดโอนจริง/codFee/ส่วนต่าง) จากรายการที่เลือก + สรุปร่างข้อมูลทั้งหน้าปัจจุบัน
  - API ใหม่:
    - `GET /api/orders/cod-reconcile` ดึงรายการ COD pending reconcile
    - `POST /api/orders/cod-reconcile` ปิดยอดแบบ batch, เขียน audit action `order.confirm_paid.bulk_cod_reconcile`, invalidate cache dashboard/reports, และรองรับ `Idempotency-Key` กันปิดยอดซ้ำ
  - query helper ใหม่ `listPendingCodReconcile` ใน `lib/orders/queries.ts`

- แก้ปัญหา dropdown หน่วยสินค้าในหน้า create order แจ้ง React key ซ้ำ (`unit_ea`):
  - ปรับ `getOrderCatalogForStore` ให้ dedupe `units` ต่อสินค้าโดยยึด `unitId` ไม่ซ้ำ
  - คงข้อมูล base unit เป็นตัวหลัก แล้วเพิ่ม conversion เฉพาะ unit ที่ยังไม่ถูกใส่
  - ลดโอกาสเจอ warning `Encountered two children with the same key` ในฟอร์มตะกร้า/checkout

- แก้เคสเลือก `สั่งออนไลน์/จัดส่ง` แล้วเลือก `COD` แต่ยังโดน validation เด้งว่าใช้ COD ไม่ได้:
  - เพิ่ม `checkoutFlow` ใน `defaultValues` ของ create order form และ sync ทุกครั้งที่เปลี่ยนประเภทออเดอร์
  - ทำให้ `zodResolver(createOrderSchema)` เห็น `checkoutFlow=ONLINE_DELIVERY` จริงขณะ validate `paymentMethod=COD`

- ขยาย COD return flow ตามงานหน้างานจริง:
  - เพิ่มคอลัมน์ `orders.cod_return_note` พร้อม migration (`0036_ambiguous_nuke.sql`) เพื่อเก็บเหตุผล/หมายเหตุตีกลับ
  - หน้า `/orders/[orderId]` (order detail) ในบล็อก COD เพิ่ม textarea `เหตุผล/หมายเหตุ` ตอนกด `ตีกลับเข้าร้าน (COD)` และแสดงหมายเหตุที่บันทึกไว้ในสรุป COD
  - API `PATCH /api/orders/[orderId]` action `mark_cod_returned` รองรับ `codReturnNote` เพิ่มจากเดิม (`codFee`) และบันทึกลงออเดอร์พร้อม audit metadata
  - `scripts/repair-migrations.mjs` รองรับเติมคอลัมน์ `orders.cod_return_note` ให้ฐานเก่าที่ยังไม่มีคอลัมน์นี้

- ขยายรายงาน COD ให้เห็นต้นทุนตีกลับชัดขึ้น:
  - `getCodOverviewSummary` เพิ่ม metric `returnedTodayCodFee` และ `returnedCodFee` (รวม `codFee`)
  - ตาราง `แยกตามขนส่ง` เพิ่มคอลัมน์ metric `returnedCodFee` ต่อผู้ให้บริการ
  - หน้า `/reports` แสดง `ค่าตีกลับวันนี้` และ `ค่าตีกลับสะสม (codFee)` แล้ว เพื่อใช้ติดตามต้นทุนตีกลับรายวัน/รายขนส่ง

- อัปเดต COD settlement/return flow ในหน้า `/orders/[orderId]` และ API:
  - ปุ่ม `ยืนยันรับเงินปลายทาง (COD)` รองรับกรอก `ยอดที่ขนส่งโอนจริง` ก่อนยิง `confirm_paid` (payload `codAmount`)
  - ปุ่ม `ตีกลับเข้าร้าน (COD)` รองรับกรอก `ค่าตีกลับ` ก่อนยิง `mark_cod_returned` (payload `codFee`)
  - backend จะบวก `codFee` เข้า `shippingCost` และสะสมในคอลัมน์ `codFee` เพื่อรองรับเคสต้นทุนค่าส่งมารู้ทีหลัง
  - การ์ดสรุปใน order detail แสดงเพิ่ม `ต้นทุนขนส่งรวม` และ `ค่าตีกลับ COD` เพื่ออ่านผลกำไร/ขาดทุน COD ได้ตรงขึ้น

- ปรับ post-create flow ของหน้า POS (`/orders/new`) ให้แยกตามประเภทออเดอร์:
  - หลังสร้างสำเร็จ:
    - ทุกหน้าจอ (Desktop/Tablet/Mobile และทั้ง mode manage/create-only): แสดง success action sheet ในหน้าเดิมก่อน
  - action หลักใน sheet คือพิมพ์เอกสาร (`พิมพ์ใบเสร็จ` / `พิมพ์ใบรับสินค้า`) และมีทางเลือก `ดูรายละเอียดออเดอร์` หรือ `ออเดอร์ใหม่ต่อ`
  - เพิ่ม preview บิลใน success action sheet โดยโหลดข้อมูลออเดอร์จริงจาก `GET /api/orders/[orderId]`
  - flow `สั่งออนไลน์/จัดส่ง` เพิ่มบล็อก `ข้อมูลสติ๊กเกอร์จัดส่ง` (ผู้รับ/โทร/ที่อยู่/ขนส่ง/tracking/ต้นทุนค่าส่ง) และปุ่ม `พิมพ์สติ๊กเกอร์จัดส่ง`
  - flow `มารับที่ร้านภายหลัง` และ `สั่งออนไลน์/จัดส่ง` มีปุ่ม `ออเดอร์ใหม่ต่อ` ใน success action sheet เพื่อปิด modal แล้วเริ่มออเดอร์ใหม่ได้ทันที
  - หน้า `/orders/new` เพิ่มปุ่ม `ล่าสุด` ใต้แถบค้นหา: เปิด `SlideUpSheet` รายการออเดอร์ล่าสุด 8 รายการจาก `GET /api/orders` พร้อมปุ่ม `เปิดสรุป` (reopen success action sheet) และ `ดูรายละเอียด`
  - รายการ `ออเดอร์ล่าสุด` เพิ่มปุ่ม `ยกเลิก` แล้ว (เฉพาะสิทธิ์ `orders.update/cancel/delete`) และใช้ modal กลางตัวเดียวกับหน้า detail ก่อนยิง `PATCH /api/orders/[orderId]` action `cancel` (Owner/Manager ใช้โหมดสไลด์, role อื่นใช้โหมดรหัสผ่าน Manager)
  - ปุ่มพิมพ์ใน success action sheet พิมพ์ผ่าน `window.print()` + print-root เหมือนกันทุกหน้าจอ (ไม่เปิดแท็บใหม่/ไม่เปลี่ยนหน้า)
  - หน้า `/orders/[orderId]/print/receipt` เพิ่ม print CSS ซ่อน `header/bottom nav` ระหว่างพิมพ์ เพื่อกันการติด layout แอปในบิล
  - สำหรับ `พิมพ์สติ๊กเกอร์จัดส่ง`: ใช้ `window.print()` ในหน้าเดิมทุกหน้าจอ (ไม่เปิดแท็บใหม่)
  - ใน success action sheet ของ `สั่งออนไลน์/จัดส่ง` ปรับ block เป็น `ตัวอย่างสติ๊กเกอร์จัดส่ง` แบบการ์ด preview (แทน text list เดิม) เพื่อให้ visual ใกล้เคียง `ตัวอย่างบิล`

- ปรับ feedback ตอนเพิ่มสินค้าหมดสต็อกในหน้า POS:
  - การ์ดสินค้า `หมดสต็อก/ติดจอง` ยังกดได้ แต่ระบบจะไม่เพิ่มลงตะกร้า
  - เมื่อกดจะขึ้น toast error ทันทีว่าเพิ่มไม่ได้ และมี throttle กัน toast ซ้ำรัว

- ปรับ layout ปุ่ม `สร้างออเดอร์` ใน modal checkout หน้า `/orders/new`:
  - ย้ายปุ่ม submit ไปอยู่ `SlideUpSheet.footer` แทน sticky ในเนื้อหา form
  - ลดปัญหาพื้นหลังโปร่ง/เห็น card ใต้ปุ่มตอนเลื่อนใน modal และทำให้ safe-area ด้านล่างสม่ำเสมอ

- ปรับ flow ออนไลน์ใน modal checkout ให้รองรับช่วงยังไม่เชื่อม CRM/API ลูกค้า:
  - ช่องทางออนไลน์เปลี่ยนจาก dropdown เป็นปุ่มแบบ grid (`Facebook`, `WhatsApp`, `อื่นๆ`)
  - ถ้าเลือก `อื่นๆ` จะมี input `แพลตฟอร์มอื่น (ไม่บังคับ)` สำหรับช่วยกรอกหน้างาน (ยังไม่ผูก schema ช่องทางจริง)
  - ช่อง `เลือกลูกค้า` เปลี่ยนเป็นไม่บังคับ (`contactId` optional)
  - ถ้าไม่เลือกจากรายชื่อ ผู้ใช้ยังสร้างออเดอร์ได้โดยกรอกชื่อ/เบอร์เอง
  - ปรับ UI เป็น section พับ/เปิด (`+ เลือกจากรายชื่อลูกค้า`) เพื่อลดความรกของฟอร์มและเปิดเฉพาะตอนต้องการ
  - เพิ่มช่อง `เติมข้อมูลลูกค้าแบบเร็ว` สำหรับ paste ข้อความดิบแล้วแยก `ชื่อ/เบอร์/ที่อยู่` อัตโนมัติเบื้องต้น
  - เพิ่ม section `ข้อมูลขนส่ง` ใน online flow:
    - เลือก `ผู้ให้บริการขนส่ง` แบบ grid จาก `shipping_providers` ของร้าน + ปุ่ม `อื่นๆ`
    - ค่าเริ่มต้นเป็นว่าง (ไม่ auto select) และผู้ใช้ต้องเลือกเองก่อนกดสร้างออเดอร์
    - ถ้าเลือก `อื่นๆ` กรอกชื่อผู้ให้บริการได้แบบอิสระ
    - เอาช่อง `สาขาที่รับฝาก` ออกจากฟอร์ม checkout online แล้ว (เก็บเฉพาะ provider)

- ปรับ CTA หน้า `/orders` ให้เหลือทางเดียวในการเริ่มขาย:
  - เอาปุ่ม `สร้างด่วน` ออกจากหน้า manage orders
  - เปลี่ยนปุ่ม `สร้างออเดอร์` เป็น `เข้าโหมด POS` และพาไป `/orders/new` โดยตรง
  - ถอด quick-create modal ออกจากหน้า `/orders` เพื่อให้ UX ตัดสินใจเร็วขึ้น (single primary action)

- ปรับ UX `สกุลที่รับชำระในออเดอร์นี้` ใน modal checkout ของ create order:
  - ถ้าร้านรองรับสกุลเดียว ระบบจะ auto-select ให้และแสดงเป็น read-only (ไม่แสดง dropdown/chip ให้เลือกซ้ำ)
  - ถ้ารองรับหลายสกุล เปลี่ยนจาก dropdown เป็นปุ่มเลือกแบบ chips เพื่อกดเลือกได้เร็ว
  - เพิ่ม normalization ในฟอร์มให้ `paymentCurrency` อยู่ในรายการที่รองรับเสมอ (fallback อัตโนมัติเมื่อค่าปัจจุบันไม่ถูกต้อง/หายไป)

- ปรับ UX ตะกร้าใน create order (`/orders` และ `/orders/new`):
  - ปุ่ม `ลบ` ในการ์ดตะกร้าทุกมุมมอง (mobile preview, panel ขวา, cart sheet, และ row editor desktop) ลบได้จนเหลือ `0` รายการแล้ว
  - การ์ดสินค้าในตะกร้า (panel ขวา + cart sheet) แสดงบรรทัด `คงเหลือ ...` ต่อรายการ เพื่อช่วยตัดสินใจตอนปรับจำนวน

- ปรับพฤติกรรม modal `ชำระเงินและรายละเอียดออเดอร์` ใน create order:
  - กดนอก modal (backdrop) แล้วจะไม่ปิด
  - ถ้ากดปิดและมีข้อมูล checkout ที่กรอก/ปรับแล้ว จะขึ้น custom confirm ก่อนปิด
  - ถ้ายังไม่มีข้อมูล checkout ที่กรอก/ปรับ จะปิดได้ทันทีโดยไม่ขึ้น confirm

- ปรับหัวหน้า `/orders/new` ให้กระชับขึ้น:
  - เอาการ์ด header ทั้งบล็อกที่มี `step 1-3` และ `สรุปตะกร้า` ออก
  - ผลลัพธ์คือหน้าเริ่มที่ส่วนค้นหา/สินค้าโดยตรง ทำให้เห็นรายการสินค้าได้เร็วขึ้น

- ปรับ cart panel ฝั่ง tablet/desktop ใน `/orders/new`:
  - บังคับให้ footer (`ยอดรวม` + ปุ่ม `ถัดไป: ชำระเงิน`) ติดอยู่ด้านล่าง panel ตลอด
  - รายการสินค้าในตะกร้าจะเป็นส่วนที่ scroll ได้เอง เพื่อลดเคสต้องเลื่อนหน้าลงเพื่อกดชำระเงิน
  - แก้ issue summary ตะกร้าไม่อัปเดตตามข้อมูลจริงบางจังหวะ: เปลี่ยนจาก `form.watch` หลักไปใช้ `useWatch` และคำนวณ subtotal/cartQty จาก state ปัจจุบันโดยตรง เพื่อให้ยอดรวม/จำนวนชิ้นอัปเดตทันทีเมื่อแก้ qty/หน่วย/ลบรายการ
  - เสริมความเสถียร sticky rail: ตั้ง `md:items-start` ให้ layout grid และคำนวณ `top`/`height` ของ cart rail แบบไดนามิกจากความสูงจริงของ search sticky (`ResizeObserver`) โดยจูนค่าปัจจุบันเป็น `CREATE_ONLY_CART_STICKY_GAP_FALLBACK_PX=13` และ `CREATE_ONLY_CART_STICKY_EXTRA_TOP_PX=13`
  - breakpoint sticky ปัจจุบันตั้ง `TABLET_MIN_WIDTH_PX=1200` เท่ากับ `DESKTOP_MIN_WIDTH_PX=1200` แบบ intentional เพื่อให้ tablet/desktop ใช้สูตร sticky เดียวกัน
  - ปุ่มลัด `ดูตะกร้า` และ sticky checkout bar บนมือถือของ `/orders/new` ปรับ `bottom` เป็น `calc(env(safe-area-inset-bottom) + 0.75rem)` เพื่อให้ติดก้นจอจริงและลดช่องว่างลอยด้านล่าง

- ปรับ UX ตัวกรองสินค้าใน create order ให้เรียบขึ้น:
  - เอา filter เรียงสินค้า (`แนะนำ`, `ชื่อ A-Z`, `ราคาต่ำ-สูง`, `ราคาสูง-ต่ำ`) ออกจากหน้า `/orders/new`
  - เอา dropdown `เรียง` ใน quick add POS-lite (หน้า `/orders`) ออกด้วย เพื่อให้ behavior สอดคล้องกัน

- ปรับโครง sticky ของหน้า `/orders/new`:
  - บล็อกค้นหาด้านบน (search + filter + category chips + scanner helper) ตั้งเป็น sticky ติดบนตลอด และถอดสไตล์การ์ดออกให้เป็น full-width
  - แถว `ค้นหา + สแกน + filter สต็อก` จัดเป็น 3 คอลัมน์บรรทัดเดียวบนมือถือ และย่อ label filter เป็น `มีสต็อก`/`มีสต็อก✓`
  - ปรับ sticky search ลงอีกเล็กน้อยเป็น `top-[3.8rem]` ทั้ง mobile/desktop และคง `border-b` ใต้บล็อก เพื่อให้ตำแหน่งบาลานซ์ขึ้น
  - ดึง container ของหน้า create ขึ้น (`-mt-4`) เพื่อลบช่องว่างระหว่าง navbar กับ search section
  - cart panel ฝั่ง tablet/desktop ยังคง sticky ขวา และ footer ปุ่มชำระเงินติดล่างเหมือนเดิม

- ปรับ layout contract สำหรับ tablet/desktop ให้สอดคล้องกันทั้ง shell + overlay:
  - เปลี่ยนเกณฑ์ desktop จาก `>=1024px` เป็น `>=1200px` ใน app shell และ navbar fullscreen logic
  - app shell หลัก (`(app)` และ `system-admin`) ใช้โหมด tablet (`768-1199px`) แบบเต็มจอพร้อม padding `px-6`, และ desktop (`>=1200px`) แบบ constrained พร้อม padding `px-8`
  - ปรับความกว้าง desktop shell เป็น `80rem` และเตรียม token โหมดกว้าง `90rem` สำหรับหน้าข้อมูลหนาแน่น
  - `SlideUpSheet` ปรับพฤติกรรมเป็น 3 ช่วงชัดเจน:
    - mobile `<768px` = bottom sheet + drag handle
    - tablet `768-1199px` = centered sheet (`min(45rem, 100vw-2rem)`, `max-h: 92dvh`)
    - desktop `>=1200px` = centered modal (ใช้ `panelMaxWidthClass` เฉพาะ desktop)
  - bottom nav ทั้ง app และ system-admin ถูก constrain เฉพาะ desktop (`>=1200px`) เพื่อให้ tablet ใช้งานเต็มความกว้าง
  - quick inbox threshold ฝั่ง navbar เปลี่ยนตามนิยามใหม่: non-desktop = `<1200px`
  - phase 2: migrate custom modal/sheet ที่ยังไม่ได้ใช้ `SlideUpSheet` (users, categories, units, store payment accounts, stores management, force-change password modal) ให้เริ่ม centered mode ที่ `>=768px` และใช้ drag/mobile behavior เฉพาะ `<768px` ตาม contract ใหม่
  - phase 3: ย้าย modal/sheet จาก custom implementation เข้า `SlideUpSheet` กลางครบแล้ว (`/settings/categories`, `/settings/units`, `/settings/store/payments`, `/settings/users`, `/settings/stores`, และ force-change password modal ใน `/login`) โดยคง behavior เดิมของฟอร์ม/validation/API

- ปรับ scanner ของหน้า `/orders` และ `/orders/new` ให้ใช้มาตรฐานเดียวกับหน้าอื่น:
  - ย้ายจาก scanner logic ที่ฝังใน `orders-management.tsx` มาใช้คอมโพเนนต์กลาง `components/app/barcode-scanner-panel.tsx`
  - เพิ่ม permission sheet ก่อนเปิดกล้อง (`ยกเลิก` + `อนุญาตและสแกน`) แบบเดียวกับ `/products` และ `/stock`
  - พฤติกรรมเปิด/ปิดกล้อง, เลือกกล้อง, manual barcode fallback, และ cleanup stream ตอนปิด ถูก unify กับหน้าที่ใช้ scanner อื่น ๆ แล้ว
  - policy สำหรับงานถัดไป: หากเพิ่มปุ่ม `สแกนบาร์โค้ด` ในหน้าใหม่ ให้ใช้ `BarcodeScannerPanel` + permission sheet มาตรฐานเดียวกัน (ไม่แยกเขียน logic กล้องใหม่ในหน้า)

- ปรับค่าเริ่มต้นฟอร์มสร้างออเดอร์ให้ตะกร้าว่าง:
  - `defaultValues.items` ใน `orders-management.tsx` เปลี่ยนเป็น `[]` (ไม่ preload สินค้าตัวแรกอัตโนมัติ)
  - มีผลกับ flow สร้างออเดอร์หน้า `/orders/new`

- เพิ่ม draft persistence ให้หน้า `/orders/new`:
  - บันทึก draft create order (ตะกร้า + checkout fields + checkout flow) ลง `sessionStorage` ระหว่างผู้ใช้กรอกฟอร์ม
  - ถ้า refresh หน้า `/orders/new` จะกู้คืน draft ล่าสุดอัตโนมัติ (TTL 60 นาที)
  - ถ้ากดยืนยันออกจากหน้า create order ผ่านปุ่ม back (`กลับรายการออเดอร์`) หรือ logout ระบบจะล้าง draft ทิ้งทันที

- เพิ่มหน้าใหม่ `/orders/new` สำหรับสร้างออเดอร์แบบหน้าเต็ม (full create flow):
  - หน้า `/orders` ปรับบทบาทเป็น “จัดการออเดอร์” และใช้ action หลักเดียว `เข้าโหมด POS` (ไป `/orders/new`)
  - `/orders/new` ใช้คอมโพเนนต์/validation/API ชุดเดียวกับ flow เดิม (`POST /api/orders`) เพื่อลด drift
  - `/orders/new` ปรับเป็น POS-style UI: ตัด heading/description ของหน้า create ออก, แถบ `ค้นหา + สแกน`, product card grid, และ sticky cart/checkout action bar บนมือถือ
  - เพิ่มความกว้าง app shell บน desktop จาก `70rem` เป็น `76rem` เพื่อให้หน้า POS/หน้าจัดการข้อมูลมีพื้นที่ใช้งานมากขึ้น
  - product card รองรับรูปย่อสินค้า (`imageUrl`) พร้อม fallback placeholder
  - ย่อ product card ในหน้า `/orders/new` ให้ compact ขึ้นบนมือถือ (ลด padding/ขนาดรูป/ขนาดตัวอักษรเล็กน้อย) เพื่อเพิ่มจำนวนสินค้าที่เห็นต่อจอ
  - product picker รองรับ `ค้นหา + สแกนบาร์โค้ด + category chips + filter เฉพาะมีสต็อก`
  - เอา sidebar `เลือกหมวดเร็ว` ออกจาก layout หน้า `/orders/new` (desktop) เพื่อไม่ซ้ำกับ category chips ที่อยู่ใต้ search
  - ปรับการ์ดรายการในตะกร้าให้ minimal ทั้ง panel ด้านขวาและ cart sheet: ตัดข้อมูลรอง (SKU/คงเหลือ) และลดขนาดแถวให้โฟกัสที่ `หน่วย + จำนวน +/- + ยอด`
  - แก้ความกว้างช่อง `select หน่วย` ในตะกร้าให้เท่ากันทุกแถว โดย lock ความกว้างคอลัมน์ยอดบรรทัด (ลดอาการ select แกว่งตามจำนวนหลักของราคา)
  - เพิ่ม stock guard ฝั่ง UI ใน create order:
    - ถ้า `available <= 0` product card ยังแสดงสถานะ `หมดสต็อก/ติดจอง` และกดได้ แต่ระบบจะไม่เพิ่มลงตะกร้า พร้อมแจ้ง toast ว่าเพิ่มไม่ได้
    - ปุ่ม `+` ในตะกร้าเพิ่มจำนวนได้ไม่เกิน `available` เท่านั้น (รวมเคสเหลือ 1 ชิ้นเพิ่มได้สูงสุด 1)
  - checkout เพิ่มตัวเลือก `ประเภทออเดอร์` 3 แบบ: `Walk-in ทันที` / `มารับที่ร้านภายหลัง` / `สั่งออนไลน์/จัดส่ง`
  - ฟอร์ม checkout แสดง field แบบ dynamic ตามประเภทออเดอร์ (เช่น ช่องทาง+ลูกค้า+ที่อยู่จะแสดงเฉพาะ flow ออนไลน์)
  - โหมด `Walk-in ทันที` ซ่อนฟิลด์ `ชื่อลูกค้า`/`เบอร์โทร` เพื่อให้ flow หน้าร้านเร็วขึ้น และจะ clear ค่าลูกค้าเดิมอัตโนมัติเมื่อผู้ใช้สลับกลับมา Walk-in
  - โหมด `มารับที่ร้านภายหลัง` พับฟิลด์ `ชื่อลูกค้า`/`เบอร์โทร` เป็นค่าเริ่มต้น แล้วค่อยเปิดกรอกด้วยปุ่ม `+ เพิ่มข้อมูลผู้รับ (ไม่บังคับ)`; ถ้ายังพับอยู่จะแสดงสถานะสรุปข้อมูลผู้รับแทน
  - ดีไซน์ `ส่วนลด` ใน checkout เปลี่ยนเป็น panel เดียว: เปิด/ปิดส่วนลด, preset 5%/10%/20%, สลับกรอก `%` หรือ `จำนวนเงิน`, และแสดงส่วนลดที่คิดจริงแบบ real-time โดยไม่เปลี่ยน contract ค่า `discount` เดิม; แถว `จำนวนเงิน/%/preset` รวมเป็นบรรทัดเดียวและรองรับ scroll แนวนอนบนจอแคบ พร้อมเส้นคั่นระหว่างกลุ่มโหมดกับ preset เพื่อแยกความหมายชัดขึ้น
  - ดีไซน์ `ค่าขนส่ง` ใน checkout ออนไลน์ปรับเป็น panel พับ/เปิดแบบเดียวกับส่วนลดและ default ปิด; เมื่อกดปิดจะรีเซ็ต `ค่าส่งที่เรียกเก็บ` และ `ต้นทุนค่าส่ง` กลับเป็น `0`
  - ปรับ layout desktop ของ checkout ออนไลน์ให้ `ส่วนลด` และ `ค่าขนส่ง` อยู่บรรทัดเดียวแบบ 2 คอลัมน์เท่ากัน (1:1)
  - ดีไซน์ `วิธีรับชำระ` ใน checkout เปลี่ยนจาก dropdown เป็นปุ่มเลือกแบบ chips: หน้าร้าน/รับที่ร้าน = `เงินสด`, `QR`, `ค้างจ่าย`; ออนไลน์ = `เงินสด`, `QR`, `ค้างจ่าย`, `COD` และเพิ่ม enum ใหม่ `ON_CREDIT` สำหรับค้างจ่าย
  - validation ฝั่ง client ตาม flow: `Walk-in ทันที` และ `มารับที่ร้านภายหลัง` ไม่บังคับชื่อ/เบอร์ (แนะนำให้กรอกอย่างน้อย 1 อย่างถ้าทราบ), ส่วน `สั่งออนไลน์/จัดส่ง` ยังบังคับเบอร์โทร+ที่อยู่จัดส่ง และเปิด `COD` เฉพาะ flow ออนไลน์
  - ฝั่ง API `POST /api/orders` รองรับ `checkoutFlow` (optional) พร้อม matrix ล่าสุด: `Walk-in จ่ายแล้ว => PAID+OUT`, `Walk-in ค้างจ่าย => PENDING_PAYMENT+RESERVE`, `Pickup later => READY_FOR_PICKUP+RESERVE` (จ่ายแล้วตั้ง `paymentStatus=PAID` แต่ยังไม่ OUT), และออนไลน์เริ่มที่ `PENDING_PAYMENT+RESERVE`
  - ฝั่ง API `PATCH /api/orders/[orderId]` เปิดให้ `confirm_paid`/`submit_payment_slip` ใช้ได้กับสถานะ `READY_FOR_PICKUP`; `confirm_paid` รองรับเคสรับสินค้าหน้าร้านที่จ่ายล่วงหน้า (`READY_FOR_PICKUP + paymentStatus=PAID`) เพื่อปล่อยจอง+ตัดสต็อกโดยไม่บังคับสลิปซ้ำ, และการ `cancel` จากสถานะนี้จะปล่อยจองสต็อก (`RELEASE`) กลับ
  - อัปเดต flow COD ในหน้า detail/route:
    - `mark_packed` รองรับ COD จาก `PENDING_PAYMENT` และจะลง movement `RELEASE+OUT` ตอนแพ็ก (ไม่ต้องรอ paid)
    - `confirm_paid` สำหรับ COD ใช้ปิดยอดหลัง `SHIPPED` เท่านั้น โดยอัปเดต `paymentStatus=COD_SETTLED` + `codSettledAt`
    - เพิ่ม action `mark_cod_returned` สำหรับ COD ตีกลับจาก `SHIPPED + COD_PENDING_SETTLEMENT` เพื่อคืนสต็อก (`RETURN`) และเปลี่ยนสถานะเป็น `COD_RETURNED` (`paymentStatus=FAILED`)
    - เพิ่ม permission ใหม่ `orders.cod_return` สำหรับ action `mark_cod_returned` และบังคับใช้งานแบบ strict (เลิก fallback `orders.ship`)
    - เพิ่มคอลัมน์ `orders.cod_returned_at` และเซ็ตตอนตีกลับสำเร็จ
  - หน้า `/reports` เพิ่ม section `สรุป COD`: ค้างเก็บเงิน, ปิดยอดวันนี้, ตีกลับวันนี้, ตีกลับสะสม, COD สุทธิสะสม และแยกผลตามผู้ให้บริการขนส่ง (daily return ใช้ `cod_returned_at`)
  - ผู้ใช้เลือกสินค้าในหน้า POS ก่อน แล้วกด `ชำระเงิน / กรอกรายละเอียด` เพื่อเปิด Checkout sheet (ลูกค้า/ชำระเงิน/ที่อยู่)
  - sticky action bar บนมือถือปรับเป็น summary + ปุ่มลัด `ตะกร้า` และปุ่มหลักเดียว `ถัดไป: ชำระเงิน` เพื่อให้ flow checkout ง่ายขึ้น
  - ปุ่ม `ตะกร้า` บน sticky bar มือถือขยายพื้นที่กดและเพิ่มขนาดตัวอักษร (`h-9`, `text-sm`, `font-semibold`) เพื่อกดง่ายขึ้น
  - รีดีไซน์ `/orders/new` รอบล่าสุดเป็น `Scan-First POS`:
    - Desktop (`>=1200px`) เป็น 3 คอลัมน์ (`หมวด/ทางลัด`, `สินค้า`, `ตะกร้า`)
    - Tablet (`768-1199px`) เป็น 2 คอลัมน์ (`สินค้า`, `ตะกร้า`)
    - Mobile (`<768px`) คง 1 คอลัมน์ + sticky checkout bar
  - เพิ่ม step indicator 3 ขั้นด้านบน (`เพิ่มสินค้า`, `ตรวจตะกร้า`, `ชำระเงิน`) เพื่อให้เห็น progress ชัดเจนขึ้นระหว่างทำรายการ
  - ตะกร้าใน tablet/desktop ปรับเป็น inline editor ที่แผงขวา (แก้หน่วย, ปรับจำนวน, ลบสินค้า) ลดการสลับเข้าออก sheet ระหว่างคิดบิล
  - ปุ่ม `สแกนบาร์โค้ด` บนแถบค้นหา `/orders/new` เปลี่ยนจากข้อความเป็น icon-only button พร้อม `aria-label` และ `title`
  - Cart sheet มี action ต่อไป Checkout ได้ทันที และยังกลับไปเลือกสินค้าได้
  - เพิ่ม guard permission ในหน้าใหม่: ถ้าไม่มี `orders.view` จะไม่ให้เข้า และถ้าไม่มี `orders.create` จะเห็นข้อความไม่มีสิทธิ์สร้าง
  - ซ่อน bottom tab navigation อัตโนมัติเมื่ออยู่หน้า `/orders/new` และลดความสูงจองพื้นที่ nav เพื่อให้โหมด create บนมือถือโฟกัสมากขึ้น
  - ปุ่ม back บน navbar สำหรับหน้า `/orders/new` เปลี่ยน label เป็น `กลับรายการออเดอร์` และใช้ custom confirm dialog ก่อนออกเมื่อมี draft ค้าง (แทน browser confirm)
  - ถอดลิงก์ `กลับไปหน้ารายการขาย` ด้านล่างหน้าออก เพื่อลดปุ่มซ้ำและให้ผู้ใช้ใช้ปุ่ม back ใน navbar เป็นทางหลัก
  - checkout sheet ปรับให้ flow กระชับขึ้นโดยตัดปุ่ม `เปิดตะกร้า` ใน step รายละเอียดออก (คงปุ่มกลับไปเลือกสินค้า)
  - เพิ่ม fallback ชื่อลูกค้าอัตโนมัติทั้งฝั่ง client+API เมื่อไม่กรอกชื่อ (`ลูกค้าหน้าร้าน` / `ลูกค้าออนไลน์`)

- เพิ่มฟีเจอร์ราคาขายหน่วยแปลงแบบกำหนดเอง (optional):
  - schema `product_units` เพิ่มคอลัมน์ `price_per_unit` (nullable)
  - ฟอร์มเพิ่ม/แก้ไขสินค้าใน `/products` เพิ่มช่องราคาต่อหน่วยแปลงต่อแถว (เช่น PACK) โดยถ้าไม่กรอกจะใช้สูตรเดิม `ราคาหน่วยหลัก x ตัวคูณ`
  - การคำนวณยอดใน `/orders` และ `/orders/new` รวมถึง `POST /api/orders` เปลี่ยนเป็นใช้ราคาของหน่วยที่ผู้ใช้เลือกจริง
  - fallback compatibility: ข้อมูลสินค้าเดิมที่ไม่มี `price_per_unit` ยังทำงานได้เหมือนเดิม
  - อัปเดต `scripts/repair-migrations.mjs` ให้เติมคอลัมน์ `product_units.price_per_unit` อัตโนมัติสำหรับฐานที่ข้าม migration
  - ปรับ UI มือถือในส่วน `การแปลงหน่วย` ให้แถวกรอกข้อมูลเป็น 2 บรรทัด (บรรทัดแรกเลือกหน่วย+ลบ, บรรทัดสองกรอกตัวคูณ+ราคา) เพื่อลดความแคบและพิมพ์ผิด

- ปรับ UX ฟอร์มสร้างออเดอร์หน้า `/orders` ให้เป็น mobile-first แบบ POS-lite:
  - เพิ่ม quick add section (`ค้นหา SKU/ชื่อ/บาร์โค้ด`) และการ์ดสินค้าแบบแตะครั้งเดียวเพื่อเพิ่มเข้าตะกร้า
  - คง flow สแกนบาร์โค้ด + fallback manual search เดิม แต่จัด hierarchy ให้เพิ่มสินค้าได้เร็วขึ้น
  - บนมือถือ แสดง cart preview แบบย่อ (2 รายการแรก) และปุ่ม sticky `ดูตะกร้า`
  - เพิ่ม `ตะกร้าสินค้า` sheet สำหรับแก้จำนวน (+/-), เปลี่ยนหน่วย, ลบรายการ และดูยอดรวมก่อนกดสร้างออเดอร์
  - บน tablet/desktop คง row editor รายการสินค้าแบบเดิมเพื่อแก้รายละเอียดได้รวดเร็ว

- ปรับแท็บ `/stock?tab=inventory` เพิ่ม filter หมวดหมู่สินค้า:
  - หน้า `ดูสต็อก` เพิ่ม dropdown `ทุกหมวดหมู่/หมวดหมู่สินค้า` และผูกกับ URL query `inventoryCategoryId`
  - ขยาย API `GET /api/stock/products` ให้รองรับ query `categoryId` เพื่อกรองข้อมูลแบบ server-side ให้ตรงกับ pagination
  - เมื่อเปลี่ยนหมวดหมู่ ระบบจะ reload หน้า 1 อัตโนมัติ (ไม่ใช้แค่กรอง client-side บนข้อมูลที่โหลดมาแล้ว)

- ปรับ UI หน้า `/products` (mobile):
  - แก้ตำแหน่งปุ่มลอย `เพิ่มสินค้า` (FAB) จาก `bottom-20` เป็นการคำนวณจาก `--bottom-tab-nav-height + env(safe-area-inset-bottom)` เพื่อลดเคสปุ่มทับ bottom tab bar ตอนเลื่อนหน้า

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

- รองรับการตั้งราคาขายแพ็ก/กล่องที่ไม่ต้องเป็นสัดส่วนตรงกับหน่วยย่อย (เช่น EA 1,000 แต่ PACK 12 = 10,000)
- ลดข้อผิดพลาดในยอดออเดอร์เมื่อขายด้วยหน่วยแปลง เพราะ UI/API ใช้ราคาต่อหน่วยที่เลือกตรงกัน
- ลดความหนาแน่นของฟอร์มบนมือถือในหน้าเพิ่ม/แก้ไขสินค้า ทำให้กรอกตัวคูณและราคาแพ็กได้ง่ายขึ้น
- ลดการกดหลุด flow ระหว่างสร้างออเดอร์ เพราะหน้า `/orders/new` ไม่แสดงเมนูล่างหลักชั่วคราว
- ลดการออกจากหน้า create order โดยไม่ตั้งใจ เพราะปุ่ม back จะยืนยันก่อนออกเมื่อมีข้อมูลค้าง
- เอกสารออเดอร์/สลิป/งานพิมพ์ไม่ว่างชื่อผู้รับ แม้ผู้ใช้ไม่กรอกชื่อเอง
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

- `lib/db/schema/tables.ts`
- `drizzle/0034_spooky_talos.sql`
- `drizzle/meta/0034_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/repair-migrations.mjs`
- `lib/products/validation.ts`
- `lib/products/service.ts`
- `components/app/products-management.tsx`
- `app/api/products/route.ts`
- `app/api/products/[productId]/route.ts`
- `lib/orders/queries.ts`
- `components/app/orders-management.tsx`
- `components/app/bottom-tab-nav.tsx`
- `components/app/app-top-nav.tsx`
- `components/ui/menu-back-button.tsx`
- `lib/orders/new-order-draft.ts`
- `app/(app)/orders/new/page.tsx`
- `app/api/orders/route.ts`
- `docs/API_INVENTORY.md`
- `docs/SCHEMA_MAP.md`
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
- เปิด `/products` > เพิ่ม/แก้ไขสินค้า:
  - ตั้งตัวอย่าง `ราคาหน่วยหลัก (EA)=1000`
  - เพิ่มหน่วยแปลง `PACK` ตัวคูณ `12` แล้วกรอก `ราคาต่อหน่วยแปลง=10000`
  - บันทึกแล้วเปิด Product Detail tab `ราคา` ต้องเห็นราคา PACK เป็น `10000` (ไม่ใช่ `12000`)
- เปิด `/orders/new` หรือ modal สร้างออเดอร์ใน `/orders`:
  - เพิ่มสินค้าตัวอย่างข้างต้น แล้วเปลี่ยนหน่วยเป็น `PACK`
  - ยอดรวมบรรทัดต้องคำนวณตาม `10000 x จำนวน` และยอดรวมทั้งออเดอร์ต้องตรงกันกับฝั่ง API ตอนบันทึก
- เปิด `/orders/new` แล้วเพิ่มสินค้าอย่างน้อย 1 รายการ จากนั้นกดปุ่ม back บน navbar:
  - ต้องเห็น confirm เตือนข้อมูลค้าง
  - กด `ยกเลิก` ต้องยังอยู่หน้าเดิมและข้อมูลไม่หาย
  - กด `ตกลง` ต้องกลับ `/orders`
- เปิด `/orders/new` แล้วไม่กรอกชื่อลูกค้า จากนั้นบันทึกออเดอร์:
  - ถ้า channel = `WALK_IN` ชื่อในออเดอร์ต้อง fallback เป็น `ลูกค้าหน้าร้าน`
  - ถ้า channel = `FACEBOOK/WHATSAPP` ชื่อในออเดอร์ต้อง fallback เป็น `ลูกค้าออนไลน์` (เมื่อไม่มีชื่อจาก contact)
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

## Changed

- ตัด fallback/read path ของก้อน `platform/settings` หลายจุดให้ใช้ PostgreSQL-first แล้วใน
  - `lib/auth/system-admin.ts`
  - `lib/auth/store-creation.ts`
  - `lib/system-admin/dashboard.ts`
  - `lib/system-admin/superadmins.ts`
  - `lib/system-config/policy.ts`
  - `lib/rbac/catalog.ts`
  - `lib/rbac/access.ts`
  - `lib/branches/access.ts`
- เปลี่ยนหน้า server-rendered ที่เคยดึง Turso ตรงให้ใช้ PostgreSQL helper แล้วใน
  - `app/(app)/layout.tsx`
  - `app/(app)/settings/page.tsx`
  - `app/(app)/settings/store/page.tsx`
  - `app/(app)/settings/store/payments/page.tsx`
- เพิ่ม helper ใน `lib/platform/postgres-store-settings.ts`
  - `getStoreSettingsHomeSummaryFromPostgres(...)`
  - `getStoreChannelConnectionsFromPostgres(...)`

## Impact

- runtime caller ของ `lib/db/turso-lazy.ts` ลดจาก `71` เหลือ `59`
- app shell, system-admin helpers, RBAC/branch access, และหน้าตั้งค่าหลักของร้านไม่ต้องย้อน Turso ใน runtime ปกติแล้ว
- dev machine นี้ยังเป็น PostgreSQL-first เหมือนเดิม และ `lint/build` ผ่านหลังรอบนี้

## Files

- [lib/auth/system-admin.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/system-admin.ts)
- [lib/auth/store-creation.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/store-creation.ts)
- [lib/system-admin/dashboard.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/dashboard.ts)
- [lib/system-admin/superadmins.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/superadmins.ts)
- [lib/system-config/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-config/policy.ts)
- [lib/rbac/catalog.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/catalog.ts)
- [lib/rbac/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/rbac/access.ts)
- [lib/branches/access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/access.ts)
- [lib/platform/postgres-store-settings.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings.ts)
- [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx)
- [app/(app)/settings/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/page.tsx)
- [app/(app)/settings/store/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/page.tsx)
- [app/(app)/settings/store/payments/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/payments/page.tsx)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "from ['\\\"]@/lib/db/turso-lazy['\\\"]|from \\\"@/lib/db/turso-lazy\\\"|from '@/lib/db/turso-lazy'" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `59`

## Next step

- ไปที่ `purchase.service / purchase.repo` ก่อน เพราะเป็น caller ใหญ่ที่ยังเหลือและแตะ transaction/write flow จริง
- จากนั้นค่อยเก็บกลุ่ม `settings users/roles/superadmin pages + related APIs`

## Changed

- เปลี่ยน [purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts) ให้ใช้ PostgreSQL transaction (`runInTransaction`) ทุก write flow แทน Turso transaction เดิม
- rewrite [purchase.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/purchase.repo.ts) เป็น PostgreSQL raw SQL ทั้งหมด
- purchase read/write ภายใน service/repo ไม่แตะ `getTursoDb()` แล้ว

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `39` เหลือ `35`
- purchase domain ใน dev ขยับเป็น PostgreSQL-first ทั้ง read + core write service layer แล้ว
- idempotency path ยังเป็น legacy Turso อยู่ แต่ไม่ผูก transaction purchase แล้ว

## Files

- [purchase.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/purchase.service.ts)
- [purchase.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/purchase.repo.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `35`

## Next step

- ไปที่ [audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts) และ [idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts) ต่อ เพราะเป็น caller กลางที่ยังทำให้หลายโดเมนย้อนเข้า Turso
- จากนั้นค่อยเก็บ [order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts) กับ [order-shipment.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/order-shipment.repo.ts)

## Changed

- เปลี่ยน [audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts) เป็น PostgreSQL raw SQL ทั้งหมด
- เปลี่ยน [idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts) เป็น PostgreSQL raw SQL ทั้งหมด
- ปรับ [order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts) ให้ไม่ส่ง Turso tx เข้า `markIdempotencySucceeded(...)`

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `35` เหลือ `33`
- audit/idempotency กลายเป็น PostgreSQL-first แล้ว และไม่เป็นตัวดึงหลายโดเมนย้อนเข้า Turso อีก
- cleanup cron ของ idempotency ใช้ PostgreSQL แล้ว

## Files

- [audit.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/audit.service.ts)
- [idempotency.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/idempotency.service.ts)
- [order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `33`

## Next step

- ไปที่ [order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts) และ [order-shipment.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/order-shipment.repo.ts)
- หลังจากนั้นค่อยเก็บ [notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts) หรือกลุ่ม [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts) ตาม impact ที่ต้องการ

## Changed

- เปลี่ยน [order-shipment.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/order-shipment.repo.ts) เป็น PostgreSQL raw SQL ทั้งหมด
- เปลี่ยน [order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts) ให้ใช้ PostgreSQL transaction (`runInTransaction`) และ PostgreSQL audit insert

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `33` เหลือ `31`
- order shipment label flow ไม่ย้อนเข้า Turso แล้วใน service/repo คู่นี้
- order shipment reuse/create path ยังใช้ business behavior เดิม แต่ backend transaction/read-write เป็น PostgreSQL แล้ว

## Files

- [order-shipment.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/order-shipment.repo.ts)
- [order-shipment.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/order-shipment.service.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `31`

## Next step

- ไปที่ [server/services/notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts) ก่อน เพราะเป็น service caller ใหญ่ถัดไป
- จากนั้นค่อย [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts)

## Changed

- เปลี่ยน [notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts) ให้เป็น PostgreSQL-only wrapper
- ตัด Turso fallback/read-write branch ออกจาก `getNotificationInbox`, `markNotificationAction`, `updateNotificationRule`, และ `runPurchaseApReminderCron`
- คง `NotificationServiceError` และ mapping ข้อความภาษาไทยเดิมไว้ เพื่อไม่ให้ route/UI behavior เปลี่ยน

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `31` เหลือ `30`
- notification domain ใน dev ไม่ย้อนเข้า Turso ผ่าน service layer แล้ว
- cron `ap-reminders` และ notifications inbox/rules ใช้ PostgreSQL path ตรงใน service แล้ว

## Files

- [notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `30`

## Next step

- ไปที่ [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts) ก่อน เพราะเป็น caller ใหญ่ถัดไปที่ยังลด Turso dependency ได้คุ้ม
- จากนั้นค่อยเก็บ route/API callers ฝั่ง `products/units/settings`

## Changed

- เปลี่ยน [products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts) ให้เป็น PostgreSQL-only wrapper
- ตัด Turso fallback/read branch ออกจาก `listUnits`, `listStoreProducts`, `listStoreProductsPage`, `getStoreProductSummaryCounts`, `listStoreProductModelNames`, `getNextVariantSortOrderByModelName`, `listVariantLabelsByModelName`, `getStoreProductThresholds`, และ `listCategories`
- ลบ dead code ฝั่ง Drizzle/Turso ของ products read service และคง type exports เดิมไว้เพื่อไม่ให้ route/UI แตก

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `30` เหลือ `29`
- products read service ใน dev ไม่ย้อนเข้า Turso แล้ว
- products domain ขยับเข้าใกล้ all-Postgres มากขึ้น โดยเหลือ cleanup หลักที่ route/API callers ฝั่ง products/units/settings

## Files

- [products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `29`

## Next step

- ไปที่ [app/api/products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts), [app/api/products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts), [app/api/products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts), [app/api/units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts), และ [app/api/units/[unitId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/[unitId]/route.ts)
- หลังจากนั้นค่อยเก็บ legacy compare/backfill tooling และ `TURSO_*` runtime env/docs

## Changed

- เปลี่ยน [products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts), [products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts), [products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts), [units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts), [units/[unitId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/[unitId]/route.ts), และ [products/generate-barcode/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/generate-barcode/route.ts) ให้ใช้ PostgreSQL path ตรง
- ตัด Turso fallback/write branch และ Drizzle mutation logic เก่าออกจาก routes กลุ่ม products/units
- ย้าย barcode generation ไปอ่าน `products.barcode` ผ่าน PostgreSQL query ตรง

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `29` เหลือ `23`
- products/units API ใน dev เป็น PostgreSQL-first แล้วทั้ง read helper และ write routes หลัก
- cleanup wave นี้ลด caller ได้ `6` ไฟล์ในรอบเดียว ซึ่งเป็นก้อนใหญ่สุดหลังจาก service layer ถูกย้ายแล้ว

## Files

- [products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts)
- [products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts)
- [products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts)
- [products/generate-barcode/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/generate-barcode/route.ts)
- [units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts)
- [units/[unitId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/[unitId]/route.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `23`

## Next step

- ไปที่ [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts), [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts), [app/api/settings/users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts), [app/api/settings/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts), [app/api/settings/roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts), และ [app/api/settings/roles/[roleId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/[roleId]/route.ts)
- หลังจากนั้นค่อยเก็บก้อน `auth/onboarding/branches/system-admin` ที่ยังเหลือ และเริ่มแยก compare/backfill tooling เป็น legacy ชัด ๆ

## Changed

- เปลี่ยน [store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET`, `PATCH` แบบ JSON, และ `PATCH` แบบ `multipart/form-data`
- เปลี่ยน [pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/PATCH`
- เปลี่ยน [payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/POST/PATCH/DELETE`

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `23` เหลือ `20`
- `store settings + payment accounts` ใน dev เป็น PostgreSQL-first ทั้ง read/write หลักแล้ว
- routing ฝั่ง settings/store ไม่ย้อนเข้า Turso อีก ยกเว้นโดเมนที่ยังเหลือแยกต่างหาก เช่น `shipping-providers`

## Files

- [store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
- [pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
- [payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `20`

## Next step

- ไปที่ [app/api/settings/users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts), [app/api/settings/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts), [app/api/settings/roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts), และ [app/api/settings/roles/[roleId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/[roleId]/route.ts)
- หลังจากนั้นค่อยเก็บ [app/api/settings/store/shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts), [app/api/settings/account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts), และกลุ่ม `auth/onboarding/branches/system-admin`

## Changed

- เปลี่ยน [users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/POST`
- เปลี่ยน [users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/PATCH`
- เปลี่ยน [roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts) ให้ใช้ PostgreSQL path ตรงแล้ว
- เปลี่ยน [roles/[roleId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/[roleId]/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/PATCH`

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `20` เหลือ `16`
- `settings users/roles` ใน dev เป็น PostgreSQL-first แล้วทั้ง read และ mutation หลัก
- owner guard, membership upsert, role permission update, reset password, session limit update และ member status/role update ไม่ย้อนเข้า Turso อีก

## Files

- [users/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/route.ts)
- [users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts)
- [roles/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/route.ts)
- [roles/[roleId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/roles/[roleId]/route.ts)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `16`

## Next step

- ไปที่ [app/api/settings/account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts), [app/api/settings/store/shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts), และ [app/api/settings/users/candidates/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/candidates/route.ts)
- หลังจากนั้นค่อยเก็บกลุ่ม [app/api/auth/login/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/login/route.ts), [app/api/auth/signup/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/signup/route.ts), [app/api/onboarding/channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts), [app/api/onboarding/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/store/route.ts), [app/api/stores/branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts), [app/api/stores/branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts), และกลุ่ม `system-admin`

## Changed

- เปลี่ยน [account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/PATCH`
- เปลี่ยน [shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/POST/PATCH/DELETE`
- เปลี่ยน [users/candidates/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/candidates/route.ts) ให้ใช้ PostgreSQL path ตรงแล้ว

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `16` เหลือ `13`
- `settings/account`, `shipping providers`, และ `add-existing user candidates` ไม่ย้อนเข้า Turso แล้ว
- ตอนนี้ก้อน settings หลักของ runtime ถูกย้ายไป PostgreSQL เกือบครบแล้ว

## Files

- [account/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/account/route.ts)
- [shipping-providers/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/shipping-providers/route.ts)
- [users/candidates/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/candidates/route.ts)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `13`

## Next step

- ไปที่ [app/api/auth/login/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/login/route.ts), [app/api/auth/signup/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/signup/route.ts), [app/api/onboarding/channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts), และ [app/api/onboarding/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/store/route.ts)
- จากนั้นค่อยเก็บ [app/api/stores/branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts), [app/api/stores/branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts), [lib/branches/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts), และกลุ่ม `system-admin`

## Changed

- เปลี่ยน [login/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/login/route.ts) ให้ใช้ PostgreSQL path ตรงแล้ว
- เปลี่ยน [signup/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/signup/route.ts) ให้ใช้ PostgreSQL path ตรงแล้ว
- เปลี่ยน [channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts) ให้ใช้ PostgreSQL path ตรงแล้วทั้ง `GET/POST`
- เปลี่ยน [store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/store/route.ts) ให้ใช้ PostgreSQL transaction ตรงแล้วสำหรับ create store
- เปลี่ยน [onboarding-channels.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/onboarding-channels.repo.ts) และ [onboarding-channels.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/onboarding-channels.service.ts) ให้ไม่ย้อนกลับ Turso แล้ว

## Impact

- runtime callers ของ [turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) ลดจาก `13` เหลือ `8`
- flow เข้าใช้งาน (`login/signup`) และ flow onboarding หลัก (`channels/create store`) ของ dev machine นี้วิ่ง PostgreSQL-first แล้ว
- ก้อนที่ยังเหลือเป็น `branches + system-admin + dashboard repo` เป็นหลัก

## Files

- [login/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/login/route.ts)
- [signup/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/auth/signup/route.ts)
- [channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts)
- [store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/store/route.ts)
- [onboarding-channels.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/onboarding-channels.repo.ts)
- [onboarding-channels.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/onboarding-channels.service.ts)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `8`

## Next step

- ไปที่ [app/api/stores/branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts), [app/api/stores/branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts), และ [lib/branches/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts)
- จากนั้นค่อยเก็บ [app/api/system-admin/config/stores/[storeId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/stores/[storeId]/route.ts), [app/api/system-admin/config/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/users/[userId]/route.ts), [app/api/system-admin/superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts), [app/api/system-admin/superadmins/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/[userId]/route.ts), และ [server/repositories/dashboard.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/dashboard.repo.ts)

## Changed

- เปลี่ยน [branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts), [branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts), และ [lib/branches/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts) ให้ใช้ PostgreSQL path ตรงแล้ว
- เปลี่ยน [config/stores/[storeId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/stores/[storeId]/route.ts), [config/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/users/[userId]/route.ts), [superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts), และ [superadmins/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/[userId]/route.ts) ให้ใช้ PostgreSQL path ตรงแล้ว
- rewrite [dashboard.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/dashboard.repo.ts) ให้ aggregate sales/orders/pending count ใช้ PostgreSQL raw SQL แล้ว

## Impact

- runtime callers ของ `getTursoDb()` ใน `app/lib/server` ลดจาก `8` เหลือ `0`
- dev runtime ของแอปตอนนี้เป็น `PostgreSQL-only` แล้ว
- Turso เหลือสำหรับ compare/backfill/repair tooling เท่านั้น ไม่ใช่ runtime path ของแอปอีกต่อไป

## Files

- [branches/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts)
- [branches/switch/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts)
- [policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts)
- [config/stores/[storeId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/stores/[storeId]/route.ts)
- [config/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/users/[userId]/route.ts)
- [superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts)
- [superadmins/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/[userId]/route.ts)
- [dashboard.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/dashboard.repo.ts)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -l "getTursoDb\\(" app lib server | sort | wc -l`
  - รอบล่าสุดต้องได้ `0`

## Next step

- แยก compare/backfill/repair scripts ที่ยังอิง Turso ให้เป็น `legacy tooling` ชัด ๆ
- จากนั้นค่อยลด/ลบ `TURSO_*` ออกจาก runtime env/docs

## Changed

- ลบ [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts) เพราะไม่มี runtime caller เหลือแล้ว
- เพิ่ม [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md) เพื่อแยก Turso/Drizzle ให้เป็น legacy tooling ชัด ๆ
- ปรับ [docs/drizzle-migrations.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/drizzle-migrations.md) ให้ระบุว่าเป็น legacy SQLite/Turso tooling docs ไม่ใช่ runtime docs
- ปรับ [docs/postgres-turso-drizzle-retirement-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-drizzle-retirement-plan.md) และ [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md) ให้สรุปว่า runtime retirement เสร็จแล้วใน dev

## Impact

- dev runtime ของแอปยังเป็น `PostgreSQL-only` เหมือนเดิม แต่ตอนนี้ path ฝั่ง Turso ถูกจำกัดเหลือเฉพาะ legacy tooling/doc/config แล้ว
- `.env.example` ระบุชัดขึ้นว่า `TURSO_*` ไม่ใช่ runtime env หลัก
- team handoff ชัดขึ้นว่าจากนี้ควรเก็บ compare/backfill/repair tooling ต่อ ไม่ใช่ runtime migration แล้ว

## Files

- [lib/db/turso-lazy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/turso-lazy.ts)
- [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md)
- [docs/drizzle-migrations.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/drizzle-migrations.md)
- [docs/postgres-turso-drizzle-retirement-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-drizzle-retirement-plan.md)
- [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)
- [docs/CONTEXT_INDEX.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CONTEXT_INDEX.md)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example)

## How to verify

- `rg -n "getTursoDb\\(|turso-lazy" app lib server scripts`
  - รอบล่าสุดต้องไม่เจอ runtime caller
- `npm run lint`
- `npm run build`

## Next step

- หลังจากนี้ให้ใช้ namespace `legacy:*` เป็นชื่อหลักของคำสั่ง LibSQL/Drizzle tooling
- จากนั้นค่อยพิจารณาลด/ลบ [legacy/libsql/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/legacy/libsql/client.ts), [legacy/drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/legacy/drizzle.config.ts), และ `legacy/drizzle/` เมื่อทีมไม่ต้องใช้ tooling ฝั่ง Turso แล้ว

## Changed

- ปรับ [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) และ [drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/drizzle.config.ts) ให้รองรับ `LEGACY_LIBSQL_DATABASE_URL` / `LEGACY_LIBSQL_AUTH_TOKEN` เป็นชื่อ env หลักของ legacy tooling
- ปรับ [scripts/load-local-env.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/load-local-env.mjs) ให้โหลด `.env`/`.env.local` ตรง โดยไม่ต้องมี `TURSO_*` alias แล้ว
- ปรับ scripts legacy ที่ไม่ผ่าน `load-local-env` แล้วใน:
  - [scripts/repair-migrations.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/repair-migrations.mjs)
  - [scripts/seed.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/seed.mjs)
  - [scripts/cleanup-idempotency.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/cleanup-idempotency.mjs)
  - [scripts/smoke-idempotency-tx.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-idempotency-tx.mjs)
  - [scripts/benchmark-onboarding-channels.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/benchmark-onboarding-channels.mjs)
- ปรับ [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example) และ [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md) ให้เหลือ `LEGACY_LIBSQL_*` เป็นชื่อหลักของ legacy tooling
- รอบตรวจล่าสุดตัด alias mapping ที่ค้างจริงใน [scripts/load-local-env.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/load-local-env.mjs) ออกแล้ว ทำให้ config/scripts ปัจจุบันไม่ต้องพึ่ง `TURSO_*` อีก
- เพิ่ม namespace `legacy:*` ใน [package.json](/Users/csl-dev/Desktop/alex/csb-pos/package.json) สำหรับ Drizzle/LibSQL tooling และรอบล่าสุดลบ alias ชื่อเดิมออกแล้ว
- ปรับ docs หลักให้ใช้คำสั่ง `legacy:*` แล้วใน [docs/drizzle-migrations.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/drizzle-migrations.md), [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md), [docs/ARCHITECTURE.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/ARCHITECTURE.md), และ [docs/SCHEMA_MAP.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/SCHEMA_MAP.md)
- ย้าย [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts) ไปเป็น [legacy/libsql/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/legacy/libsql/client.ts) และย้าย [drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/drizzle.config.ts) ไปเป็น [legacy/drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/legacy/drizzle.config.ts)
- ปรับ `legacy:db:*` scripts ใน [package.json](/Users/csl-dev/Desktop/alex/csb-pos/package.json) ให้เรียก `drizzle-kit` ผ่าน `--config legacy/drizzle.config.ts`
- ย้ายโฟลเดอร์ [drizzle/](/Users/csl-dev/Desktop/alex/csb-pos/drizzle) ไปเป็น [legacy/drizzle/](/Users/csl-dev/Desktop/alex/csb-pos/legacy/drizzle) และปรับ `out` ใน [legacy/drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/legacy/drizzle.config.ts) ให้ตรงแล้ว
- เพิ่ม [docs/legacy-tooling-deletion-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/legacy-tooling-deletion-audit.md) เพื่อสรุปชัดว่าอะไรลบได้/ยังลบไม่ได้ในฝั่ง LibSQL/Drizzle

## Impact

- runtime app ยังเป็น `PostgreSQL-only` เหมือนเดิม
- tooling ฝั่ง legacy เริ่มหลุดจากชื่อ `TURSO_*` แล้ว โดยใช้ `LEGACY_LIBSQL_*` เป็นชื่อหลัก
- command ของ legacy tooling ถูกแยก namespace ชัดขึ้นแล้ว ทำให้ฝั่ง PostgreSQL runtime กับฝั่ง LibSQL/Drizzle tooling ไม่ปนกัน
- root ของ repo สะอาดขึ้น เพราะไฟล์ LibSQL/Drizzle runtime-tooling ถูกย้ายออกไปอยู่ใต้ `legacy/` แล้ว
- SQL migrations ของ LibSQL/Drizzle ก็ถูกรวมไปอยู่ใต้ `legacy/` แล้วเช่นกัน
- audit ล่าสุดยืนยันว่า legacy tooling ที่เหลือยังมี consumer จริงทุกก้อน จึงยังไม่ควรลบ `@libsql/client` / `drizzle-orm` / `drizzle-kit` หรือ `legacy/` ทั้งก้อนในรอบนี้
- จากนี้ทีมสามารถค่อย ๆ ย้าย compare/backfill/repair scripts ไปใช้ `LEGACY_LIBSQL_*` ได้โดยไม่เสี่ยงพังคำสั่งเดิม

## Files

- [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts)
- [drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/drizzle.config.ts)
- [scripts/load-local-env.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/load-local-env.mjs)
- [scripts/repair-migrations.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/repair-migrations.mjs)
- [scripts/seed.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/seed.mjs)
- [scripts/cleanup-idempotency.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/cleanup-idempotency.mjs)
- [scripts/smoke-idempotency-tx.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/smoke-idempotency-tx.mjs)
- [scripts/benchmark-onboarding-channels.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/benchmark-onboarding-channels.mjs)
- [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example)
- [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md)
- [docs/drizzle-migrations.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/drizzle-migrations.md)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -n "LEGACY_LIBSQL_DATABASE_URL|LEGACY_LIBSQL_AUTH_TOKEN" lib scripts drizzle.config.ts .env.example docs`

## Next step

- เปลี่ยน scripts กลุ่ม `backfill-postgres-*` และ `compare-postgres-*` ให้ใช้ `LEGACY_LIBSQL_*` ตรงทีละชุด และค่อยลดการอ้าง `TURSO_*` ลงจนเหลือศูนย์
- หลังจากนั้นค่อยพิจารณา rename คำสั่ง legacy ให้ชัดขึ้น เช่น `legacy:*` และประเมินลบ [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts), [drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/drizzle.config.ts), และ `drizzle/`

## Changed

- ปรับ scripts กลุ่ม `backfill-postgres-*` และ `compare-postgres-*` ชุดหลักให้ใช้ `LEGACY_LIBSQL_DATABASE_URL` / `LEGACY_LIBSQL_AUTH_TOKEN` เป็นชื่อ env หลักแล้ว
- scripts ที่แก้ครอบโดเมน:
  - `orders`
  - `auth-rbac`
  - `settings-system-admin`
  - `store-settings`
  - `notifications`
  - `products-units-onboarding`
  - `product-variants`
  - `purchase`
  - `inventory`
  - `branches`
  - `reports`

## Impact

- flow compare/backfill หลักของการย้ายจาก Turso -> PostgreSQL เริ่มหลุดจากชื่อ `TURSO_*` แล้ว
- ตอนนี้ `TURSO_*` ไม่ถูกอ้างตรงใน scripts กลุ่มนี้แล้ว และ compatibility alias ก็ถูกถอดออกจาก `load-local-env`/`.env.example` แล้ว
- app runtime ยังเป็น `PostgreSQL-only` เหมือนเดิม

## Files

- [scripts/backfill-postgres-auth-rbac-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-auth-rbac-read.mjs)
- [scripts/backfill-postgres-inventory-movements.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-inventory-movements.mjs)
- [scripts/backfill-postgres-notifications.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-notifications.mjs)
- [scripts/backfill-postgres-orders-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-orders-read.mjs)
- [scripts/backfill-postgres-product-variants-foundation.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-product-variants-foundation.mjs)
- [scripts/backfill-postgres-products-units-onboarding-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-products-units-onboarding-read.mjs)
- [scripts/backfill-postgres-purchase-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-purchase-read.mjs)
- [scripts/backfill-postgres-settings-system-admin-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-settings-system-admin-read.mjs)
- [scripts/backfill-postgres-store-settings-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/backfill-postgres-store-settings-read.mjs)
- [scripts/compare-postgres-auth-rbac-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-auth-rbac-read.mjs)
- [scripts/compare-postgres-branches.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-branches.mjs)
- [scripts/compare-postgres-inventory-parity.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-inventory-parity.mjs)
- [scripts/compare-postgres-notifications.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-notifications.mjs)
- [scripts/compare-postgres-orders-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-orders-read.mjs)
- [scripts/compare-postgres-product-variants-foundation.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-product-variants-foundation.mjs)
- [scripts/compare-postgres-products-units-onboarding-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-products-units-onboarding-read.mjs)
- [scripts/compare-postgres-purchase-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-purchase-read.mjs)
- [scripts/compare-postgres-reports-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-reports-read.mjs)
- [scripts/compare-postgres-settings-system-admin-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-settings-system-admin-read.mjs)
- [scripts/compare-postgres-store-settings-read.mjs](/Users/csl-dev/Desktop/alex/csb-pos/scripts/compare-postgres-store-settings-read.mjs)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)

## How to verify

- `rg -n "LEGACY_LIBSQL_DATABASE_URL|LEGACY_LIBSQL_AUTH_TOKEN" scripts | head -n 200`
- `npm run lint`
- `npm run build`

## Next step

- rename คำสั่ง legacy ให้ชัดขึ้น เช่น `legacy:*`
- จากนั้นค่อยประเมินลบ [lib/db/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/client.ts), [drizzle.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/drizzle.config.ts), และ `drizzle/`

## Changed

- ลบ `lib/products/variant-persistence.ts` เพราะไม่มี caller เหลือแล้ว และรวม logic variant persistence ไว้ที่ [lib/platform/postgres-products-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-write.ts) อย่างเดียว
- ลบ [legacy/libsql/client.ts](/Users/csl-dev/Desktop/alex/csb-pos/legacy/libsql/client.ts) เพราะไม่มี consumer เหลือใน runtime หรือ legacy scripts แล้ว
- ปรับเอกสาร source-of-truth ที่เกี่ยวข้องให้ตรงกับสถานะใหม่

## Impact

- runtime app ยังเป็น `PostgreSQL-only`
- legacy stack ฝั่ง LibSQL/Drizzle ลดลงอีก 1 ชั้น และไม่เหลือ legacy client wrapper แล้ว
- ของที่ยังเหลือฝั่ง legacy ตอนนี้คือ `legacy/drizzle.config.ts`, `legacy/drizzle/`, และ scripts compare/backfill/repair/seed ที่ยังเรียก `@libsql/client` ตรง

## Files

- [docs/CODEBASE_MAP.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CODEBASE_MAP.md)
- [docs/postgres-products-write-rollout-execution.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-products-write-rollout-execution.md)
- [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md)
- [docs/legacy-tooling-deletion-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/legacy-tooling-deletion-audit.md)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -n "legacy/libsql/client|variant-persistence" app lib server docs`

## Next step

- ถ้ายังต้องเก็บ compare/backfill/repair scripts ต่อ ให้คง `@libsql/client` ไว้ก่อน และประเมินลบ `legacy/drizzle.config.ts` กับ `legacy/drizzle/` เมื่อ legacy tooling ไม่จำเป็นแล้ว
- ถ้าทีมไม่ต้องใช้ legacy LibSQL tooling แล้ว wave ถัดไปควรเป็นการลบ `legacy/drizzle.config.ts`, `legacy/drizzle/`, `legacy:db:*`, และ dependencies `@libsql/client` / `drizzle-kit`

## Changed

- ลบ legacy LibSQL/Drizzle tooling ทั้งก้อนแล้ว:
  - `legacy/drizzle.config.ts`
  - `legacy/drizzle/`
  - scripts กลุ่ม compare/backfill/repair/seed/benchmark ที่อิง LibSQL
  - package scripts กลุ่ม `legacy:*`
  - dependency `@libsql/client`
  - devDependency `drizzle-kit`
- ลบโฟลเดอร์ว่าง `legacy/libsql/`
- ปรับ docs หลักให้เหลือ PostgreSQL เป็น source of truth เดียว

## Impact

- runtime app และ tooling ปัจจุบันเป็น `PostgreSQL-only`
- ไม่มี workflow ปัจจุบันที่ต้องใช้ `LEGACY_LIBSQL_*` แล้ว
- ของที่ยังเหลือฝั่ง Drizzle คือ `drizzle-orm` + schema files เท่านั้น ซึ่งเป็นคนละ phase กับการถอน Turso/LibSQL

## Files

- [package.json](/Users/csl-dev/Desktop/alex/csb-pos/package.json)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [docs/HANDOFF.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/HANDOFF.md)
- [docs/CODEBASE_MAP.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CODEBASE_MAP.md)
- [docs/ARCHITECTURE.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/ARCHITECTURE.md)
- [docs/drizzle-migrations.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/drizzle-migrations.md)
- [docs/turso-legacy-tooling.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/turso-legacy-tooling.md)
- [docs/legacy-tooling-deletion-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/legacy-tooling-deletion-audit.md)
- [docs/SCHEMA_MAP.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/SCHEMA_MAP.md)
- [.env.example](/Users/csl-dev/Desktop/alex/csb-pos/.env.example)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -n "@libsql/client|drizzle-kit|legacy:db:|LEGACY_LIBSQL|legacy/drizzle" .`

## Next step

- phase ถัดไปคือ `drizzle schema dependency cleanup`
- ให้ audit การใช้ `drizzle-orm` ที่ยังเหลือใน:
  - `lib/db/schema/tables.ts`
  - `lib/db/schema/index.ts`
  - helper/type อื่นที่ยัง import `drizzle-orm`

## Changed

- ลบ Drizzle schema/type layer ที่ไม่ถูกใช้งานแล้ว:
  - [lib/db/schema.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/schema.ts)
  - [lib/db/schema/index.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/schema/index.ts)
  - [lib/db/schema/tables.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/db/schema/tables.ts)
- เอา `drizzle-orm` ออกจาก [package.json](/Users/csl-dev/Desktop/alex/csb-pos/package.json)
- เอา `drizzle-orm` ออกจาก [next.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/next.config.ts)
- ปรับ docs หลักให้ชี้ `postgres/migrations/` เป็น schema source of truth เดียว

## Impact

- runtime app และ tooling ปัจจุบันเป็น `PostgreSQL-only`
- repo ไม่เหลือ dependency ฝั่ง Drizzle/LibSQL แล้ว
- schema source of truth เหลือเฉพาะ PostgreSQL migrations

## Files

- [package.json](/Users/csl-dev/Desktop/alex/csb-pos/package.json)
- [package-lock.json](/Users/csl-dev/Desktop/alex/csb-pos/package-lock.json)
- [next.config.ts](/Users/csl-dev/Desktop/alex/csb-pos/next.config.ts)
- [app/api/settings/notifications/inbox/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/notifications/inbox/route.ts)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [docs/API_INVENTORY.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/API_INVENTORY.md)
- [docs/ARCHITECTURE.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/ARCHITECTURE.md)
- [docs/CODEBASE_MAP.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/CODEBASE_MAP.md)
- [docs/SCHEMA_MAP.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/SCHEMA_MAP.md)
- [docs/legacy-tooling-deletion-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/legacy-tooling-deletion-audit.md)
- [docs/postgres-turso-drizzle-retirement-plan.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-drizzle-retirement-plan.md)
- [docs/orders-system-design.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/orders-system-design.md)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -n "drizzle-orm|lib/db/schema/tables\\.ts|lib/db/schema\\.ts" .`

## Next step

- phase ถัดไปคือ `historical docs scrub`
- เก็บ references เก่าในเอกสารย้อนหลัง เช่น `docs/HANDOFF.md`, `docs/postgres-staging-rollout.md`, และ `docs/postgresql-sequelize-migration.md` ให้ไม่อ้าง Turso/Drizzle path ที่ถูกลบแล้ว

## Changed

- scrub source-of-truth docs หลักให้ไม่ชี้ไป Turso/Drizzle workflow แล้ว:
  - [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md)
  - [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md)
  - [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)
  - [README.md](/Users/csl-dev/Desktop/alex/csb-pos/README.md)
- ปรับ messaging runtime ของ notifications ให้ไม่อ้าง `db:repair` แล้วใน [app/api/settings/notifications/inbox/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/notifications/inbox/route.ts)

## Impact

- เอกสารหลักของ repo ตรงกับสถานะจริงว่า app/tooling ใช้ PostgreSQL อย่างเดียว
- คนเปิด runbook หลักจะไม่เจอ compare/backfill/repair commands ที่ถูกลบไปแล้ว
- ข้อความแนะนำใน API notifications ไม่พาไปคำสั่งเก่าอีก

## Files

- [README.md](/Users/csl-dev/Desktop/alex/csb-pos/README.md)
- [AI_CONTEXT.md](/Users/csl-dev/Desktop/alex/csb-pos/AI_CONTEXT.md)
- [docs/HANDOFF.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/HANDOFF.md)
- [docs/postgresql-sequelize-migration.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgresql-sequelize-migration.md)
- [docs/postgres-staging-rollout.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-staging-rollout.md)
- [docs/postgres-turso-runtime-dependency-audit.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/postgres-turso-runtime-dependency-audit.md)
- [docs/API_INVENTORY.md](/Users/csl-dev/Desktop/alex/csb-pos/docs/API_INVENTORY.md)
- [app/api/settings/notifications/inbox/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/notifications/inbox/route.ts)

## How to verify

- `npm run lint`
- `npm run build`
- `rg -n "db:repair|legacy:db:|LEGACY_LIBSQL|TURSO_" README.md AI_CONTEXT.md docs`

## Next step

- phase ถัดไปคือ `express readiness cleanup`
- โฟกัสลดชั้น historical complexity ใน service/repository ต่อ เช่นแยก transport adapter, เก็บ route signatures ให้สั้นลง, และล้าง docs/HANDOFF เก่าเป็นระลอก
