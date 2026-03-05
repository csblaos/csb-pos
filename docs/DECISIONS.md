# Decisions Log (ADR-lite)

ไฟล์นี้บันทึก "ทำไม" ของการออกแบบสำคัญ เพื่อให้ AI/คนทำงานต่อไม่เดาเอง

## ADR-016: Pickup รองรับ 2 ลำดับด้วยสถานะกลาง `PICKED_UP_PENDING_PAYMENT`

- Date: March 5, 2026
- Status: Accepted
- Decision:
  - เพิ่มสถานะออเดอร์ `PICKED_UP_PENDING_PAYMENT` สำหรับเคสรับสินค้าแล้วแต่ยังไม่ชำระ
  - เพิ่ม action `mark_picked_up_unpaid` ใน `PATCH /api/orders/[orderId]` เพื่อรองรับลำดับ `รับสินค้า -> รับชำระ`
  - คงลำดับเดิม `รับชำระ -> รับสินค้า` ผ่าน `confirm_paid` ไว้เหมือนเดิม
  - ปรับ `cancel` ให้ตัดสินใจ `RELEASE` หรือ `RETURN` ตาม stock movement จริงของออเดอร์
- Reason:
  - หน้างานมีทั้งเคสเก็บเงินก่อนส่งมอบ และส่งมอบก่อนเก็บเงิน
  - หากใช้สถานะเดิมอย่างเดียวจะเกิดความกำกวมและเสี่ยงตัด/คืนสต็อกซ้ำ
- Consequence:
  - UI/API ต้องรองรับสถานะใหม่ใน map/filter/report
  - งานยกเลิก/ปิดยอดต้องอ่าน movement ของออเดอร์เพื่อกันคำนวณสต็อกผิด

## ADR-001: ใช้ Idempotency กับ Write Endpoint หลัก

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - ใช้ `idempotency_requests` กับ `POST /api/orders`, `PATCH /api/orders/[orderId]`, `POST /api/orders/[orderId]/shipments/label`
- Reason:
  - ลดปัญหายิงซ้ำจาก network retry/timeout
- Consequence:
  - ต้องส่ง `Idempotency-Key` ฝั่ง client เมื่อ action critical

## ADR-002: เก็บ Audit Event ทั้ง Success และ Fail

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - action สำคัญต้อง log `audit_events` ทั้งสำเร็จและล้มเหลว
- Reason:
  - ตรวจสอบย้อนหลังด้าน security และ debugging
- Consequence:
  - ทุก route/service critical ต้องมี audit context

## ADR-003: ผูก Business + Audit + Idempotency ใน Transaction เดียว (flow critical)

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - ใน flow สำคัญให้รวมการเขียนข้อมูลหลัก + audit + idempotency result ใน transaction
- Reason:
  - ลดสถานะครึ่งสำเร็จครึ่งล้มเหลว
- Consequence:
  - service/repository ต้องรองรับ tx object

## ADR-004: Shipping Label ใช้ Provider Abstraction (STUB/HTTP)

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - สร้าง layer `lib/shipping/provider.ts` รองรับ `STUB` และ `HTTP`
- Reason:
  - dev/test ได้เร็ว และสลับ provider จริงได้โดยไม่รื้อ service
- Consequence:
  - ต้องมี env config สำหรับ HTTP provider

## ADR-005: ต้องมี Manual Fallback สำหรับ Shipping Communication

- Date: February 17, 2026
- Status: Accepted
- Decision:
  - อนุญาตให้กรอก `shippingLabelUrl`/tracking แบบ manual และมีปุ่มส่งข้อมูลจัดส่ง + คัดลอกข้อความ
- Reason:
  - เมื่อ provider/API ส่งข้อความล้มเหลว ผู้ใช้ต้องทำงานต่อได้ทันที
- Consequence:
  - order detail ต้องมี UX สำหรับ manual send และบันทึกข้อมูลจัดส่งให้ครบก่อนส่ง

## ADR-006: ออกแบบสินค้าแบบ Variant ด้วยโครงสร้าง Additive (Model + Sellable SKU)

- Date: February 26, 2026
- Status: Accepted
- Decision:
  - เพิ่มตารางใหม่ `product_models`, `product_model_attributes`, `product_model_attribute_values`
  - ให้ `products` ยังเป็น sellable SKU/variant ที่ใช้กับ order/stock เหมือนเดิม
  - เชื่อม `products.model_id` เพื่อจัดกลุ่มเป็นสินค้าแม่ โดยไม่รื้อ flow เดิม
- Reason:
  - ลดความเสี่ยงกระทบระบบ order/inventory ที่ทำงานบน `products.id` อยู่แล้ว
  - รองรับ rollout เป็นเฟส (Phase 1 schema ก่อน, Phase 2 API, Phase 3 UX) ได้ปลอดภัยกว่า big-bang refactor
- Consequence:
  - ช่วงเปลี่ยนผ่านระบบรองรับทั้งสินค้าเดี่ยวและสินค้าแบบมี variant
  - Phase 2 เริ่มใช้งานแล้ว: create/edit product รองรับ payload `variant` และ backend เติม dictionary (`attributes/values`) ให้อัตโนมัติ
  - ยังคงต้องวาง policy เพิ่มเติมในเฟสถัดไปสำหรับ barcode/SKU ระดับ model/variant ที่ละเอียดขึ้นตามธุรกิจ

## ADR-007: Cost Governance ใช้ PO เป็นแหล่งหลัก และบังคับเหตุผลเมื่อแก้ต้นทุนมือ

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - ให้ต้นทุนจากการรับสินค้า PO เป็นเส้นทางหลักของการเปลี่ยน `products.costBase`
  - การแก้ต้นทุนแบบ manual (`action: update_cost`) ต้องส่ง `reason` ทุกครั้ง
  - บันทึก audit ทั้ง manual (`product.cost.manual_update`) และ auto จาก PO (`product.cost.auto_from_po`)
  - หน้า Product Detail แสดงที่มาของต้นทุนล่าสุด (source/timestamp/actor/reason/reference)
  - หน้า Reports แสดงทั้งกำไรแบบ realized (snapshot ตอนขาย) และ current-cost preview
- Reason:
  - ลดความเสี่ยงปรับต้นทุนแบบไม่มีหลักฐานและอธิบายย้อนหลังไม่ได้
  - แยกมุมมองกำไรเชิงบัญชี (realized) ออกจากมุมมองจำลองตามต้นทุนปัจจุบัน (what-if)
- Consequence:
  - ผู้ใช้ที่มีสิทธิ์แก้ต้นทุนต้องระบุเหตุผลก่อนบันทึกเสมอ
  - product payload มี metadata `costTracking` เพิ่มเพื่อใช้งานใน UI
  - รายงานกำไรมีตัวเลขเพิ่มที่เป็นค่าประเมินตามต้นทุนปัจจุบัน ซึ่งต้องสื่อสารว่าไม่ใช่ realized figure

## ADR-008: Stock Tabs ใช้ Keep-Mounted + Per-Tab Refresh

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เปลี่ยน `StockTabs` ให้คง state ของแท็บที่เคยเปิด (mount ครั้งแรกแล้วไม่ unmount ตอนสลับแท็บ)
  - แต่ละแท็บหลัก (`purchase`, `recording`, `history`) มี refresh ของตัวเองพร้อมแสดงเวลาอัปเดตล่าสุด
  - ไม่ใช้ prefetch แบบ bulk ข้ามแท็บ; อนุญาตเฉพาะ prefetch แบบ intent-driven ในจุดที่ผู้ใช้กำลังจะกด (เช่น PO row hover/focus/touch)
  - ฝั่ง client ของ `POST /api/stock/movements` ส่ง `Idempotency-Key` ทุกครั้ง
- Reason:
  - ลดการรีเซ็ตฟอร์ม/scroll/filter เมื่อผู้ใช้สลับแท็บไปมาในงานจริง
  - ให้ผู้ใช้ควบคุม network request ได้ตรงแท็บที่ใช้งาน และหลีกเลี่ยงการยิง prefetch ที่ไม่สัมพันธ์กับ intent จริง
  - ลดโอกาสบันทึก movement ซ้ำจากการกดซ้ำหรือ network retry
- Consequence:
  - memory footprint ฝั่งหน้า stock สูงขึ้นเล็กน้อยเพราะแท็บที่เปิดแล้วจะคงอยู่ใน memory
  - ข้อมูลข้ามแท็บอาจไม่ auto-sync ทันทีจนกว่าจะกด refresh ของแท็บนั้น (trade-off ที่ยอมรับได้เพื่อความเร็วการใช้งาน)
  - UX state มาตรฐาน (loading/empty/error/retry/last-updated) ต้องถูกดูแลให้สม่ำเสมอในทุกแท็บ

## ADR-009: History ใช้ Server-Side Pagination/Filter + Windowed Rendering

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่มโหมด `view=history` ใน `GET /api/stock/movements` สำหรับ list ประวัติแบบแบ่งหน้าและกรองจากเซิร์ฟเวอร์
  - ตัวกรองมาตรฐานคือ `type`, `q` (SKU/ชื่อสินค้า), `productId`, `dateFrom`, `dateTo`
  - ฝั่ง UI ใช้ windowed virtualization ในรายการต่อหน้าเพื่อลดจำนวน DOM nodes ที่ render พร้อมกัน
- Reason:
  - การโหลดและกรองประวัติด้วยข้อมูลทั้งหมดฝั่ง client ไม่ scale เมื่อข้อมูลเติบโต
  - list ยาวทำให้ interaction/drop frame ง่ายบนอุปกรณ์สเปกกลางหรือต่ำ
- Consequence:
  - contract ของ `/api/stock/movements` ต้องรองรับทั้งโหมด overview เดิมและโหมด history ใหม่
  - state ฝั่งหน้า history ซับซ้อนขึ้น (page/filter/loading/error/virtual window) แต่ตอบสนองเร็วขึ้นชัดเจนในข้อมูลจำนวนมาก

## ADR-010: PO Detail ใช้ Per-PO Cache + Intent-Driven Prefetch

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - ในแท็บ `purchase` ให้ cache รายละเอียด PO ต่อ `poId` ฝั่ง client เพื่อลด latency ตอนเปิดรายละเอียดซ้ำ
  - prefetch รายละเอียดเฉพาะกรณีมี intent ชัดเจน (`hover/focus/touch` บนแถวรายการ) และจำกัดการ prefetch เริ่มต้นเฉพาะรายการต้น ๆ
  - เมื่อมีการแก้ไข PO หรือเปลี่ยนสถานะ ให้ invalidate cache ของ `poId` นั้นทันที
- Reason:
  - แก้ความหน่วงตอนเปิด PO detail โดยไม่ต้องเพิ่ม prefetch ทุกแถว/ทุกแท็บ
  - ลด request ซ้ำและลดการ block UI ระหว่างรอ detail response
- Consequence:
  - state ฝั่ง UI ซับซ้อนขึ้นเล็กน้อย (cache + in-flight request map + invalidation)
  - ต้องคุมความถูกต้องของข้อมูลด้วย invalidation หลัง mutation ให้สม่ำเสมอ

## ADR-011: PO ต่างสกุลเงินรองรับ Deferred Exchange-Rate Lock

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - อนุญาตให้สร้าง PO สกุลเงินต่างประเทศโดยยังไม่ส่ง `exchangeRate` ได้ (สถานะ `รอปิดเรท`)
  - เพิ่ม endpoint `POST /api/stock/purchase-orders/[poId]/finalize-rate` สำหรับปิดเรทจริงภายหลัง (หลังรับสินค้า)
  - เก็บ metadata การล็อกเรทที่ PO (`exchangeRateLockedAt`, `exchangeRateLockedBy`, `exchangeRateLockNote`)
- Reason:
  - ธุรกิจจริงบางร้านทราบเรทจริงตอนชำระปลายงวด ไม่ใช่ตอนสร้าง PO
  - การบังคับกรอกเรทตั้งแต่ต้นทำให้เกิดข้อมูลเดาและต้องแก้ซ้ำ
- Consequence:
  - UI/flow ของ PO ต้องสื่อสถานะเรทชัดเจน (`รอปิดเรท` vs `ปิดเรทแล้ว`)
  - ฝั่ง backend ต้องรองรับทั้ง create แบบ locked-rate และ deferred-rate
  - ยังมี phase ถัดไปสำหรับการ reconcile เชิงบัญชีเต็มรูปแบบ (payment card + FX adjustment ledger)

## ADR-012: บังคับปิดเรทก่อนบันทึกชำระ PO ต่างสกุลเงิน

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่มสถานะชำระใน `purchase_orders` (`paymentStatus`, `paidAt`, `paidBy`, `paymentReference`, `paymentNote`)
  - เพิ่ม baseline rate (`exchangeRateInitial`) เพื่อใช้คำนวณผลต่างเรทเทียบเรทจริง
  - เพิ่ม endpoint `POST /api/stock/purchase-orders/[poId]/settle` สำหรับบันทึกชำระ และบังคับ rule:
    - ถ้า PO เป็นต่างสกุลเงินต้อง `ปิดเรท` ก่อนชำระ
  - เพิ่ม queue endpoint `GET /api/stock/purchase-orders/pending-rate` เพื่อโฟกัสงาน PO ที่รับแล้วแต่ยังไม่ปิดเรท
  - เพิ่มรายงาน FX delta ในหน้า reports จาก `exchangeRateInitial -> exchangeRate`
- Reason:
  - แก้ pain point ธุรกิจที่รู้เรทจริงตอนจ่ายปลายงวดและต้องการกันความผิดพลาดจากการจ่ายก่อนล็อกเรท
  - ทำให้ทีมเห็นภาระงานค้าง (`รอปิดเรท`) และผลกระทบจากส่วนต่างเรทในมุมรายงาน
- Consequence:
  - flow PO ชัดขึ้นเป็น `รับสินค้า -> ปิดเรท (ถ้าต่างสกุล) -> บันทึกชำระ`
  - มีข้อมูล audit + payment status สำหรับตรวจย้อนหลังและติดตามยอดค้างชำระ
  - schema/repository/service/UI มี state เพิ่มขึ้น ต้องคุม consistency ตอน refresh/cache ให้ครบ

## ADR-013: ใช้ Payment Ledger สำหรับ PO (รองรับ Partial + Reversal + AP Aging)

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่มตาราง `purchase_order_payments` เพื่อเก็บรายการชำระเป็น ledger (`PAYMENT` / `REVERSAL`)
  - ขยาย `purchase_orders.payment_status` เป็น `UNPAID | PARTIAL | PAID`
  - endpoint `settle` ต้องรับ `amountBase` เพื่อรองรับ partial payment
  - เพิ่ม endpoint reverse (`POST /api/stock/purchase-orders/[poId]/payments/[paymentId]/reverse`) แบบ idempotent
  - เพิ่ม `purchase_orders.due_date` และรายงาน `AP Aging` + export CSV เจ้าหนี้ค้างชำระ
- Reason:
  - โครงสร้างแบบ field เดียว (paidAt/paidBy/reference) ไม่พอสำหรับธุรกรรมหลายงวดและการย้อนรายการ
  - ต้องการ traceability ระดับรายการชำระเพื่อรองรับงานบัญชี/กระทบยอด supplier
  - ผู้ใช้ต้องเห็น aging bucket และยอดค้างจริงโดยไม่ต้องคำนวณนอกระบบ
- Consequence:
  - logic ใน list/detail/report ต้องคำนวณ `totalPaidBase/outstandingBase` จาก ledger
  - UI PO detail ซับซ้อนขึ้นเล็กน้อย (history payment + reverse action) แต่ auditability สูงขึ้น
  - ต้องดูแล `db:repair` ให้รองรับฐานเก่าที่ยังไม่มี `due_date`/`purchase_order_payments`

## ADR-014: AP ราย Supplier ใช้ Outstanding View เดียวกันทั้ง Summary/Statement/Export

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่ม API ชุด `ap-by-supplier` ใต้ `purchase-orders`:
    - `GET /api/stock/purchase-orders/ap-by-supplier`
    - `GET /api/stock/purchase-orders/ap-by-supplier/statement`
    - `GET /api/stock/purchase-orders/ap-by-supplier/export-csv`
  - ทั้ง 3 endpoint reuse ชุดข้อมูล `getOutstandingPurchaseRows` เดียวกัน แล้วค่อยทำ filter/aggregate ตาม supplier ที่ service layer
  - กำหนด supplier identity เป็น `supplierKey` (lowercase + trim; fallback เป็น key คงที่เมื่อไม่ระบุชื่อ supplier)
- Reason:
  - ลดความเสี่ยงตัวเลข AP ไม่ตรงกันระหว่าง widget รายงาน, statement, และไฟล์ export
  - ไม่เพิ่ม schema/ledger ใหม่ใน phase นี้ เพื่อส่งมอบหน้าราย supplier ได้เร็วและปลอดภัย
  - การมี `supplierKey` ทำให้ drill-down/filter/export ผูก supplier ตัวเดียวกันได้ชัดแม้ชื่อเดิมมีตัวพิมพ์ต่างกัน
- Consequence:
  - statement ใน phase นี้โฟกัสเฉพาะยอดค้างชำระ (outstanding > 0) ซึ่งเหมาะกับงาน AP daily
  - หากต้องการ statement แบบรวม PO ที่ปิดแล้วในอนาคต จะต้องเพิ่ม query mode อีกชุดโดยไม่กระทบ API ปัจจุบัน
  - logic การจัดกลุ่ม supplier ถูกย้ายมาอยู่ service กลาง (`purchase-ap.service`) เพื่อ reuse ในหลาย route

## ADR-015: Dashboard AP Reminder Reuse กติกา Due Status จาก Purchase AP Service

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่มข้อมูล `purchaseApReminder` ใน `getDashboardViewData` เพื่อแสดงงาน PO ค้างชำระที่ `OVERDUE` และ `DUE_SOON`
  - ใช้ `getPurchaseApDueReminders()` จาก `purchase-ap.service` โดยไม่สร้าง query ชุดใหม่ใน dashboard layer
  - แสดง reminder บน dashboard ทุก store type (online/cafe/restaurant/other) และลิงก์ผู้ใช้ไป `/stock?tab=purchase` เพื่อจัดการต่อ
- Reason:
  - ป้องกัน drift ของกติกา due status ระหว่างหน้า dashboard กับหน้า AP statement
  - ส่งมอบ reminder ได้เร็วใน phase นี้โดยไม่ต้องเพิ่ม notification system ใหม่
  - ทำให้ทีมเห็นงานเร่งด่วน (เลยกำหนด/ใกล้ครบกำหนด) ตั้งแต่หน้าแรกหลัง login
- Consequence:
  - payload ของ dashboard เพิ่มขึ้นเล็กน้อย แต่ cache TTL สั้น (`20s`) ยังรองรับงานประจำวันได้
  - reminder phase นี้เป็น in-app dashboard alert เท่านั้น; หากต้องการ push notification/cron ต้องทำ phase ถัดไป
  - รายการใน widget จำกัดจำนวน (top 5) เพื่อคงความกระชับ และใช้หน้า PO สำหรับ drill-down เชิงลึก

## ADR-016: Bulk Month-End Workflow ใช้ Client Orchestration บน Endpoint เดิม

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่ม workflow `ปิดเรท + ชำระปลายเดือน` แบบกลุ่มในหน้า `/stock?tab=purchase` โดยไม่สร้าง bulk endpoint ใหม่
  - ฝั่ง client จะเรียก `POST /finalize-rate` และ `POST /settle` ราย PO แบบลำดับ พร้อม `Idempotency-Key` แยกต่อรายการ
  - บังคับเงื่อนไขใน UI ว่า 1 รอบ bulk ต้องเลือก PO สกุลเงินเดียวกัน และกำหนด `paymentReference` รอบบัตรเดียวกัน
- Reason:
  - ตอบโจทย์ธุรกิจที่ไม่มีไฟล์ CSV ธนาคาร/บัตร และต้องเคลียร์หลาย PO ตอนปลายเดือนด้วย reference เดียว
  - ลดเวลาพัฒนา/ความเสี่ยง rollout โดย reuse business rule ที่มีอยู่ใน endpoint เดิม
  - รักษา traceability ระดับ PO/payment ledger เหมือน flow เดี่ยวทุกประการ
- Consequence:
  - ไม่มี API contract ใหม่ แต่ฝั่ง UI ซับซ้อนขึ้น (selection/progress/error aggregation)
  - ถ้ารายการกลางทาง fail อาจเกิด partial success ได้ จึงต้องมี feedback ราย PO และ retry เฉพาะรายการที่ fail
  - หากอนาคตต้องรองรับรายการระดับหลายร้อย PO ต่อรอบ ควรพิจารณา server-side batch job เพิ่มเติม

## ADR-017: Notification Workflow ใช้ Store-level Inbox + Rule Table และ Cron Reuse AP Reminder Logic

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่ม internal cron endpoint `GET /api/internal/cron/ap-reminders` เพื่อ sync แจ้งเตือน AP จาก `getPurchaseApDueReminders()`
  - ใช้ตาราง `notification_inbox` เป็น source-of-truth ของ in-app inbox โดยใช้ dedupe key ต่อ `PO + dueStatus + dueDate`
  - ใช้ตาราง `notification_rules` แยกสำหรับ policy `mute/snooze` ราย entity (เริ่มจาก `PURCHASE_ORDER`)
  - ให้สิทธิ์ `settings.view` อ่าน/mark inbox และ `settings.update` สำหรับตั้งกฎ mute/snooze
- Reason:
  - ต้องการส่งมอบ workflow เตือนงานค้างชำระที่ใช้งานได้ทันทีบน Vercel Hobby (cron วันละครั้ง)
  - แยก inbox data กับ suppression rule ทำให้ขยายช่องทางส่ง (email/push) ได้ภายหลังโดยไม่ผูกกับ UI หน้าเดียว
  - reuse due-status logic เดิม ลดความเสี่ยงตัวเลข/เงื่อนไข drift ระหว่าง dashboard กับ notification
- Consequence:
  - สถานะการอ่านเป็นระดับ store (ไม่ใช่ราย user) ใน phase นี้; หากต้องการ personal inbox ต้องเพิ่ม layer ต่อผู้ใช้ใน phase ถัดไป
  - งาน sync เป็น eventual consistency ตามรอบ cron; การเปลี่ยนสถานะ PO อาจสะท้อนใน inbox หลังรอบถัดไป
  - ต้องดูแล `CRON_SECRET` และ `vercel.json` ให้ตรง environment production

## ADR-018: เพิ่ม External Scheduler Fallback (GitHub Actions) สำหรับ AP Reminder Cron

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - เพิ่ม workflow `.github/workflows/ap-reminders-cron.yml` ให้ยิง `GET /api/internal/cron/ap-reminders` วันละครั้ง
  - ใช้ repository secrets `CRON_ENDPOINT` และ `CRON_SECRET` เพื่อ auth แบบเดียวกับ cron route ภายในระบบ
  - คง `vercel.json` cron เดิมไว้ และใช้ GitHub Actions เป็น fallback สำหรับ environment ที่ไม่สะดวกพึ่ง Vercel Cron อย่างเดียว
- Reason:
  - บาง deployment (โดยเฉพาะ Vercel Free/Hobby บางโปรเจกต์) ต้องการ scheduler สำรองที่ควบคุมได้จาก repo
  - ลด operational risk กรณี cron provider เดียวมีข้อจำกัด/ล้มเหลวชั่วคราว
  - ไม่ต้องเพิ่ม endpoint ใหม่ เพราะ reuse route เดิมที่มี auth/logic ครบแล้ว
- Consequence:
  - ถ้าเปิดทั้ง Vercel Cron และ GitHub Actions พร้อมกัน จะมีการยิงซ้ำได้ แต่ผลลัพธ์ยังคง idempotent จาก dedupe key
  - ต้องดูแล secrets เพิ่มใน GitHub (`CRON_ENDPOINT`, `CRON_SECRET`)
  - การเปลี่ยน URL production ต้องอัปเดตค่า `CRON_ENDPOINT` ให้ตรงทันที

## ADR-019: Navbar คงปุ่มสลับร้าน และเพิ่ม Quick Notification Inbox แบบ Compact

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - ไม่ลบปุ่ม `เปลี่ยนร้าน` ออกจาก navbar แต่ปรับเป็น compact icon-first และซ่อนเมื่ออยู่หน้า `/settings/stores`
  - เพิ่ม bell ใน navbar สำหรับ quick inbox ของ notification (badge unread + รายการล่าสุด + action อ่านแล้ว)
  - ให้ quick inbox ใช้ API เดิม `GET/PATCH /api/settings/notifications/inbox` โดยไม่เพิ่ม endpoint ใหม่
- Reason:
  - การสลับร้านเป็น action สำคัญเพื่อกันการทำงานผิดร้าน จึงไม่ควรถูกถอดออก
  - ผู้ใช้ต้องเห็นงาน due/overdue ได้ทันทีจากทุกหน้า โดยไม่ต้องเข้า settings ก่อน
  - reuse API เดิมลดภาระ maintenance และหลีกเลี่ยง logic ซ้ำ
- Consequence:
  - global header มี network call เพิ่ม (polling inbox) แต่จำกัดปริมาณด้วย `limit` และช่วงเวลา refresh
  - quick inbox ผูกสิทธิ์ `settings.view`; role ที่ไม่มีสิทธิ์นี้จะไม่เห็น bell
  - ฟังก์ชันครบถ้วน (mute/snooze/filter ลึก) ยังคงอยู่ที่หน้า `/settings/notifications`
  - desktop ใช้ anchored popover เดิม ส่วนจอ non-desktop (`<1024px`) render แบบ fixed-centered + จำกัดความสูงเพื่อไม่ให้ล้นจอ/ล้นซ้าย
  - เพิ่ม graceful fallback ของ API inbox เมื่อ schema notification ยังไม่พร้อม เพื่อลด 500 และให้ระบบยังใช้งานส่วนอื่นได้

## ADR-020: Purchase Tab ใช้ Workspace-first IA เพื่อลด Cognitive Load

- Date: February 27, 2026
- Status: Accepted
- Decision:
  - หน้า `/stock?tab=purchase` แยกเป็น 3 workspace ใน route เดียว: `PO Operations`, `Month-End Close`, `AP by Supplier`
  - แยกบล็อก workspace navigation ออกจากบล็อก KPI/shortcut เพื่อให้ hierarchy ชัด
  - เพิ่ม summary strip ด้านบน (`Open PO`, `Pending Rate`, `Overdue AP`, `Outstanding`) เป็น KPI summary-only และใช้ saved preset เป็น shortcut เพื่อพาไป workspace พร้อมตัวกรองด่วน
  - จำ workspace ล่าสุดด้วย query `workspace` และ localStorage เพื่อให้เข้าแท็บ PO แล้วกลับไปที่ workspace เดิมได้
  - sync ตัวกรองหลักลง URL (`poStatus`, `due`, `payment`, `sort`) เพื่อแชร์ลิงก์มุมมองเดียวกันได้
  - เพิ่ม saved preset ต่อผู้ใช้ (localStorage) สำหรับ shortcut ที่ใช้บ่อย และรองรับลบ preset หน้าเดียวกัน
  - คง API และ business logic เดิมทั้งหมด แล้วปรับเฉพาะการจัดกลุ่มข้อมูลและ interaction flow ฝั่ง UI
- Reason:
  - PO tab มีงานหลายประเภท (daily ops, month-end close, AP analysis) จึงเกิด context-switch สูงเมื่อทุก section อยู่หน้าเดียว
  - ผู้ใช้ปลายเดือนต้องเข้าถึง workflow ปิดเรท/ชำระแบบเร็วโดยไม่ถูกกลบด้วยรายการ PO รายวัน
  - ลดความเสี่ยง regression เพราะไม่แตะ API/validation/reconcile logic
- Consequence:
  - ผู้ใช้ต้องเรียนรู้ workspace switcher ใหม่ 1 จุด แต่แลกกับหน้าที่สั้นลงและโฟกัสดีขึ้น
  - summary/KPI อ้างอิงจากข้อมูลที่หน้าโหลดอยู่ (client-side snapshot) จึงเป็นแนว operational indicator ไม่ใช่ report ทางบัญชีแบบปิดงวด
  - saved preset แบบ localStorage ผูกกับ browser/device เดียว; หากต้องการ sync ข้ามอุปกรณ์ต้องทำ server-side preference ในเฟสถัดไป
  - การขยายฟีเจอร์ถัดไป (เช่น queue เพิ่ม, policy action) จะเพิ่มใน workspace ที่เกี่ยวข้องได้โดยไม่ทำให้หน้าแน่นเกินไป

## ADR-021: Date Input มาตรฐานใช้ Custom Datepicker ทั่วระบบ

- Date: March 2, 2026
- Status: Accepted
- Decision:
  - กำหนด default ของฟิลด์วันที่ใน UI เป็น custom datepicker เดียวกันทั้งระบบ (calendar popover)
  - ฟอร์แมตค่าที่เก็บ/ส่ง API ยังคงเป็น `YYYY-MM-DD` ตาม contract เดิม
  - native `input[type=date]` ใช้ได้เฉพาะหน้าภายในเชิงเทคนิค/แอดมินที่ไม่กระทบ UX ผู้ใช้ปลายทาง
- Reason:
  - native date input ให้พฤติกรรมไม่สม่ำเสมอระหว่าง browser/device โดยเฉพาะบนมือถือ (placeholder, layout, keyboard, overflow)
  - ลดความซับซ้อนในการใช้งานและทำให้ interaction ของวันที่คงที่ทุก flow
- Consequence:
  - ฟอร์มที่เพิ่มช่องวันที่ใหม่ต้อง reuse component datepicker มาตรฐานแทนการใช้ native date input
  - ทีมต้องดูแล accessibility และ keyboard interaction ของ component กลางให้ครบ เพราะถูกใช้งานหลายหน้า
  - ไม่ต้องเปลี่ยน backend schema/API เนื่องจากยังส่งค่า `YYYY-MM-DD` เหมือนเดิม

## ADR-022: ราคาขายหน่วยแปลงแบบ Optional Override

- Date: March 2, 2026
- Status: Accepted
- Decision:
  - เพิ่มคอลัมน์ `product_units.price_per_unit` (nullable) สำหรับเก็บราคาขายของหน่วยแปลงโดยตรง
  - หน้า create/edit product ให้กรอก `pricePerUnit` ต่อหน่วยแปลงได้ แต่ไม่บังคับ
  - Flow สร้างออเดอร์ (`/orders`, `/orders/new`, `POST /api/orders`) ใช้ "ราคาของหน่วยที่เลือก" ในการคำนวณ `lineTotal`
  - ถ้า `price_per_unit` ไม่มีค่า ให้ fallback เป็นสูตรเดิม `products.price_base x multiplier_to_base`
- Reason:
  - รองรับเคสธุรกิจจริงที่ราคาแพ็กไม่เป็นสัดส่วนตรงกับหน่วยย่อย (เช่น EA=1,000 แต่ PACK(12)=10,000)
  - ลดการบิดข้อมูลด้วยการเปลี่ยนราคาหน่วยหลักเพื่อบังคับให้แพ็กราคาถูกลง/แพงขึ้น
- Consequence:
  - `order_items.price_base_at_sale` จะเก็บราคาต่อหน่วยที่ขายจริง (ตาม unit ที่เลือก) เพื่อสะท้อนยอดขายจริงของบรรทัดนั้น
  - รายงานรายได้ยังอิง `order_items.line_total` เหมือนเดิม และฝั่ง COGS ยังอิง `qty_base x cost_base_at_sale`
  - ต้องคง fallback rule ให้ครบทั้ง UI และ API เพื่อลด regression กับข้อมูลเก่าที่ไม่มี `price_per_unit`

## ADR-023: Layout Breakpoint Contract สำหรับ Tablet/Desktop

- Date: March 3, 2026
- Status: Accepted
- Decision:
  - กำหนดนิยาม breakpoint กลางของแอปเป็น `mobile <768`, `tablet 768-1199`, `desktop >=1200`
  - app shell หลักและ system-admin shell จะถูก constrain เฉพาะ desktop (`>=1200`) และให้ tablet ใช้พื้นที่เต็มหน้าจอ
  - `SlideUpSheet` ใช้ contract เดียวกันทั้งระบบ:
    - mobile = bottom sheet
    - tablet = centered sheet (`min(45rem, 100vw-2rem)`, สูงสุด `92dvh`)
    - desktop = centered modal (desktop max-width คุมผ่าน `panelMaxWidthClass`)
  - นโยบาย desktop-only UI (เช่นปุ่ม fullscreen บน navbar) ให้ยึด threshold `>=1200`
- Reason:
  - เดิมมีหลาย threshold ปนกัน (`sm`, `lg`, logic 1024) ทำให้ UX tablet/desktop ไม่สม่ำเสมอ
  - ต้องการให้ tablet ได้พื้นที่ใช้งานเต็มจอ แต่ desktop ยังอ่านง่ายด้วย constrained width
- Consequence:
  - โค้ดใหม่ที่เกี่ยวกับ layout/overlay ต้องอิง contract เดียวกันนี้เพื่อลด drift
  - การเปลี่ยน threshold มีผลต่อ interaction บางจุด (เช่น quick inbox/fullscreen) จึงต้องยืนยัน behavior ใน QA matrix ของ tablet และ desktop
  - หากต้องการ desktop wide mode ในหน้าข้อมูลหนาแน่น ให้เพิ่มผ่าน token (`--app-shell-max-width-desktop-wide`) โดยไม่แก้ breakpoint หลัก

## ADR-024: Overlay Standardization ใช้ SlideUpSheet เป็นค่าเริ่มต้น และ Migrate แบบเป็นเฟส

- Date: March 3, 2026
- Status: Accepted
- Decision:
  - กำหนดให้ modal/sheet ใหม่ในฝั่ง app ใช้ `components/ui/slide-up-sheet.tsx` เป็นค่าเริ่มต้น
  - หน้าที่มี custom overlay เดิมให้ migrate แบบเป็นเฟส โดยเริ่มจาก flow ความเสี่ยงต่ำก่อน
  - phase migration ปัจจุบัน complete แล้ว: `categories`, `units`, `store payment accounts`, `users`, `stores`, และ force-change password modal ใน `login`
- Reason:
  - โค้ด overlay กระจายหลายไฟล์ทำให้ปรับ behavior รายอุปกรณ์ได้ยากและเสี่ยง drift
  - migrate ทั้งหมดในครั้งเดียวมีความเสี่ยง regression สูงสำหรับฟอร์มที่ซับซ้อน
- Consequence:
  - งานใหม่ที่มี overlay ต้อง reuse `SlideUpSheet` เพื่อลดต้นทุนดูแล
  - backlog overlay legacy ฝั่ง settings ปิดครบแล้ว และทีมต้องยืนยัน parity ของ UX หลัง refactor ในรอบ regression test
  - การ debug keyboard-aware/scroll-lock/escape-close จะรวมศูนย์มากขึ้นที่คอมโพเนนต์เดียว

## ADR-025: แยกสิทธิ์ COD Return จาก Ship แบบ Strict + Backfill Role อัตโนมัติ

- Date: March 4, 2026
- Status: Accepted
- Decision:
  - เพิ่ม permission ใหม่ `orders.cod_return` สำหรับ action `mark_cod_returned`
  - บังคับตรวจสิทธิ์ `orders.cod_return` แบบ strict ทั้ง API และหน้า detail (เลิก fallback `orders.ship`)
  - migration ทำ backfill อัตโนมัติ: role ใดที่มี `orders.ship` จะได้ `orders.cod_return` เพิ่มทันที
- Reason:
  - ต้องการแยกสิทธิ์ "จัดส่ง" ออกจาก "รับงานตีกลับ" ให้ควบคุมบทบาทได้ละเอียดขึ้น
  - ต้องคง continuity ของ role เดิม จึงเลือก backfill ผ่าน migration แทน fallback ใน runtime
- Consequence:
  - policy สิทธิ์ชัดเจนขึ้น (ship ไม่เท่ากับ return)
  - store เดิมใช้งานต่อได้จาก backfill ในชั้นข้อมูล โดยไม่เพิ่มเงื่อนไขพิเศษในโค้ด API

## ADR-026: COD Returned Timestamp เป็นแหล่งจริงของรายงานตีกลับรายวัน

- Date: March 4, 2026
- Status: Accepted
- Decision:
  - เพิ่มคอลัมน์ `orders.cod_returned_at`
  - ตั้งค่า `cod_returned_at` ตอน action `mark_cod_returned` สำเร็จ
  - หน้า `/reports` คำนวณ metric รายวันของ COD return จาก `cod_returned_at` โดยตรง
- Reason:
  - การนับจาก status อย่างเดียวแยก "วันนี้" ไม่แม่น (ไม่รู้ timestamp ที่เกิด return จริง)
  - ต้องการตัวเลขรายวันสำหรับควบคุมคุณภาพงาน COD/ขนส่ง
- Consequence:
  - รายงาน `ตีกลับวันนี้` และ `ค่าส่งเสียวันนี้` แม่นตามเหตุการณ์จริง
  - ต้องดูแล migration/backfill ค่าเดิมเพื่อให้ข้อมูลเก่าอ่านได้ต่อเนื่อง

## ADR-027: Shipping Provider เปลี่ยนจาก Hardcode เป็น Store Master

- Date: March 5, 2026
- Status: Accepted
- Decision:
  - เพิ่มตาราง `shipping_providers` เป็น master ต่อร้าน (`code`, `display_name`, `branch_name`, `aliases`, `active`, `sort_order`)
  - หน้า POS ออนไลน์ (`/orders/new`) อ่านรายการ provider จาก `getOrderCatalogForStore().shippingProviders` แทน hardcode ใน component
  - คง fallback UI `อื่นๆ` ให้กรอกชื่อ provider ได้ เพื่อไม่บล็อกงานหน้างานและรองรับ provider ที่ยังไม่ตั้ง master
  - onboarding/repair/migration จะ seed ค่าเริ่มต้น (`Houngaloun`, `Anousith`, `Mixay`) ให้ร้านใหม่และฐานเดิม
- Reason:
  - ลดปัญหาชื่อขนส่งแตกหลายรูปแบบ ทำให้รายงาน COD ต่อขนส่งเพี้ยน
  - เตรียมโครงสำหรับเชื่อม shipping API และ mapping alias ในเฟสถัดไป
- Consequence:
  - ข้อมูล provider ในออเดอร์ยังเก็บเป็น snapshot (`orders.shipping_provider`) เพื่อคงประวัติ ณ ตอนสร้างออเดอร์
  - ทีมต้องย้ายการแก้รายชื่อ provider ไปแก้ที่ master (หรือ fallback `อื่นๆ`) แทนการแก้โค้ดหน้า POS
  - มีหน้า settings สำหรับจัดการ master แล้วที่ `/settings/store/shipping-providers` และ CRUD ผ่าน `/api/settings/store/shipping-providers`

## ADR-028: ยกเลิกออเดอร์ใช้ Step-Up Approval จาก Owner/Manager

- Date: March 5, 2026
- Status: Accepted
- Decision:
  - action `cancel` ใน `PATCH /api/orders/[orderId]` บังคับ payload เพิ่ม `approvalEmail`, `approvalPassword`, `cancelReason`
  - ผู้กดยกเลิกต้องมีสิทธิ์ส่งคำขออย่างน้อยหนึ่งสิทธิ์ (`orders.update`/`orders.cancel`/`orders.delete`)
  - API ตรวจผู้อนุมัติจากสมาชิก active ร้านเดียวกัน และ role ต้องเป็น `Owner` หรือ `Manager` พร้อมตรวจรหัสผ่านจริงก่อนยกเลิก
  - audit event `order.cancel` ต้องเก็บทั้งเหตุผลยกเลิกและข้อมูลผู้อนุมัติ (`approvedBy*`)
- Reason:
  - งานยกเลิกออเดอร์มีผลกระทบสต็อก/รายได้สูง จึงต้องมี second-factor เชิงบทบาทแทนการให้พนักงานทั่วไปยกเลิกได้เอง
  - ยังต้องคงความเร็วหน้างาน จึงอนุญาตให้พนักงานส่งคำขอได้ถ้ามีสิทธิ์แก้ไขออเดอร์ และให้หัวหน้าร้านอนุมัติในจุดเดียว
- Consequence:
  - UX หน้า order detail เพิ่มขั้นตอนกรอกผู้อนุมัติและเหตุผลก่อนยกเลิก
  - ทีมตรวจย้อนหลังเหตุยกเลิกได้ชัดขึ้นจาก audit metadata
  - การตั้งสิทธิ์ role ในร้านต้องมีอย่างน้อย Owner/Manager ที่พร้อมอนุมัติในรอบงาน

## Template สำหรับ ADR ใหม่

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Deprecated
- Decision:
- Reason:
- Consequence:
