# PostgreSQL Products Write Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด product CRUD + variant persistence write path บน staging จริง`
ผ่าน flag `POSTGRES_PRODUCTS_WRITE_ENABLED`

ก้อนนี้ครอบ:

- `POST /api/products` ใน [app/api/products/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/route.ts)
- `PATCH /api/products/[productId]` ใน [app/api/products/[productId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/[productId]/route.ts)
- PostgreSQL write helper ใน [lib/platform/postgres-products-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-write.ts)
- variant persistence ที่รวมอยู่ใน [lib/platform/postgres-products-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-write.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_PRODUCTS_WRITE_ENABLED`
- create product
- update product
- variant persistence
- set active / inactive
- update cost + audit
- update image url / remove image

### ยังไม่อยู่ใน scope

- remove fallback paths
- onboarding store create/write
- ตัด Turso runtime dependency ของ products domain ทั้งหมด

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. create/update product ผ่านจาก UI และ API จริง
2. variant persistence หลัง create/update ไม่หายและอ่านกลับมาตรง
3. `set_active`, `update_cost`, `update image`, `remove image` ผ่าน
4. `GET /api/products/models` และ `GET /api/products/search` อ่าน after-write ได้ตรง
5. `npm run smoke:postgres:products-write-gate` ผ่านหลังเปิด flag
6. ไม่มี fallback warning ต่อเนื่องจาก `products.write.pg`

## Flag Used

### Wave 0

```env
POSTGRES_PRODUCTS_WRITE_ENABLED=0
```

### Wave 1

```env
POSTGRES_PRODUCTS_WRITE_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
2. `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
3. `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=1` ผ่าน canary แล้ว
4. `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=1` ผ่าน canary แล้ว
5. `npm run smoke:postgres:products-write-gate` ผ่าน
6. `npm run lint` และ `npm run build` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:products-write-gate
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
POSTGRES_PRODUCTS_WRITE_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Create Product

ทดสอบอย่างน้อย:

1. สร้าง product ธรรมดาที่ไม่มี variants
2. สร้าง product ที่มี model/variant options
3. refresh `/products` และ search ผลิตภัณฑ์ที่เพิ่งสร้าง

ตรวจ:
- SKU ไม่ซ้ำและ conflict behavior เหมือนเดิม
- products list refresh แล้วเห็น item ใหม่ทันที
- `GET /api/products/search` หาเจอ

### Step 4: Canary Flow B - Update Product + Variants

ทดสอบอย่างน้อย:

1. แก้ชื่อ/ราคาสินค้า
2. แก้ model name หรือ variant options
3. เปิด model autocomplete/variant helper ที่หน้า product form

ตรวจ:
- variant labels ยังตรง
- `GET /api/products/models` คืนค่าตรงหลัง update
- next sort order / variant data ไม่เพี้ยน

### Step 5: Canary Flow C - Product Actions

ทดสอบอย่างน้อย:

1. `set_active` เป็น inactive แล้วเปิดกลับ
2. `update_cost`
3. update image url
4. remove image

ตรวจ:
- product detail/list refresh แล้วเห็นค่าใหม่ทันที
- audit ที่เกี่ยวกับ cost update ยังถูกสร้าง
- image state ไม่ stale หลัง refresh

### Step 6: Log Review

เช็ก server logs ว่ามีหรือไม่:

- `products.write.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Create

1. เปิด `/products`
2. สร้าง product ธรรมดา
3. ค้นหาสินค้าที่เพิ่งสร้าง
4. เปิด edit form ของสินค้านั้น

### UAT Set B: Variant

1. สร้าง product แบบ variant
2. แก้ variant values
3. ตรวจ model autocomplete
4. ตรวจ `GET /api/products/models` และ `GET /api/products/search`

### UAT Set C: Actions

1. toggle active/inactive
2. update cost
3. update image
4. remove image

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. create/update product fail หรือ refresh แล้วข้อมูลไม่ตรง
2. variant persistence หายหรืออ่านกลับมาไม่ตรง
3. set_active / update_cost / image actions fail
4. smoke gate fail หลังเปิด flag
5. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_PRODUCTS_WRITE_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:products-write-gate
npm run build
```

3. ตรวจ log ของ:
- `products.write.pg`
- `products-onboarding.write.pg`
- `products-onboarding.read.pg`
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

## After Product Write Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า product CRUD + variant persistence ใช้ PostgreSQL write path ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ขยับไป phase `staging canary execution` ของโดเมนที่เตรียมไว้แล้วต่อ

## Recommended Next Phase

หลัง product write rollout ผ่าน ควรไป `staging canary execution` ของ flags ที่เตรียมไว้แล้วตามลำดับนี้:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1`
2. `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1`
3. `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=1`
4. `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=1`
5. `POSTGRES_PRODUCTS_WRITE_ENABLED=1`

เหตุผล:
- products domain จะลด Turso runtime ได้จริงก็ต่อเมื่อ read + low-risk write + product write ถูกเปิดใน staging ไม่ใช่แค่รองรับในโค้ด
- หลังจากนั้นค่อยกลับไปเปิด purchase/inventory/orders waves ตาม checklist รวม
