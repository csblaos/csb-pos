# PostgreSQL Settings/System-Admin Write Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด settings/system-admin write path บน staging จริง`
ผ่าน flag `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED`

ก้อนนี้ครอบ:

- `POST /api/system-admin/superadmins` ใน [app/api/system-admin/superadmins/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/route.ts)
- `PATCH /api/system-admin/superadmins/[userId]` ใน [app/api/system-admin/superadmins/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/superadmins/[userId]/route.ts)
- `PATCH /api/system-admin/config/users/[userId]` ใน [app/api/system-admin/config/users/[userId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/users/[userId]/route.ts)
- `PATCH /api/system-admin/config/stores/[storeId]` ใน [app/api/system-admin/config/stores/[storeId]/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/stores/[storeId]/route.ts)
- `GET/PATCH /api/system-admin/config/session-policy` ใน [app/api/system-admin/config/session-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/session-policy/route.ts)
- `GET/PATCH /api/system-admin/config/store-logo-policy` ใน [app/api/system-admin/config/store-logo-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/store-logo-policy/route.ts)
- `GET/PATCH /api/settings/superadmin/payment-policy` ใน [app/api/settings/superadmin/payment-policy/route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/superadmin/payment-policy/route.ts)
- helper write:
  - [lib/platform/postgres-settings-admin-write.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-settings-admin-write.ts)
  - [lib/system-config/policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-config/policy.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED`
- create superadmin
- update superadmin config
- update system-admin config ของ user
- update system-admin config ของ store
- update global session policy
- update global store-logo policy
- update global payment policy

### ยังไม่อยู่ใน scope

- remove fallback paths
- ล้าง legacy env/tooling หลังจบ migration ทั้ง repo
- โดเมน settings/store หรือ notifications rollout

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. superadmin create/update ผ่านจริง
2. system-admin config users/stores update ผ่านจริง
3. session / store-logo / payment policy update ผ่านจริง
4. `npm run smoke:postgres:settings-system-admin-write-gate` ผ่านหลังเปิด flag
5. ไม่มี fallback warning ต่อเนื่องจาก:
   - `settings-admin.write.pg`
   - `auth-rbac.read.pg`
   - `settings-admin.read.pg`

## Flag Used

### Wave 0

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=0
```

### Wave 1

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
2. `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
3. `npm run smoke:postgres:settings-system-admin-write-gate` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:settings-system-admin-write-gate
```

ถ้า command fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

ตั้งค่า staging เป็น:

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Global Policies

ทดสอบอย่างน้อย:

1. เปลี่ยน `default_session_limit`
2. เปลี่ยน `store_logo_max_size_mb` / `store_logo_auto_resize` / `store_logo_resize_max_width`
3. เปลี่ยน `payment_max_accounts_per_store`
4. เปลี่ยน `payment_require_slip_for_lao_qr`

ตรวจ:
- `/system-admin/config/system`
- `/settings/superadmin/global-config`
- `GET /api/system-admin/config/session-policy`
- `GET /api/system-admin/config/store-logo-policy`
- `GET /api/settings/superadmin/payment-policy`

ค่าต้อง refresh แล้วตรงทันที

### Step 4: Canary Flow B - Superadmins

ทดสอบอย่างน้อย:

1. สร้าง superadmin ใหม่
2. แก้ `canCreateStores` / `maxStores`
3. แก้ `canCreateBranches` / `maxBranchesPerStore`

ตรวจ:
- `/settings/superadmin/users`
- `/system-admin/config/stores-users`
- superadmin list refresh แล้วค่าตรง
- ไม่มี email conflict ผิดพลาด

### Step 5: Canary Flow C - Config Users / Stores

ทดสอบอย่างน้อย:

1. แก้ config user ระดับ system-admin
2. แก้ config store ระดับ system-admin

ตรวจ:
- refresh แล้วค่ากลับมาตรง
- policy summaries / quotas / limits ไม่ stale

### Step 6: Smoke Validation

รัน:

```bash
npm run smoke:postgres:settings-system-admin-write-gate
```

ต้องผ่านหลัง canary flows

### Step 7: Log Review

เช็ก server logs ว่ามีหรือไม่:

- `settings-admin.write.pg`
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Policies

1. เปิด `/system-admin/config/system`
2. เปิด `/settings/superadmin/global-config`
3. แก้ session / logo / payment policy

### UAT Set B: Superadmins

1. สร้าง superadmin
2. แก้ quota / branch limits
3. ตรวจ superadmin list หลัง refresh

### UAT Set C: Config Users / Stores

1. แก้ user config
2. แก้ store config
3. ตรวจ dashboard/global-config summaries หลัง refresh

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. create/update superadmin สำเร็จแต่ list หรือ detail หลัง refresh ไม่ตรง
2. policy update สำเร็จแต่ summary/read API ยัง stale
3. config user/store update สำเร็จแต่หน้าหรือ API อ่านกลับมาไม่ตรง
4. `npm run smoke:postgres:settings-system-admin-write-gate` fail หลังเปิด flag
5. มี fallback warning ต่อเนื่อง

### Rollback Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_WRITE_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:settings-system-admin-write-gate
npm run build
```

3. ตรวจ log ของ:
- `settings-admin.write.pg`
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

## After Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า settings/system-admin write path ใช้ PostgreSQL ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ขยับไป canary ของ `store settings + payment accounts` หรือ `notifications`
