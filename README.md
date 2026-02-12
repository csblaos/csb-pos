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

## 8) แนวทางก่อน merge/push

Checklist แนะนำ:
- `npm run lint` ผ่าน
- `npm run build` ผ่าน
- migration ใหม่ apply ได้จริง
- ไม่มีไฟล์ migration ตกหล่น
- flow สำคัญของฟีเจอร์ที่แก้ทำงานจริง

