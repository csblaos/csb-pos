# Context Index

ไฟล์นี้เป็นแผนที่รวม context ทั้งโปรเจกต์ เพื่อให้ AI/ทีมอ่านต่อได้เร็วและตรง

## Read Order (Recommended)

1. `AI_CONTEXT.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CODEBASE_MAP.md`
5. `docs/UI_ROUTE_MAP.md`
6. `docs/DECISIONS.md`
7. `docs/API_INVENTORY.md`
8. `docs/SCHEMA_MAP.md`
9. `docs/drizzle-migrations.md`
10. `docs/orders-system-design.md`

## What Each File Is For

- `AI_CONTEXT.md`
  - กติกาหลัก, quick start, update contract
- `docs/HANDOFF.md`
  - สถานะล่าสุด, สิ่งที่ทำไปแล้ว, next step ที่ควรทำต่อ
- `docs/ARCHITECTURE.md`
  - ภาพรวมระบบ, flow หลัก, reliability patterns
- `docs/CODEBASE_MAP.md`
  - แผนที่โครงสร้างโค้ดทั้งระบบ (domain ownership)
- `docs/UI_ROUTE_MAP.md`
  - แผนที่หน้า UI -> component -> API สำหรับ trace/debug
- `docs/DECISIONS.md`
  - บันทึกเหตุผลการตัดสินใจ (ADR-lite)
- `docs/API_INVENTORY.md`
  - แคตตาล็อก API route ทั้งระบบ พร้อม access control แบบย่อ
- `docs/SCHEMA_MAP.md`
  - แผนผังตารางและความสัมพันธ์สำคัญ
- `docs/drizzle-migrations.md`
  - วิธีทำ migration และข้อควรระวัง
- `docs/orders-system-design.md`
  - แผนออกแบบ `/orders` ระดับระบบสำหรับ roadmap

## Maintenance Rules

- ถ้าแก้ behavior/API/schema/env:
  - ต้องอัปเดต `AI_CONTEXT.md` และ `docs/HANDOFF.md`
- ถ้าเพิ่ม/แก้ route:
  - ต้องอัปเดต `docs/API_INVENTORY.md`
- ถ้าเปลี่ยน flow หน้า UI -> API:
  - ต้องอัปเดต `docs/UI_ROUTE_MAP.md`
- ถ้าแก้ schema/migration:
  - ต้องอัปเดต `docs/SCHEMA_MAP.md` และ `docs/drizzle-migrations.md` (เมื่อมีผลต่อวิธีทำงาน)
- ถ้าเปลี่ยน decision เชิงสถาปัตยกรรม:
  - ต้องอัปเดต `docs/DECISIONS.md`
