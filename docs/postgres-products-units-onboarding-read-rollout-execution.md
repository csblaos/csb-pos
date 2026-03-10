# PostgreSQL Products/Units/Onboarding Read Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด products/units/onboarding read path บน staging จริง`
ผ่าน flag `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED`

ก้อนนี้ครอบ:

- products page ใน [app/(app)/products/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/products/page.tsx)
- products read helpers ใน [lib/products/service.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/products/service.ts)
- product models route ใน [app/api/products/models/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/models/route.ts)
- product search route ใน [app/api/products/search/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/search/route.ts)
- categories list route ใน [app/api/products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts)
- units list route ใน [app/api/units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts)
- onboarding channel status route ใน [app/api/onboarding/channels/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/onboarding/channels/route.ts)
- onboarding channels repository ใน [server/repositories/onboarding-channels.repo.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/repositories/onboarding-channels.repo.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED`
- `listStoreProducts`
- `listStoreProductsPage`
- `getStoreProductSummaryCounts`
- `getStoreProductThresholds`
- `listStoreProductModelNames`
- `getNextVariantSortOrderByModelName`
- `listVariantLabelsByModelName`
- `listUnits`
- `listCategories`
- onboarding `storeType` read
- onboarding channel status read (`facebook` / `whatsapp`)

### ยังไม่อยู่ใน scope

- product write paths (`POST /api/products`, `PATCH /api/products/[productId]`)
- categories/unit write paths
- onboarding store create/write path
- product model / variant persistence writes
- remove fallback paths

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. หน้า `/products` โหลดและ filter ได้ปกติ
2. หน้า/route ของ categories และ units ยังคืนข้อมูลตรง baseline
3. product model autocomplete / next sort order / variant labels ยังตรง baseline
4. onboarding channel status ยังตรงกับ baseline และ eligibility ไม่เพี้ยน
5. `db:compare:postgres:products-units-onboarding-read` และ `db:compare:postgres:product-variants-foundation` ยังผ่าน
6. ไม่มี fallback warning ต่อเนื่องจาก `products-onboarding.read.pg`

## Flag Used

### Wave 0

```env
POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=0
```

### Wave 1

```env
POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. `npm run db:migrate:postgres` ผ่าน
2. `npm run db:backfill:postgres:products-units-onboarding-read` ผ่าน
3. `npm run db:compare:postgres:products-units-onboarding-read` ผ่าน
4. `npm run db:compare:postgres:product-variants-foundation` ผ่าน
5. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` และ `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย staging path นิ่งพอ
6. `npm run lint` และ `npm run build` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:products-units-onboarding-read-gate
npm run lint
npm run build
```

ถ้า command ใด fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Products Page

เปิดหน้า:

1. `/products`
2. เปลี่ยน status filter `ทั้งหมด / ใช้งาน / ไม่ใช้งาน`
3. refresh ผ่าน header refresh button

ตรวจ:
- list สินค้าขึ้นครบ
- summary counts ไม่เพี้ยน
- stock badges / thresholds ยังแสดงถูก
- ไม่มี error ตอนเปลี่ยน filter

### Step 4: Canary Flow B - Categories / Units Read

ทดสอบอย่างน้อย:

1. `/settings/categories`
2. `/settings/units`
3. เรียก `GET /api/products/categories`
4. เรียก `GET /api/units`

ตรวจ:
- categories/units list ตรงกับ baseline
- scope ของ units (`SYSTEM` / `STORE`) ยังถูก
- productCount ของ categories ยังตรง

### Step 5: Canary Flow C - Product Models / Search Read

เปิดหรือเรียก:

1. `GET /api/products/models?q=...`
2. `GET /api/products/models?name=...`
3. `GET /api/products/search?q=...`

ตรวจ:
- model autocomplete ยังเรียงถูก
- `nextSortOrder` ยังตรง
- `variantLabels` ยังตรง
- product search ยังคืนสินค้าครบ

### Step 6: Canary Flow D - Onboarding Channels

เปิดหรือเรียก:

1. `GET /api/onboarding/channels`
2. หน้า onboarding ที่อ่าน channel status จริง

ตรวจ:
- `eligible` ยังตรงกับ `storeType`
- store online/non-online ยังให้ผลเหมือนเดิม
- status ของ `facebook` และ `whatsapp` ยังตรง

### Step 7: Compare Validation

รัน:

```bash
npm run db:compare:postgres:products-units-onboarding-read
npm run db:compare:postgres:product-variants-foundation
```

ต้องผ่านหลัง canary flows

### Step 8: Log Review

เช็ก server logs ว่ามีหรือไม่:

- `products-onboarding.read.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Products Page

1. เปิด `/products`
2. สลับ status filter
3. search keyword
4. ดู stock/threshold badges

### UAT Set B: Categories / Units

1. เปิด `/settings/categories`
2. เปิด `/settings/units`
3. ตรวจ units `SYSTEM` และ `STORE`
4. ตรวจ category counts

### UAT Set C: Onboarding

1. ร้าน `ONLINE_RETAIL`
2. ร้าน non-online
3. ตรวจ channel status Facebook/WhatsApp

### UAT Set D: Product Models

1. เปิดฟอร์มสร้างสินค้า
2. ใช้ model autocomplete
3. ตรวจ `nextSortOrder`
4. ค้น `variantLabels`

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. products page list/counts เพี้ยน
2. units/categories list ไม่ตรง
3. product model autocomplete / next sort / variant labels ผิด
4. onboarding eligibility/status ผิด
5. compare fail
6. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:products-units-onboarding-read-gate
npm run build
```

3. ตรวจ log ของ:
- `products-onboarding.read.pg`
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

## After Products/Units/Onboarding Read Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่าก้อน products/units/onboarding read อ่านจาก PostgreSQL ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ขยับไป phase `products/units/onboarding write foundation`

## Recommended Next Phase

หลัง products/units/onboarding read rollout ผ่าน ควรทำ `products/units/onboarding write foundation`

เหตุผล:
- write paths ของสินค้า/หน่วย/onboarding store ยังเป็น Turso-primary
- ถ้าย้าย write ต่อ จะลด Turso runtime ในโดเมนนี้ได้จริง ไม่ใช่แค่ลด read imports
