# PostgreSQL Settings/System-Admin Read Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด settings/system-admin read path บน staging จริง`
ผ่าน flag `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED`

ก้อนนี้ครอบ:

- system-admin dashboard ใน [app/(system-admin)/system-admin/page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(system-admin)/system-admin/page.tsx)
- superadmin list ใน [lib/system-admin/superadmins.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/system-admin/superadmins.ts)
- store creation policy ใน [lib/auth/store-creation.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/auth/store-creation.ts)
- superadmin overview/global-config helpers
- settings superadmin overview/global-config pages

## Scope

### อยู่ใน scope

- `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED`
- `getSystemAdminDashboardStats`
- `listSuperadmins`
- `getStoreCreationPolicy`
- `getSuperadminHomeSnapshot`
- `getSuperadminOverviewMetrics`
- `getSuperadminGlobalConfigOverview`

### ยังไม่อยู่ใน scope

- settings/system-admin write paths
- `POST /api/system-admin/superadmins`
- `PATCH /api/system-admin/config/*`
- settings pages อื่นที่ยัง query Turso โดยตรง
- remove fallback paths

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. system-admin dashboard และ settings superadmin overview/global-config เปิดได้ปกติ
2. ตัวเลข client/store/user/alerts/global policy snapshot ตรงกับ baseline
3. superadmin list และ store creation policy ไม่เพี้ยน
4. `db:compare:postgres:settings-system-admin-read` ยังผ่าน
5. ไม่มี fallback warning ต่อเนื่องจาก `settings-admin.read.pg`

## Flag Used

### Wave 0

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=0
```

### Wave 1

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. `npm run db:migrate:postgres` ผ่าน
2. `npm run db:backfill:postgres:settings-system-admin-read` ผ่าน
3. `npm run db:compare:postgres:settings-system-admin-read` ผ่าน
4. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย staging path นิ่งพอ
5. `npm run lint` และ `npm run build` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:settings-system-admin-read-gate
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
POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - System Admin Dashboard

เปิดหน้า:

1. `/system-admin`
2. `/system-admin/config/clients`
3. `/system-admin/config/system`

ตรวจ:
- dashboard stats ขึ้นครบ
- top clients ไม่ว่างผิดปกติ
- global system policy cards ยังแสดงค่าถูก

### Step 4: Canary Flow B - Settings Superadmin

เปิดหน้า:

1. `/settings/superadmin`
2. `/settings/superadmin/overview`
3. `/settings/superadmin/global-config`

ตรวจ:
- summary cards, alerts, health cards ขึ้นครบ
- global config counts (`Store Override`, `Superadmin Override`) ตรง
- global payment / branch / session / store-logo snapshots ยังตรง

### Step 5: Canary Flow C - Store Creation Policy

ทดสอบอย่างน้อย:

1. SUPERADMIN ที่สร้างร้านได้
2. SUPERADMIN ที่ติด quota หรือถูกจำกัด
3. SYSTEM_ADMIN

ตรวจ:
- คำอธิบาย/summary เรื่องสิทธิ์สร้างร้านยังตรง
- quota/current owner store count ไม่เพี้ยน

### Step 6: Compare Validation

รัน:

```bash
npm run db:compare:postgres:settings-system-admin-read
```

ต้องผ่านหลัง canary flows

### Step 7: Log Review

เช็ก server logs ว่ามีหรือไม่:

- `settings-admin.read.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: System Admin

1. เปิด `/system-admin`
2. เปิด `/system-admin/config/clients`
3. เปิด `/system-admin/config/system`

### UAT Set B: Settings Superadmin

1. เปิด `/settings/superadmin`
2. เปิด `/settings/superadmin/overview`
3. เปิด `/settings/superadmin/global-config`

### UAT Set C: Policy / Quota

1. ตรวจ global session policy summary
2. ตรวจ branch default + override counts
3. ตรวจ payment policy summary
4. ตรวจ store creation access/blocked reason

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. dashboard numbers เพี้ยน
2. superadmin overview/global-config cards ไม่ตรง
3. store creation policy ผิด
4. compare fail
5. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:settings-system-admin-read-gate
npm run build
```

3. ตรวจ log ของ:
- `settings-admin.read.pg`
- `auth-rbac.read.pg`

## After Settings/System-Admin Read Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า settings/system-admin read foundation อ่านจาก PostgreSQL ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ขยับไป phase `products/units/onboarding foundation`

## Recommended Next Phase

หลัง settings/system-admin rollout ผ่าน ควรทำ `products/units/onboarding PostgreSQL foundation`

เหตุผล:
- เป็น blocker ใหญ่ถัดไปของการลด Turso runtime
- ถ้าย้ายก้อนนี้ต่อ จะลด Turso probe ในหน้า settings/product/onboarding ได้อีกชุดใหญ่
