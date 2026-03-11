# PostgreSQL Notifications Rollout Execution Checklist

เอกสารนี้ใช้สำหรับ `ลงมือเปิด notifications runtime บน staging จริง`
ผ่าน flag:

- `POSTGRES_NOTIFICATIONS_ENABLED`

ก้อนนี้ครอบ:

- `/settings/notifications` ผ่าน [page.tsx](/Users/csl-dev/Desktop/alex/csb-pos/app/(app)/settings/notifications/page.tsx)
- `GET/PATCH /api/settings/notifications/inbox` ใน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/notifications/inbox/route.ts)
- `PATCH /api/settings/notifications/rules` ใน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/settings/notifications/rules/route.ts)
- `GET /api/internal/cron/ap-reminders` ใน [route.ts](/Users/csl-dev/Desktop/alex/csb-pos/app/api/internal/cron/ap-reminders/route.ts)
- helper read/write/sync:
  - [postgres-notifications.ts](/Users/csl-dev/Desktop/alex/csb-pos/lib/platform/postgres-notifications.ts)
  - [notification.service.ts](/Users/csl-dev/Desktop/alex/csb-pos/server/services/notification.service.ts)

## Scope

### อยู่ใน scope

- `POSTGRES_NOTIFICATIONS_ENABLED`
- notifications inbox read
- notifications inbox actions
- mute/snooze/clear rules
- AP reminder cron sync

### ยังไม่อยู่ใน scope

- remove fallback paths
- push/email channels อื่นนอก in-app inbox
- ถอด Turso runtime dependency ของ notifications ทั้งหมด

## Success Criteria

ถือว่า rollout ผ่านเมื่อครบทุกข้อ:

1. `/settings/notifications` อ่าน inbox และ summary จาก PostgreSQL ได้ตรง
2. `PATCH /api/settings/notifications/inbox` ทุก action ผ่านจริง
3. `PATCH /api/settings/notifications/rules` ผ่านจริง
4. `GET /api/internal/cron/ap-reminders` sync เข้า PostgreSQL path ได้จริง
5. `npm run smoke:postgres:notifications-gate` ผ่านหลังเปิด flag
6. ไม่มี fallback warning ต่อเนื่องจาก:
   - `notifications.pg`

## Flag Waves

### Wave 0

```env
POSTGRES_NOTIFICATIONS_ENABLED=0
```

### Wave 1

```env
POSTGRES_NOTIFICATIONS_ENABLED=1
```

## Preconditions

ต้องครบทุกข้อก่อนเปิด wave แรก:

1. `POSTGRES_AUTH_RBAC_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย read path นิ่งพอ
2. `POSTGRES_REPORTS_READ_ENABLED=1` ผ่าน canary แล้ว หรืออย่างน้อย `/reports` กับ AP helper นิ่งพอ
3. `npm run db:compare:postgres:purchase-read` ผ่าน
4. `npm run db:backfill:postgres:notifications` ผ่าน
5. `npm run db:compare:postgres:notifications` ผ่าน
6. `npm run smoke:postgres:notifications-gate` ผ่าน

## Preflight Commands

รันก่อนแตะ env ทุกครั้ง:

```bash
npm run smoke:postgres:notifications-gate
```

ถ้า command fail:
- หยุด rollout
- แก้ต้นเหตุ
- rerun preflight ใหม่ทั้งหมด

## Wave 1 Execution

### Step 1: Update Env

```env
POSTGRES_NOTIFICATIONS_ENABLED=1
```

### Step 2: Restart / Deploy

- deploy config ใหม่ให้ครบทุก instance
- ยืนยันว่า server โหลด env ชุดใหม่แล้ว

### Step 3: Canary Flow - Inbox Read/Actions

ทดสอบอย่างน้อย:

1. เปิด `/settings/notifications`
2. filter `ACTIVE / UNREAD / RESOLVED / ALL`
3. `mark_read`
4. `mark_unread`
5. `resolve`
6. `mark_all_read`

ตรวจ:
- summary `unread/active/resolved` อัปเดตตรง
- refresh แล้ว state ยังตรง
- ไม่มี item หาย/ซ้ำผิดปกติ

### Step 4: Canary Flow - Rules

ทดสอบอย่างน้อย:

1. `SNOOZE`
2. `MUTE` แบบมีวันสิ้นสุด
3. `MUTE` แบบ `forever`
4. `CLEAR`

ตรวจ:
- หลังตั้ง rule แล้ว item ถูก suppress ตามคาด
- หลัง clear แล้ว item กลับมาใน inbox ได้
- note/until ไม่หายหลัง refresh

### Step 5: Canary Flow - Cron

ทดสอบอย่างน้อย:

1. เรียก `GET /api/internal/cron/ap-reminders` ด้วย `CRON_SECRET`
2. รันทั้งแบบทั้งระบบ และแบบระบุ `storeId`
3. เปิด `/stock/purchase-orders/ap-by-supplier` หรือ statement/export ที่เกี่ยวข้องเทียบหลัง cron

ตรวจ:
- response summary สำเร็จ
- item ใหม่ถูก create/reopen/update/resolve ตามข้อมูล PO จริง
- หน้า `/settings/notifications` สะท้อนผลหลัง cron run
- ตัวเลข outstanding/AP ที่เกี่ยวข้องยังไม่เพี้ยนจาก purchase/reporting baseline

## Log Review

เช็ก server logs ว่ามีหรือไม่:

- `notifications.pg`

ถ้ามีต่อเนื่อง:
- rollback wave ปัจจุบันทันที

## Manual UAT Matrix

### UAT Set A: Inbox Read

1. เปิด `/settings/notifications`
2. เปลี่ยน filter ทุกแบบ
3. เทียบ summary กับรายการที่แสดง

### UAT Set B: Inbox Actions

1. mark read
2. mark unread
3. resolve
4. mark all read

### UAT Set C: Rules

1. snooze ราย PO
2. mute until ราย PO
3. mute forever ราย PO
4. clear rule

### UAT Set D: Cron

1. รัน cron
2. ตรวจ create/reopen/update/resolve counts
3. refresh UI หลัง cron
4. เทียบกับ `/stock/purchase-orders/ap-by-supplier`

## Rollback Rules

ให้ rollback ทันทีถ้าเจออย่างใดอย่างหนึ่ง:

1. inbox read หลังเปิด flag แล้วข้อมูลไม่ตรง baseline
2. action สำเร็จแต่ refresh แล้ว status/summary ไม่ตรง
3. rule update สำเร็จแต่ suppress state ไม่ตรง
4. cron สำเร็จแต่ UI/read path ไม่สะท้อนผล
5. outstanding/AP baseline จาก purchase-reporting ไม่ตรงหลัง cron
6. `npm run smoke:postgres:notifications-gate` fail หลังเปิด flag
7. มี fallback warning ต่อเนื่อง

### Rollback Checklist

1. ปิด flag กลับเป็น:

```env
POSTGRES_NOTIFICATIONS_ENABLED=0
```

2. rerun:

```bash
npm run smoke:postgres:notifications-gate
npm run build
```

3. ตรวจ log ของ:
- `notifications.pg`
- `purchase.read.pg`
- `reports.read.pg`
- `auth-rbac.read.pg`

## Exit Criteria

ถือว่าจบ phase นี้เมื่อ:

1. บันทึกว่า notifications runtime ใช้ PostgreSQL path ได้จริงแล้ว
2. ไม่มี fallback warning ต่อเนื่องใน observe window
3. compare scripts ของ notifications/reports ยังผ่าน
4. ทีมพร้อมค่อยขยับไป phase `stores/branches + branch policy` หรือ `system-admin write`
