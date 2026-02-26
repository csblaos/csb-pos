# CSB POS (Next.js + Drizzle + Turso)

เอกสารนี้สรุปวิธีรันโปรเจกต์ในเครื่อง, คำสั่งฐานข้อมูล, และ workflow ตอนพัฒนาให้ใช้งานได้จริงในทีม

## 1) สิ่งที่ต้องมี

- Node.js (แนะนำเวอร์ชัน LTS)
- npm
- ไฟล์ `.env.local` ที่ตั้งค่า DB/Redis ครบ
- (ถ้าใช้ local redis) ต้องมี Redis server รันอยู่

## 2) เริ่มใช้งานครั้งแรก (สำคัญ)

1. ติดตั้งแพ็กเกจ

```bash
npm install
```

2. โหลด environment จาก `.env.local` เข้า shell ปัจจุบัน

```bash
set -a
source .env.local
set +a
```

3. ซ่อมสถานะ migration (กรณีฐานข้อมูลมีอยู่แล้ว แต่ history ไม่ตรง)

```bash
npm run db:repair
```

4. รัน migration ล่าสุด

```bash
npm run db:migrate
```

5. รัน dev server

```bash
npm run dev
```

## 3) คำสั่งที่ใช้บ่อย

```bash
npm run dev           # รัน dev server (turbopack)
npm run dev:webpack   # รัน dev server แบบ webpack
npm run lint          # ตรวจ lint
npm run build         # ตรวจ compile + type + build
npm run db:generate   # generate migration จาก schema
npm run db:migrate    # apply migration
npm run db:repair     # ซ่อม migration history/คอลัมน์ที่เคย drift
npm run db:push       # push schema ตรงไป DB (ใช้ด้วยความระวัง)
npm run db:seed       # seed ข้อมูลตัวอย่าง
npm run idempotency:cleanup # cleanup ตาราง idempotency_requests แบบ manual
```

## 4) Workflow ตอนแก้ฐานข้อมูล (Schema)

เมื่อมีการเพิ่ม/แก้คอลัมน์ใน `lib/db/schema/tables.ts`:

1. แก้ schema ในโค้ด
2. generate migration

```bash
npm run db:generate
```

3. โหลด env และ apply migration

```bash
set -a
source .env.local
set +a
npm run db:migrate
```

4. ตรวจโค้ด

```bash
npm run lint
npm run build
```

5. commit ให้ครบทั้งไฟล์ schema + drizzle migration + snapshot

ไฟล์ที่ต้องเช็กว่าเข้า commit แล้ว:
- `lib/db/schema/tables.ts`
- `drizzle/*.sql`
- `drizzle/meta/*_snapshot.json`
- `drizzle/meta/_journal.json`

## 5) Workflow ตอนแก้ฟีเจอร์ทั่วไป (API/UI/Auth)

1. พัฒนาโค้ด
2. รันตรวจ

```bash
npm run lint
npm run build
```

3. ทดสอบ flow สำคัญด้วยตัวเองก่อน push
- Login/Logout
- Permission redirect
- สร้างร้าน / onboarding
- จัดการผู้ใช้ในหน้า settings

## 6) ถ้าเจอปัญหา migrate แล้วฟ้อง table already exists

อาการตัวอย่าง:
- `table contacts already exists`

สาเหตุ:
- ฐานข้อมูลมีตารางแล้ว แต่ `__drizzle_migrations` ไม่ตรงกับไฟล์ migration

วิธีแก้:

```bash
set -a
source .env.local
set +a
npm run db:repair
npm run db:migrate
```

## 7) หมายเหตุสำคัญเรื่อง env

- คำสั่ง DB (`db:migrate`, `db:repair`, `db:push`) ควรรันหลัง `source .env.local` เพื่อให้ชี้ DB เป้าหมายถูกต้อง
- ถ้าไม่โหลด env อาจไปรันผิดฐานข้อมูล
- ถ้าต้องการอัปโหลดโลโก้ร้านจาก onboarding ต้องตั้งค่า Cloudflare R2 ใน `.env.local`:

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=... # optional
R2_STORE_LOGO_PREFIX=store-logos # optional
R2_ORDER_SHIPPING_LABEL_PREFIX=order-shipping-labels # optional
```

- ถ้าต้องการให้ปุ่ม `Full Screen` แสดงบนอุปกรณ์ touch (เช่น POS tablet) ให้ตั้งค่า:

```bash
NEXT_PUBLIC_POS_ALLOW_FULLSCREEN_ON_TOUCH=true
```

## 8) แนวทางก่อน merge/push

Checklist แนะนำ:
- `npm run lint` ผ่าน
- `npm run build` ผ่าน
- migration ใหม่ apply ได้จริง
- ไม่มีไฟล์ migration ตกหล่น
- flow สำคัญของฟีเจอร์ที่แก้ทำงานจริง

## 9) กติกา AI Context / Handoff

ถ้าใช้ AI หลายตัวทำงานต่อเนื่อง ให้ใช้ไฟล์กลางเหล่านี้:
- `AI_CONTEXT.md` (ไฟล์หลักที่ AI ต้องอ่านก่อนเริ่มงาน)
- `docs/CONTEXT_INDEX.md` (ลำดับการอ่าน context ทั้งหมด)
- `docs/ARCHITECTURE.md` (ภาพรวมระบบ)
- `docs/CODEBASE_MAP.md` (แผนที่โครงสร้างโค้ดตาม domain)
- `docs/UI_ROUTE_MAP.md` (แผนที่หน้า UI -> component -> API)
- `docs/DECISIONS.md` (เหตุผลเชิงสถาปัตยกรรม)
- `docs/HANDOFF.md` (สถานะงานล่าสุด + next steps)
- `docs/API_INVENTORY.md` (รายการ API ทั้งระบบ)
- `docs/SCHEMA_MAP.md` (แผนผัง schema และความสัมพันธ์ตาราง)

กติกา:
- ถ้าแก้ behavior/API/schema/env ต้องอัปเดต `AI_CONTEXT.md` และ `docs/HANDOFF.md`
- ถ้าเปลี่ยน flow หน้า -> API ต้องอัปเดต `docs/UI_ROUTE_MAP.md`
- ถ้ามี architectural decision ใหม่ ต้องเพิ่มใน `docs/DECISIONS.md`
- แนะนำให้รวมโค้ด + context update ใน commit เดียวกัน

## 10) ตั้งค่า Shipping Label Provider

ระบบรองรับ 2 โหมด:
- `STUB` (ค่าเริ่มต้น): สร้าง tracking/label ภายในระบบเพื่อทดสอบ flow
- `HTTP`: เรียก API ผู้ให้บริการขนส่งจริง

ค่า env ที่ต้องตั้ง:

```bash
SHIPPING_PROVIDER_MODE=STUB
# ถ้าใช้ HTTP provider
SHIPPING_PROVIDER_HTTP_ENDPOINT=https://your-provider.example.com/labels
SHIPPING_PROVIDER_HTTP_TOKEN=...
SHIPPING_PROVIDER_HTTP_AUTH_SCHEME=Bearer
SHIPPING_PROVIDER_TIMEOUT_MS=8000
```

พฤติกรรม endpoint:
- `POST /api/orders/:orderId/shipments/label`
- `POST /api/orders/:orderId/shipments/upload-label` (multipart upload รูปบิล/ป้ายขึ้น R2)
- `POST /api/orders/:orderId/send-shipping`
- สิทธิ์ที่ต้องใช้:
  - `orders.ship` สำหรับ `shipments/label` และ `send-shipping`
  - `orders.update` สำหรับ `shipments/upload-label`
- รองรับ `Idempotency-Key` header

manual fallback:
- ผู้ใช้สามารถกรอก `shippingLabelUrl` (ลิงก์รูปบิล/ป้ายจัดส่ง) ในหน้า order detail
- ผู้ใช้สามารถอัปโหลดรูปจากเครื่อง/ถ่ายรูปจากกล้องมือถือได้ (ใช้ `capture=environment`)
- กดส่งข้อมูลจัดส่งอัตโนมัติได้ และมีปุ่มคัดลอกข้อความเพื่อส่งเองใน social media

รูปแบบที่ระบบส่งไปหา HTTP provider (ตัวอย่าง):

```json
{
  "provider": "FLASH",
  "storeId": "store_xxx",
  "order": {
    "id": "order_xxx",
    "orderNo": "SO-20260217-0001",
    "status": "PACKED"
  },
  "recipient": {
    "name": "Customer Name",
    "address": "Customer Address",
    "phone": "020xxxxxxx"
  },
  "forceRegenerate": false
}
```

รูปแบบที่ provider ต้องตอบกลับ:

```json
{
  "provider": "FLASH",
  "providerRequestId": "req_xxx",
  "trackingNo": "FLAS-260217-ABC123",
  "labelUrl": "https://provider.example.com/labels/xxx.pdf",
  "shippingCarrier": "FLASH"
}
```

## 11) ตั้งงาน Cleanup Idempotency อัตโนมัติ

ระบบมี endpoint สำหรับ cron:
- `GET /api/internal/cron/idempotency-cleanup`

เงื่อนไข auth:
- ต้องส่ง secret ผ่าน `Authorization: Bearer <CRON_SECRET>` (หรือ `x-cron-secret`)

ค่า env ที่ต้องตั้ง:

```bash
CRON_SECRET=...
IDEMPOTENCY_RETENTION_DAYS=14
IDEMPOTENCY_STALE_PROCESSING_MINUTES=15
```

ถ้า deploy บน Vercel:
- มี `vercel.json` ตั้ง cron ไว้แล้วที่ `0 19 * * *` (เท่ากับ 02:00 เวลาไทย/ลาว ICT)

ทดสอบ manual ได้ด้วย:

```bash
npm run idempotency:cleanup
```
