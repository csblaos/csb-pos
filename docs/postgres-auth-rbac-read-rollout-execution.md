# PostgreSQL Auth/RBAC Read Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด auth/session + RBAC + app shell read path บน staging จริง`
ผ่าน flag `POSTGRES_AUTH_RBAC_READ_ENABLED`

ก้อนนี้ครอบ:

- app shell ใน [app/(app)/layout.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/layout.tsx)
- session membership resolution
- system role lookup
- permission checks / permission catalog
- branch access lookup
- policy reads ใน `system_config`

## Scope

### อยู่ใน scope

- `POSTGRES_AUTH_RBAC_READ_ENABLED`
- `getSession` path ที่อ่าน session limit / global session policy
- `buildSessionForUser`
- `getUserSystemRole`
- `getUserPermissionsForCurrentSession`
- `listAccessibleBranchesForMember`
- app shell active store profile

### ยังไม่อยู่ใน scope

- auth write paths (`login/signup` ยังเขียนผ่าน Turso)
- settings/system-admin runtime
- remove fallback paths
- inventory/purchase/order write rollout

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. login / signup / app shell ยังใช้งานได้ปกติ
2. session membership, role, permissions, branch access ตรงกับ baseline
3. route guards ไม่เพี้ยน
4. `db:compare:postgres:auth-rbac-read` ยังผ่าน
5. ไม่มี fallback warning ต่อเนื่องจาก `auth-rbac.read.pg`

## Flag Used

### Wave 0

```env
POSTGRES_AUTH_RBAC_READ_ENABLED=0
```

### Wave 1

```env
POSTGRES_AUTH_RBAC_READ_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด flag:

1. `npm run db:migrate:postgres` ผ่าน
2. `npm run db:backfill:postgres:auth-rbac-read` ผ่าน
3. `npm run db:compare:postgres:auth-rbac-read` ผ่าน
4. `POSTGRES_ORDERS_READ_ENABLED=1` ยังใช้งานนิ่ง
5. `npm run lint` และ `npm run build` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:auth-rbac-read-gate
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
POSTGRES_AUTH_RBAC_READ_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow A - Login

ทดสอบ login ด้วยผู้ใช้ 3 แบบ:

1. user ปกติที่มีร้าน active
2. `SUPERADMIN`
3. `SYSTEM_ADMIN`

ตรวจ:
- redirect หลัง login ถูกต้อง
- ไม่มี account-status ผิด
- ไม่มี permission หลุดหรือหน้า shell ว่าง

### Step 4: Canary Flow B - App Shell

เปิดหน้าใน app shell อย่างน้อย:

1. `/orders`
2. `/stock`
3. `/settings`

ตรวจ:
- ชื่อร้าน / โลโก้ร้านขึ้นถูก
- navbar / bottom tabs ไม่หาย
- ปุ่มที่อิง permission ยังตรงกับ role เดิม

### Step 5: Canary Flow C - Branch Access

ทดสอบ user ที่มี branch access แบบต่างกัน:

1. เคส `ALL`
2. เคส `SELECTED`

ตรวจ:
- เลือก branch ได้เฉพาะที่ควรเห็น
- fallback `MAIN` branch ยังทำงาน
- ไม่มี error เรื่อง branch access ใน order/stock flows

### Step 6: Canary Flow D - RBAC Guards

ทดสอบอย่างน้อย:

1. user ที่มีสิทธิ์ `orders.view`
2. user ที่ไม่มีสิทธิ์ `settings.view`
3. user owner / wildcard

ตรวจ:
- route/API ที่ควรเข้าไม่ได้ยัง block ถูก
- owner ยังเห็น wildcard permissions ครบ

### Step 7: Compare Validation

รัน:

```bash
npm run db:compare:postgres:auth-rbac-read
```

ต้องผ่านหลัง canary flows

### Step 8: Log Review

เช็ก server logs ว่ามีหรือไม่:

- `auth-rbac.read.pg fallback`

ถ้ามีต่อเนื่อง:
- rollback wave นี้ทันที

## Manual UAT Matrix

### UAT Set A: Auth

1. login user ปกติ
2. login superadmin
3. login system admin
4. signup account ใหม่

### UAT Set B: App Shell

1. เปิด `/orders`
2. เปิด `/stock`
3. เปิด `/settings`
4. ตรวจชื่อร้าน / โลโก้ / branch

### UAT Set C: Permissions

1. user ไม่มีสิทธิ์ settings
2. user มีสิทธิ์ orders แต่ไม่มี stock
3. owner user

### UAT Set D: Branch Access

1. user แบบ `ALL`
2. user แบบ `SELECTED`
3. เคส fallback ไป `MAIN`

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. login แล้ว redirect ผิด
2. app shell ขาดข้อมูลร้าน/branch
3. permission checks ผิด
4. branch access ผิด
5. compare fail
6. มี fallback warning ต่อเนื่อง

### Rollback Command Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_AUTH_RBAC_READ_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:auth-rbac-read-gate
npm run build
```

3. ตรวจ log ของ:
- `auth-rbac.read.pg`
- `orders.read.pg`

## After Auth/RBAC Read Rollout Passes

ถ้า rollout ผ่าน:

1. บันทึกว่า app shell/auth permission layer อ่านจาก PostgreSQL ได้จริงแล้ว
2. re-audit import graph ของ `@/lib/db/client`
3. ขยับไป phase `settings/system-admin foundation`

## Recommended Next Phase

หลัง auth/RBAC rollout ผ่าน ควรทำ `settings/system-admin PostgreSQL foundation`

เหตุผล:
- เป็น blocker ใหญ่ถัดไปของการลด Turso runtime
- ถ้าย้ายก้อนนี้ต่อ จะลด Turso probe ระหว่าง build/runtime ได้ชัดกว่าเริ่มถอด fallback ของ orders ทันที
