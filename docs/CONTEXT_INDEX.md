# Context Index

ไฟล์นี้เป็นแผนที่รวม context ทั้งโปรเจกต์ เพื่อให้ AI/ทีมอ่านต่อได้เร็วและตรง

## Read Order (Recommended)

1. `AI_CONTEXT.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CODEBASE_MAP.md`
5. `docs/UI_ROUTE_MAP.md`
6. `docs/DECISIONS.md`
7. `docs/API_INVENTORY.md`
8. `docs/SCHEMA_MAP.md`
9. `docs/drizzle-migrations.md`
10. `docs/orders-system-design.md`
11. `docs/product-variants-plan.md`
12. `docs/postgresql-sequelize-migration.md`
13. `docs/postgres-staging-rollout.md`
14. `docs/postgres-inventory-producers-audit.md`
15. `docs/postgres-cutover-plan.md`
16. `docs/postgres-full-cutover-checklist.md`
17. `docs/postgres-purchase-rollout-execution.md`
18. `docs/postgres-inventory-read-rollout-execution.md`
19. `docs/postgres-auth-rbac-read-rollout-execution.md`
20. `docs/postgres-settings-system-admin-read-rollout-execution.md`
21. `docs/postgres-settings-system-admin-write-rollout-execution.md`
22. `docs/postgres-branches-rollout-execution.md`
23. `docs/postgres-store-settings-rollout-execution.md`
24. `docs/postgres-notifications-rollout-execution.md`
25. `docs/postgres-products-units-onboarding-read-rollout-execution.md`
26. `docs/postgres-products-units-onboarding-write-rollout-execution.md`
27. `docs/postgres-products-write-rollout-execution.md`
28. `docs/postgres-orders-write-rollout-execution.md`
29. `docs/postgres-stock-movement-rollout-execution.md`
30. `docs/postgres-all-postgres-observe-fallback-removal.md`
31. `docs/postgres-turso-drizzle-retirement-plan.md`
32. `docs/postgres-turso-runtime-dependency-audit.md`
33. `docs/express-readiness-plan.md`

## What Each File Is For

- `AI_CONTEXT.md`
  - กติกาหลัก, quick start, update contract
- `docs/HANDOFF.md`
  - สถานะล่าสุด, สิ่งที่ทำไปแล้ว, next step ที่ควรทำต่อ
- `docs/ARCHITECTURE.md`
  - ภาพรวมระบบ, flow หลัก, reliability patterns
- `docs/CODEBASE_MAP.md`
  - แผนที่โครงสร้างโค้ดทั้งระบบ (domain ownership)
- `docs/UI_ROUTE_MAP.md`
  - แผนที่หน้า UI -> component -> API สำหรับ trace/debug
- `docs/DECISIONS.md`
  - บันทึกเหตุผลการตัดสินใจ (ADR-lite)
- `docs/API_INVENTORY.md`
  - แคตตาล็อก API route ทั้งระบบ พร้อม access control แบบย่อ
- `docs/SCHEMA_MAP.md`
  - แผนผังตารางและความสัมพันธ์สำคัญ
- `docs/drizzle-migrations.md`
  - วิธีทำ migration และข้อควรระวัง
- `docs/orders-system-design.md`
  - แผนออกแบบ `/orders` ระดับระบบสำหรับ roadmap
- `docs/product-variants-plan.md`
  - แผนโครงสร้างสินค้าแบบ Variant (DB + UX + rollout phases)
- `docs/postgresql-sequelize-migration.md`
  - แผนย้ายไป `PostgreSQL + Sequelize.query(...)` และออกแบบให้ย้ายไป Express ได้ง่าย
- `docs/postgres-staging-rollout.md`
  - runbook เปิด PostgreSQL read/write flags บน staging แบบเป็น wave พร้อม preflight/rollback checklist
- `docs/postgres-inventory-producers-audit.md`
  - inventory movement producers ที่ยังค้างบน Turso และลำดับ migration หลังจบ order-route rollout
- `docs/postgres-cutover-plan.md`
  - แผน cutover ของ inventory/reporting หลังผ่าน staging rollout แล้ว
- `docs/postgres-full-cutover-checklist.md`
  - master checklist ของสถานะ PostgreSQL vs Turso ปัจจุบัน และลำดับเปิด flags จนถึงถอด fallback/retire Turso
- `docs/postgres-purchase-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด purchase runtime บน staging แบบ wave-by-wave พร้อม UAT/log review/rollback
- `docs/postgres-inventory-read-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด inventory read truth บน staging พร้อม canary flows, stock/order UAT, และ rollback
- `docs/postgres-auth-rbac-read-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด auth/session + RBAC + app shell read path บน staging ผ่าน `POSTGRES_AUTH_RBAC_READ_ENABLED`
- `docs/postgres-settings-system-admin-read-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด settings/system-admin read path บน staging ผ่าน `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED`
- `docs/postgres-settings-system-admin-write-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด settings/system-admin write path บน staging ผ่าน `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED`
- `docs/postgres-branches-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด branch policy + branches runtime บน staging ผ่าน `POSTGRES_BRANCHES_ENABLED`
- `docs/postgres-store-settings-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด store settings + payment accounts read/write path บน staging ผ่าน `POSTGRES_STORE_SETTINGS_READ_ENABLED`, `POSTGRES_STORE_SETTINGS_WRITE_ENABLED`, และ `POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED`
- `docs/postgres-notifications-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด notifications runtime บน staging ผ่าน `POSTGRES_NOTIFICATIONS_ENABLED`
- `docs/postgres-products-units-onboarding-read-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด products page, units/categories, และ onboarding read path บน staging ผ่าน `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED`
- `docs/postgres-products-units-onboarding-write-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด units/categories/onboarding low-risk write path บน staging ผ่าน `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED`
- `docs/postgres-products-write-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด product CRUD + variant persistence write path บน staging ผ่าน `POSTGRES_PRODUCTS_WRITE_ENABLED`
- `docs/postgres-orders-write-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด order lifecycle writes บน staging แบบ wave-by-wave พร้อม UAT, compare, และ rollback
- `docs/postgres-stock-movement-rollout-execution.md`
  - checklist ปฏิบัติจริงสำหรับเปิด manual stock movement writes บน staging พร้อม UAT, compare, และ rollback
- `docs/postgres-all-postgres-observe-fallback-removal.md`
  - runbook สำหรับช่วง observe หลังเปิด PostgreSQL runtime เกือบครบ และลำดับถอด fallback/Turso paths ทีละโดเมน
- `docs/postgres-turso-drizzle-retirement-plan.md`
  - แผนถอน Turso/Drizzle ออกจาก runtime, repositories, env, และ ops docs หลังจบ phase observe/fallback removal
- `docs/postgres-turso-runtime-dependency-audit.md`
  - audit ว่า runtime path ไหนยัง import/initialize Turso อยู่จริง, แยก temporary blockers กับกลุ่มที่พร้อมเข้า queue ถอดหลังเปิด PostgreSQL ครบ
- `docs/express-readiness-plan.md`
  - แผนเตรียม boundary สำหรับย้าย API จาก Next.js ไป Express + TypeScript แบบค่อยเป็นค่อยไป

## Maintenance Rules

- ถ้าแก้ behavior/API/schema/env:
  - ต้องอัปเดต `AI_CONTEXT.md` และ `docs/HANDOFF.md`
- ถ้าเพิ่ม/แก้ route:
  - ต้องอัปเดต `docs/API_INVENTORY.md`
- ถ้าเปลี่ยน flow หน้า UI -> API:
  - ต้องอัปเดต `docs/UI_ROUTE_MAP.md`
- ถ้าแก้ schema/migration:
  - ต้องอัปเดต `docs/SCHEMA_MAP.md` และ `docs/drizzle-migrations.md` (เมื่อมีผลต่อวิธีทำงาน)
- ถ้าเปลี่ยน decision เชิงสถาปัตยกรรม:
  - ต้องอัปเดต `docs/DECISIONS.md`
