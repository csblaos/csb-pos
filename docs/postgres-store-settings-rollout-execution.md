# PostgreSQL Store Settings / Payment Accounts Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด store settings + payment accounts read/write path บน staging จริง`
ผ่าน flags:

- `POSTGRES_STORE_SETTINGS_READ_ENABLED`
- `POSTGRES_STORE_SETTINGS_WRITE_ENABLED`
- `POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED`

ก้อนนี้ครอบ:

- store profile / financial read ใน [app/(app)/settings/store/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/page.tsx)
- store payment accounts read ใน [app/(app)/settings/store/payments/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/store/payments/page.tsx)
- `GET /api/settings/store` ใน [app/api/settings/store/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/route.ts)
- `GET/PATCH /api/settings/store/pdf` ใน [app/api/settings/store/pdf/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/pdf/route.ts)
- `GET/POST/PATCH/DELETE /api/settings/store/payment-accounts` ใน [app/api/settings/store/payment-accounts/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/store/payment-accounts/route.ts)
- `GET /api/orders/payment-accounts/[accountId]/qr-image` ใน [app/api/orders/payment-accounts/[accountId]/qr-image/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/orders/payment-accounts/[accountId]/qr-image/route.ts)
- helper read/write:
  - [lib/platform/postgres-store-settings.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings.ts)
  - [lib/platform/postgres-store-settings-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-store-settings-write.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_STORE_SETTINGS_READ_ENABLED`
- `POSTGRES_STORE_SETTINGS_WRITE_ENABLED`
- `POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED`
- store profile read
- store financial read
- store PDF config read/write
- store JSON settings update
- payment accounts list/create/update/delete
- payment account QR image metadata read

### ยังไม่อยู่ใน scope

- remove fallback paths
- ถอด Turso runtime dependency ของ settings/store ทั้งหมด

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. `/settings/store` อ่านข้อมูลร้าน/การเงินจาก PostgreSQL ได้ตรง
2. `/settings/store/payments` อ่านบัญชีรับเงินและ QR metadata ได้ตรง
3. `PATCH /api/settings/store` แบบ JSON ผ่านจริง
4. `PATCH /api/settings/store/pdf` ผ่านจริง
5. payment accounts `POST/PATCH/DELETE` ผ่านจริง
6. `npm run smoke:postgres:store-settings-gate` ผ่านหลังเปิด flags
7. ไม่มี fallback warning ต่อเนื่องจาก:
   - `store-settings.read.pg`
   - `store-settings.write.pg`

## Flag Waves

### Wave 0

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=0
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

### Wave 1

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
```

### Wave 2

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1
```

### Wave 3

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด wave แรก:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
2. `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
3. `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย write path นิ่งพอ
4. `npm run db:backfill:postgres:store-settings-read` ผ่าน
5. `npm run db:compare:postgres:store-settings-read` ผ่าน
6. `npm run smoke:postgres:store-settings-gate` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:store-settings-gate
```

ถ้า command fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow - Read

ทดสอบอย่างน้อย:

1. เปิด `/settings/store`
2. เปิด `/settings/store/payments`
3. เปิด QR full image/download จาก order detail
4. เรียก `GET /api/settings/store`
5. เรียก `GET /api/settings/store/pdf`
6. เรียก `GET /api/settings/store/payment-accounts`
7. เปิด `/settings/superadmin/global-config` เทียบ policy summary หลัง refresh

ตรวจ:
- store profile / financial / pdf config ยังตรง baseline
- payment accounts list และ `isDefault/isActive` ยังตรง
- QR image metadata lookup ยังถูก
- policy summary ที่เกี่ยวกับ store/payment ไม่ stale จาก wave ก่อนหน้า

## Wave 2 Execution

### Step 1: Update Env

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

### Step 2: Canary Flow - Store Profile / JSON / PDF Write

ทดสอบอย่างน้อย:

1. แก้ชื่อร้าน
2. แก้เบอร์โทร
3. อัปโหลด/เปลี่ยนโลโก้ร้าน
4. แก้ currency / supported currencies / VAT
5. แก้ out-of-stock / low-stock threshold
6. แก้ PDF config
7. ตรวจหน้า `/settings/superadmin/global-config` และ `/system-admin/config/system` หลัง save

ตรวจ:
- refresh แล้วค่าใหม่กลับมาตรง
- `/settings/store` กับ `GET /api/settings/store` ตรงกัน
- `/settings/pdf` กับ `GET /api/settings/store/pdf` ตรงกัน
- โลโก้ใหม่แสดงผลตรงหลัง refresh
- ไม่มี stale read หลัง write
- global summaries/policy cards ที่พึ่ง store settings ยังไม่ stale

## Wave 3 Execution

### Step 1: Update Env

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=1
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=1
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=1
```

### Step 2: Canary Flow - Payment Accounts

ทดสอบอย่างน้อย:

1. สร้างบัญชีธนาคารใหม่
2. สร้างบัญชี QR ใหม่
3. แก้บัญชีเดิม
4. เปลี่ยน default account
5. ปิด/เปิด active account
6. ลบบัญชีที่ไม่ใช้งาน

ตรวจ:
- list refresh แล้วเรียง `default -> active -> created_at` ตรง
- บัญชีหลักมีได้แค่ 1 รายการ
- account inactive ไม่ถูก set เป็น default
- order detail ที่เรียก QR image/download ยังใช้งานได้

## Log Review

เช็ก server logs ว่ามีหรือไม่:

- `store-settings.read.pg`
- `store-settings.write.pg`
- `settings-admin.write.pg`

ถ้ามีต่อเนื่อง:
- rollback wave ปัจจุบันทันที

## Manual UAT Matrix

### UAT Set A: Store Read

1. เปิด `/settings/store`
2. เปิด `/settings/store/payments`
3. เช็กข้อมูลร้าน/การเงิน/PDF config

### UAT Set B: Store Write

1. แก้ชื่อร้าน/เบอร์โทร
2. แก้ currency/VAT
3. แก้ stock thresholds
4. แก้ PDF config

### UAT Set C: Payment Accounts

1. เพิ่ม BANK account
2. เพิ่ม LAO_QR account
3. edit account
4. set default
5. delete account

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. read หลังเปิด flag แล้วข้อมูล store/payment accounts ไม่ตรง baseline
2. store JSON/PDF write สำเร็จแต่ refresh แล้วอ่านกลับมาไม่ตรง
3. payment accounts CRUD สำเร็จแต่ list/default state ไม่ตรง
4. QR image lookup จาก order detail fail
5. `npm run smoke:postgres:store-settings-gate` fail หลังเปิด flags
6. มี fallback warning ต่อเนื่อง
7. store settings save สำเร็จแต่ superadmin/system-admin summary ที่เกี่ยวข้อง stale หรือผิด

### Rollback Checklist

1. ปิด flags กลับเป็น:

```env
POSTGRES_STORE_SETTINGS_READ_ENABLED=0
POSTGRES_STORE_SETTINGS_WRITE_ENABLED=0
POSTGRES_STORE_PAYMENT_ACCOUNTS_WRITE_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:store-settings-gate
npm run build
```

3. ตรวจ log ของ:
- `store-settings.read.pg`
- `store-settings.write.pg`
- `settings-admin.write.pg`
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

## After Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า store settings + payment accounts ใช้ PostgreSQL read/write path ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ค่อยขยับไป phase `notifications/settings remaining runtime domains`

## Recommended Next Phase

หลัง rollout ของก้อนนี้ผ่าน ควรไป `notifications/settings remaining runtime domains`

เหตุผล:
- เป็น gap ใหญ่สุดสุดท้ายของ `settings/store` domain
- ตอนนี้ JSON settings, PDF config, และ payment accounts CRUD มี foundation ครบแล้ว
- ถ้าปิด logo upload ได้ด้วย ก้อน `settings/store` จะเข้าใกล้จุดเปิด rollout แบบครบโดเมนได้มากที่สุด
