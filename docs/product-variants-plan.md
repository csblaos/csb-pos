# Product Variants Plan

เอกสารนี้สรุปแนวทางรองรับสินค้าแบบมีตัวเลือก (เช่น ขนาด/สี) สำหรับระบบ POS ปัจจุบัน

## Goal

- รองรับสินค้าแม่ 1 รายการที่มีหลายตัวเลือก (variants) ได้
- รักษา flow เดิมของ order/stock ให้เสถียร
- rollout แบบเป็นเฟส ลดความเสี่ยง production

## Current State (Before Full Variant UX)

- `products` คือสินค้าที่ขายจริง (sellable SKU)
- `order_items.product_id` และ `inventory_movements.product_id` ผูกกับ `products.id` โดยตรง
- สรุป: แกน order/stock ใช้ `products` เป็นแถวขายจริงอยู่แล้ว

## Data Model (Phase 1 - Done)

- ตารางใหม่:
  - `product_models` (สินค้าแม่)
  - `product_model_attributes` (แกนตัวเลือก เช่น `size`, `color`)
  - `product_model_attribute_values` (ค่าของแกน เช่น `750ml`, `black`)
- คอลัมน์ใหม่ใน `products`:
  - `model_id` (nullable FK -> `product_models.id`)
  - `variant_label`
  - `variant_options_json`
  - `variant_sort_order`

หลักสำคัญ:
- 1 variant = 1 sellable SKU ใน `products`
- order/stock ยังคงอ้าง `products.id` เหมือนเดิม

## UX Direction

### 1) Create/Edit Product

- เพิ่มโหมดสร้างสินค้าแบบ:
  - สินค้าเดี่ยว (single)
  - สินค้าแบบหลายตัวเลือก (variant model)
- เมื่อเลือกโหมด variant:
  - กรอกชื่อสินค้าแม่
  - เลือกแกนตัวเลือก (เช่น ขนาด, สี)
  - เพิ่มค่าของแต่ละแกน
  - ระบบสร้าง matrix ของ variant ให้แก้ SKU/Barcode/Price ต่อแถว

### 2) Product List

- แสดงสินค้าเป็นกลุ่ม:
  - แถวแม่ (model) + จำนวน variants
  - ขยายดูรายการ variant ใต้แม่
- ค้นหาได้ทั้งชื่อแม่, SKU และ barcode ของ variant

### 3) POS / Scanner

- สแกน barcode ต้องเข้าระดับ variant ทันที
- ถ้ากดเลือกจากสินค้าแม่ที่มีหลาย variant ให้มี step เลือก variant ก่อนเพิ่มลงออเดอร์

## Migration / Rollout Plan

1. Phase 1 (Done)
   - เพิ่ม schema และ migration แบบ additive
   - ยังไม่บังคับเปลี่ยน flow เดิม

2. Phase 2
   - เพิ่ม service/API สำหรับ CRUD ของ model/attributes/values
   - เพิ่ม validation:
     - ห้ามซ้ำ `variant_options_json` ภายใต้ model เดียวกัน
     - policy barcode/SKU ต่อร้าน

3. Phase 3
   - เพิ่ม UI จัดการ variant ในหน้า `/products`
   - เพิ่มการแสดง grouped list

4. Phase 4
   - เพิ่มเครื่องมือ migration ข้อมูลเดิม (optional)
   - เช่นจับกลุ่มสินค้าที่ชื่อเดียวกัน/หมวดเดียวกันให้เป็น model เดียว

5. Phase 5
   - เพิ่มรายงาน variant-level และ optimization query/index เพิ่มเติมตาม usage จริง

## Non-Goals (Phase 1)

- ยังไม่เปลี่ยน route หลักของ order/stock
- ยังไม่บังคับให้ทุกสินค้าเป็น model+variant
- ยังไม่ทำ auto-convert ข้อมูลเก่า
