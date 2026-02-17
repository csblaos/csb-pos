# Agent Rules For This Repo

AI ทุกตัวที่เข้ามาทำงานในโปรเจกต์นี้ให้ทำตามลำดับนี้:

1. อ่าน `AI_CONTEXT.md` ก่อนเริ่มงาน
2. ถ้าแก้ behavior/API/schema/env ต้องอัปเดต:
   - `AI_CONTEXT.md`
   - `docs/HANDOFF.md`
   - และถ้าเกี่ยวข้องให้ปรับ:
    - `docs/API_INVENTORY.md` (เมื่อมี route/API เปลี่ยน)
    - `docs/UI_ROUTE_MAP.md` (เมื่อ flow หน้า -> API เปลี่ยน)
    - `docs/SCHEMA_MAP.md` (เมื่อ schema/migration เปลี่ยน)
3. ถ้ามีการตัดสินใจเชิงสถาปัตยกรรม/trade-off ใหม่ ให้เพิ่มใน `docs/DECISIONS.md`
4. ก่อนส่งงานให้รันอย่างน้อย:
   - `npm run lint`
   - `npm run build`

ข้อกำหนดการสื่อสาร:
- ตอบผู้ใช้เป็นภาษาไทย
- แนะนำแนวทางก่อนเริ่มแก้ใหญ่หรือเปลี่ยนโครงสร้าง
