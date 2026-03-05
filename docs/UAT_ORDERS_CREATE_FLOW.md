# UAT Checklist: Orders Create Flow (Walk-in / Pickup / Online / COD)

เอกสารนี้ใช้สำหรับทดสอบรับงาน (UAT) ให้ทีมใช้ step เดียวกันและตัดสินผลเหมือนกัน

## ข้อมูลรันทดสอบ

- วันที่ทดสอบ:
- ผู้ทดสอบ:
- สภาพแวดล้อม: `local` / `staging` / `production`
- สาขา/ร้าน:
- Build/Commit:

## กติกาก่อนเริ่ม

1. ใช้สินค้าที่มีสต็อกพออย่างน้อย 3 ชิ้น
2. จด `orderNo` ทุกเคส
3. หลังจบแต่ละเคส ให้เปิดหน้า order detail ตรวจ `status`, `paymentStatus`
4. ตรวจผลสต็อกจาก movement หรือยอดคงเหลือก่อน/หลังทดสอบ

---

## Case 1: Walk-in + ชำระแล้ว (เงินสด/QR/โอน)

- Result: `PASS / FAIL`
- Order No:
- หลักฐาน (ลิงก์รูป/วิดีโอ):

### Steps

1. เข้า `/orders/new`
2. เลือก flow `Walk-in ทันที`
3. เพิ่มสินค้า 1 รายการ
4. เลือกวิธีชำระ `เงินสด` หรือ `QR` หรือ `โอน`
5. กด `สร้างออเดอร์`

### Expected

1. ออเดอร์ถูกสร้างสำเร็จ
2. `status = PAID`
3. `paymentStatus = PAID`
4. มี movement `OUT` ทันที (ไม่ค้าง `RESERVE`)

---

## Case 2: Walk-in + ค้างจ่าย

- Result: `PASS / FAIL`
- Order No:
- หลักฐาน (ลิงก์รูป/วิดีโอ):

### Steps

1. เข้า `/orders/new`
2. เลือก flow `Walk-in ทันที`
3. เพิ่มสินค้า 1 รายการ
4. เลือกวิธีชำระ `ค้างจ่าย`
5. กด `สร้างออเดอร์`

### Expected

1. ออเดอร์ถูกสร้างสำเร็จ
2. `status = PENDING_PAYMENT`
3. `paymentStatus = UNPAID`
4. มี movement `RESERVE` (ยังไม่ `OUT`)

---

## Case 3: Pickup Later + ชำระแล้ว

- Result: `PASS / FAIL`
- Order No:
- หลักฐาน (ลิงก์รูป/วิดีโอ):

### Steps

1. เข้า `/orders/new`
2. เลือก flow `มารับที่ร้านภายหลัง`
3. เพิ่มสินค้า 1 รายการ
4. เลือกวิธีชำระ `เงินสด` หรือ `QR` หรือ `โอน`
5. กด `สร้างออเดอร์`
6. เข้า order detail แล้วกด `ยืนยันรับสินค้า`

### Expected

1. หลังสร้างทันที: `status = READY_FOR_PICKUP`, `paymentStatus = PAID`
2. หลังกด `ยืนยันรับสินค้า`: `status = PAID`, `paymentStatus = PAID`
3. movement ตอนสร้างเป็น `RESERVE`
4. movement ตอนกดรับสินค้าเป็น `RELEASE + OUT`

---

## Case 4: Pickup Later + ค้างจ่าย

- Result: `PASS / FAIL`
- Order No:
- หลักฐาน (ลิงก์รูป/วิดีโอ):

### Steps

1. เข้า `/orders/new`
2. เลือก flow `มารับที่ร้านภายหลัง`
3. เพิ่มสินค้า 1 รายการ
4. เลือกวิธีชำระ `ค้างจ่าย`
5. กด `สร้างออเดอร์`

### Expected

1. ออเดอร์ถูกสร้างสำเร็จ
2. `status = READY_FOR_PICKUP`
3. `paymentStatus = UNPAID`
4. มี movement `RESERVE` (ยังไม่ `OUT`)

---

## Case 5: Online Delivery + ชำระแล้ว (ไม่ใช่ COD)

- Result: `PASS / FAIL`
- Order No:
- หลักฐาน (ลิงก์รูป/วิดีโอ):

### Steps

1. เข้า `/orders/new`
2. เลือก flow `สั่งออนไลน์/จัดส่ง`
3. เพิ่มสินค้า 1 รายการ
4. กรอกข้อมูลที่อยู่จัดส่งและเลือกผู้ให้บริการขนส่ง
5. เลือกวิธีชำระ `เงินสด` หรือ `QR` หรือ `ค้างจ่าย`
6. กด `สร้างออเดอร์`

### Expected

1. ออเดอร์ถูกสร้างสำเร็จ
2. `status = DRAFT` (ตาม flow ออนไลน์ปัจจุบัน)
3. ถ้าเลือก `QR` ระบบบังคับ logic สลิปตาม policy เดิม

---

## Case 6: Online Delivery + COD

- Result: `PASS / FAIL`
- Order No:
- หลักฐาน (ลิงก์รูป/วิดีโอ):

### Steps

1. เข้า `/orders/new`
2. เลือก flow `สั่งออนไลน์/จัดส่ง`
3. เพิ่มสินค้า 1 รายการ
4. กรอกข้อมูลที่อยู่จัดส่งและเลือกผู้ให้บริการขนส่ง
5. เลือกวิธีชำระ `COD`
6. กด `สร้างออเดอร์`
7. ใน order detail กด `Mark Packed` และ `Mark Shipped`
8. กด `ยืนยันรับเงินปลายทาง (COD)` พร้อมกรอกยอดโอนจริง

### Expected

1. หลังสร้าง: ออเดอร์ออนไลน์พร้อม COD ผ่าน validation
2. หลังส่งของ: `status = SHIPPED`, `paymentStatus = COD_PENDING_SETTLEMENT`
3. หลังปิดยอด COD: `paymentStatus = COD_SETTLED`

---

## สรุปผลรอบทดสอบ

- ผ่านทั้งหมดกี่เคส:
- ไม่ผ่านกี่เคส:
- เคสที่ไม่ผ่านและหมายเหตุ:
- ข้อเสนอแนะก่อนปล่อยใช้งาน:
