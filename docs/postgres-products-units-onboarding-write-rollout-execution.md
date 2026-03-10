# PostgreSQL Products/Units/Onboarding Write Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด products/units/onboarding low-risk write path บน staging จริง`
ผ่าน flag `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED`

ก้อนนี้ครอบ:

- units create/update/delete ใน [app/api/units/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/route.ts) และ [app/api/units/[unitId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/units/[unitId]/route.ts)
- product categories create/update/delete ใน [app/api/products/categories/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/products/categories/route.ts)
- onboarding channel connect ใน [server/services/onboarding-channels.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/onboarding-channels.service.ts)
- PostgreSQL write helper ใน [lib/platform/postgres-products-onboarding-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-products-onboarding-write.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED`
- units `POST`, `PATCH`, `DELETE`
- product categories `POST`, `PATCH`, `DELETE`
- onboarding channel connect (`FACEBOOK`, `WHATSAPP`)
- fallback-safe write path ไป PostgreSQL ก่อน แล้ว fallback กลับ Turso เมื่อ PostgreSQL path fail

### ยังไม่อยู่ใน scope

- product CRUD หลัก (`POST /api/products`, `PATCH /api/products/[productId]`)
- variant persistence
- onboarding store create/write
- remove fallback paths

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. units create/update/delete ผ่านจาก UI และ API จริง
2. categories create/update/delete ผ่านจาก UI และ API จริง
3. onboarding channel connect ผ่านและ status read-back ตรง
4. `npm run smoke:postgres:products-units-onboarding-write-gate` ผ่านหลังเปิด flag
5. ไม่มี fallback warning ต่อเนื่องจาก `products-onboarding.write.pg`

## Flag Used

### Wave 0

```env
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=0
```

### Wave 1

```env
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
2. `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
3. `POSTGRES_PRODUCTS_ONBOARDING_READ_ENABLED=1` ผ่าน canary แล้ว
4. `npm run smoke:postgres:products-units-onboarding-write-gate` ผ่าน
5. `npm run lint` และ `npm run build` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:products-units-onboarding-write-gate
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
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Units

ทดสอบอย่างน้อย:

1. สร้าง unit ใหม่ที่ระดับ store
2. แก้ชื่อ unit เดิม
3. ลบ unit ที่ไม่ได้ถูกใช้งาน

ตรวจ:
- UI refresh แล้วเห็นข้อมูลใหม่ทันที
- list units ยังเรียงและแสดง scope ถูก
- validation/error messages ยังทำงานเหมือนเดิม

### Step 4: Canary Flow B - Product Categories

ทดสอบอย่างน้อย:

1. สร้าง category ใหม่
2. แก้ชื่อ category เดิม
3. ลบ category ที่ไม่ได้ถูกผูกกับสินค้า

ตรวจ:
- categories list ยังตรง
- productCount ไม่เพี้ยนหลัง refresh
- route `GET /api/products/categories` คืนค่าตรง baseline

### Step 5: Canary Flow C - Onboarding Channels

ทดสอบอย่างน้อย:

1. connect Facebook channel
2. connect WhatsApp channel
3. refresh status ผ่าน `GET /api/onboarding/channels`

ตรวจ:
- channel status เปลี่ยนเป็น connected ถูกตัว
- `eligible` ยังตรงกับ store type เดิม
- ไม่มี side effect กับ stores ที่ไม่ใช่ online

### Step 6: Log Review

เช็ก server logs ว่ามีหรือไม่:

- `products-onboarding.write.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Units

1. เปิด `/settings/units`
2. สร้าง unit แบบ store-scoped
3. แก้ชื่อ unit
4. ลบ unit ที่เพิ่งสร้าง

### UAT Set B: Categories

1. เปิด `/settings/categories`
2. สร้าง category ใหม่
3. แก้ category เดิม
4. ลบ category ที่เพิ่งสร้าง

### UAT Set C: Onboarding

1. เรียก `POST /api/onboarding/channels` สำหรับ `FACEBOOK`
2. เรียก `POST /api/onboarding/channels` สำหรับ `WHATSAPP`
3. refresh `GET /api/onboarding/channels`

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. units write fail หรือข้อมูล refresh แล้วไม่ตรง
2. categories write fail หรือ productCount เพี้ยน
3. onboarding channel connect ไม่อัปเดต status
4. smoke gate fail หลังเปิด flag
5. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_PRODUCTS_ONBOARDING_WRITE_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:products-units-onboarding-write-gate
npm run build
```

3. ตรวจ log ของ:
- `products-onboarding.write.pg`
- `products-onboarding.read.pg`
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

## After Low-Risk Write Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า units/categories/onboarding channel connect ใช้ PostgreSQL write path ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ขยับไป phase `product CRUD + variant persistence PostgreSQL foundation`

## Recommended Next Phase

หลัง low-risk write rollout ผ่าน ควรทำ `product CRUD + variant persistence PostgreSQL foundation`

เหตุผล:
- write gap ที่ยังใหญ่สุดของโดเมนนี้คือ product CRUD หลัก
- category/unit/connect channel เป็นแค่ low-risk slice
- ถ้าปิด product CRUD ต่อได้ จะลด Turso runtime ในโดเมน products/onboarding ได้จริงมากขึ้น
