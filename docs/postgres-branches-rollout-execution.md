# PostgreSQL Branches Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด branches runtime บน staging จริง`
ผ่าน flag:

- `POSTGRES_BRANCHES_ENABLED`

ก้อนนี้ครอบ:

- `GET/PATCH /api/system-admin/config/branch-policy` ใน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/system-admin/config/branch-policy/route.ts)
- `GET/POST /api/stores/branches` ใน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/route.ts)
- `POST /api/stores/branches/switch` ใน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/stores/branches/switch/route.ts)
- member branch access ผ่าน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/users/[userId]/route.ts)
- helpers:
  - [postgres-branches.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-branches.ts)
  - [policy.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/policy.ts)
  - [access.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/branches/access.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_BRANCHES_ENABLED`
- global branch policy read/write
- branch creation policy read
- store branches list/create
- branch switch lookup
- member branch access read/write/check

### ยังไม่อยู่ใน scope

- remove fallback paths
- ถอด Turso runtime dependency ของ branch domain ทั้งหมด
- branch-related rollout ของ auth/RBAC ที่ยังแยก flag อยู่

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. `GET/PATCH /api/system-admin/config/branch-policy` อ่าน/เขียนผ่าน PostgreSQL ได้ตรง
2. `GET /api/stores/branches` และ `POST /api/stores/branches` ทำงานตรงกับ baseline
3. `POST /api/stores/branches/switch` สลับสาขาได้จริงและ session ใหม่สะท้อนถูก
4. member branch access ใน `PATCH /api/settings/users/[userId]` action `set_branch_access` ผ่านจริง
5. `npm run smoke:postgres:branches-gate` ผ่านหลังเปิด flag
6. ไม่มี fallback warning ต่อเนื่องจาก:
   - `branches.pg`

## Flag Waves

### Wave 0

```env
POSTGRES_BRANCHES_ENABLED=0
```

### Wave 1

```env
POSTGRES_BRANCHES_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด wave แรก:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
2. `POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
3. `npm run db:compare:postgres:auth-rbac-read` ผ่าน
4. `npm run db:compare:postgres:settings-system-admin-read` ผ่าน
5. `npm run db:compare:postgres:branches` ผ่าน
6. `npm run smoke:postgres:branches-gate` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:branches-gate
```

ถ้า command fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

```env
POSTGRES_BRANCHES_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow - Branch Policy

ทดสอบอย่างน้อย:

1. เปิดหน้า system admin ที่อ่าน branch policy
2. เปิด `/system-admin/config/stores-users`
3. `GET /api/system-admin/config/branch-policy`
4. `PATCH /api/system-admin/config/branch-policy`
5. refresh อ่านค่าเดิมซ้ำ

ตรวจ:
- ค่า `defaultCanCreateBranches`
- ค่า `defaultMaxBranchesPerStore`
- summary/quota logic ไม่เพี้ยน
- system-admin config views ที่เกี่ยวข้องยังไม่ stale

### Step 4: Canary Flow - Branch Create/List

ทดสอบอย่างน้อย:

1. `GET /api/stores/branches`
2. สร้าง branch ใหม่แบบ `BALANCED`
3. สร้าง branch ใหม่แบบ `FULL_SYNC`
4. สร้าง branch ใหม่แบบ `INDEPENDENT`
5. ทดสอบ duplicate name/code guard

ตรวจ:
- branch list refresh แล้วเห็นสาขาใหม่
- `sourceBranchId`, `sharingMode`, `sharingConfig` ตรง
- policy summary / quota count อัปเดตถูก

### Step 5: Canary Flow - Branch Switch

ทดสอบอย่างน้อย:

1. `POST /api/stores/branches/switch`
2. refresh app shell หลัง switch
3. เทียบ `activeBranchName`
4. ทดสอบ user ที่ไม่มีสิทธิ์ branch access

ตรวจ:
- session ใหม่สะท้อน `activeBranchName` ถูก
- route redirect หลัง switch ยังถูก
- เคส denied ยัง 403 ตรงเดิม

### Step 6: Canary Flow - Member Branch Access

ทดสอบอย่างน้อย:

1. `GET /api/settings/users/[userId]` branch access
2. เปิด `/settings/users`
3. เปิด `/system-admin/config/stores-users`
4. `PATCH /api/settings/users/[userId]` action `set_branch_access` เป็น `ALL`
5. เปลี่ยนเป็น `SELECTED`
6. เลือก branch เดียว / หลาย branch
7. ทดสอบ invalid branch selection

ตรวจ:
- refresh แล้ว `mode` / `branchIds` ตรง
- user เป้าหมาย switch branch ได้ตามสิทธิ์จริง
- fallback main branch behavior ยังถูก
- users/system-admin pages ที่อ่าน branch access ยังตรง

## Log Review

เช็ก server logs ว่ามีหรือไม่:

- `branches.pg`

ถ้ามีต่อเนื่อง:
- rollback wave ปัจจุบันทันที

## Manual UAT Matrix

### UAT Set A: Branch Policy

1. อ่านค่า policy
2. แก้ไข `defaultCanCreateBranches`
3. แก้ไข `defaultMaxBranchesPerStore`
4. refresh แล้วยังตรง

### UAT Set B: Branch Create

1. create branch แบบ `BALANCED`
2. create branch แบบ `FULL_SYNC`
3. create branch แบบ `INDEPENDENT`
4. duplicate guards

### UAT Set C: Branch Switch

1. switch ไป main branch
2. switch ไป non-main branch
3. denied branch access

### UAT Set D: Member Branch Access

1. set `ALL`
2. set `SELECTED`
3. invalid selection
4. refresh read-after-write

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. branch policy อ่าน/เขียนไม่ตรง baseline
2. create branch สำเร็จแต่ refresh แล้ว branch list / quota ไม่ตรง
3. branch switch สำเร็จแต่ session/app shell ไม่สะท้อนสาขาใหม่
4. member branch access update สำเร็จแต่ refresh แล้ว state ไม่ตรง
5. settings/system-admin views ที่เกี่ยวกับ branch access/policy stale หรือไม่ตรง
6. `npm run smoke:postgres:branches-gate` fail หลังเปิด flag
7. มี fallback warning ต่อเนื่อง

### Rollback Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_BRANCHES_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:branches-gate
npm run build
```

3. ตรวจ log ของ:
- `branches.pg`
- `auth-rbac.read.pg`
- `settings-admin.read.pg`

## Exit Criteria

ถือว่าจบ phase นี้เมื่อ:

1. บันทึกว่า branch policy + branches runtime ใช้ PostgreSQL path ได้จริงแล้ว
2. ไม่มี fallback warning ต่อเนื่องใน observe window
3. compare scripts ของ auth-rbac/branches ยังผ่าน
4. ทีมพร้อมค่อยขยับไป phase `store settings + payment accounts canary` หรือ `system-admin write`
