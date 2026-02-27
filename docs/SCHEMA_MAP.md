# Schema Map

อ้างอิงจาก `lib/db/schema/tables.ts` และ migration ปัจจุบัน

## Migration Status

- journal entries: `32`
- latest migration tag: `0032_light_spacker_dave`
- latest focus:
  - โครงสร้างสินค้าแบบ Variant (Phase 1):
    - `product_models`
    - `product_model_attributes`
    - `product_model_attribute_values`
    - คอลัมน์ใหม่ใน `products` (`model_id`, `variant_label`, `variant_options_json`, `variant_sort_order`)
  - เพิ่ม deferred FX lock ใน `purchase_orders`:
    - `exchange_rate_locked_at`
    - `exchange_rate_locked_by`
    - `exchange_rate_lock_note`
  - เพิ่ม PO payment + FX baseline ใน `purchase_orders`:
    - `exchange_rate_initial`
    - `payment_status`
    - `paid_at`
    - `paid_by`
    - `payment_reference`
    - `payment_note`
  - เพิ่ม `purchase_orders.due_date`
  - เพิ่มตาราง ledger การชำระ `purchase_order_payments`:
    - `entry_type` (`PAYMENT`/`REVERSAL`)
    - `amount_base`
    - `paid_at`
    - `reversed_payment_id`
  - เพิ่ม notification workflow:
    - ตาราง `notification_inbox` (in-app inbox + dedupe key)
    - ตาราง `notification_rules` (mute/snooze policy ต่อ entity)

## Table Inventory (High-level)

### Identity / Store / Access

- `users`
- `stores`
- `system_config`
- `store_type_templates`
- `roles`
- `permissions`
- `role_permissions`
- `store_members`
- `store_branches`
- `store_member_branches`

### Catalog / Inventory

- `units`
- `product_categories`
- `product_models`
- `product_model_attributes`
- `product_model_attribute_values`
- `products`
- `product_units`
- `contacts`
- `inventory_movements`

### Orders / Shipping / Purchase

- `orders`
- `order_items`
- `order_shipments`
- `purchase_orders`
- `purchase_order_items`
- `purchase_order_payments`

### Reliability / Audit / Integration

- `idempotency_requests`
- `audit_events`
- `notification_inbox`
- `notification_rules`
- `fb_connections`
- `wa_connections`

## Core Relationships

### Store and Membership

- `roles.store_id -> stores.id`
- `store_members.store_id -> stores.id`
- `store_members.user_id -> users.id`
- `store_members.role_id -> roles.id`
- `store_branches.store_id -> stores.id`
- `store_member_branches.(store_id,user_id,branch_id)` เชื่อมสมาชิกกับสาขา

### Product and Stock

- `products.store_id -> stores.id`
- `products.base_unit_id -> units.id`
- `products.category_id -> product_categories.id`
- `products.model_id -> product_models.id`
- `product_models.store_id -> stores.id`
- `product_models.category_id -> product_categories.id`
- `product_model_attributes.model_id -> product_models.id`
- `product_model_attribute_values.attribute_id -> product_model_attributes.id`
- `product_units.product_id -> products.id`
- `product_units.unit_id -> units.id`
- `inventory_movements.store_id -> stores.id`
- `inventory_movements.product_id -> products.id`

### Orders

- `orders.store_id -> stores.id`
- `orders.contact_id -> contacts.id`
- `orders.payment_account_id -> store_payment_accounts.id`
- `orders.created_by -> users.id`
- `order_items.order_id -> orders.id`
- `order_items.product_id -> products.id`
- `order_items.unit_id -> units.id`

### Shipping

- `order_shipments.order_id -> orders.id`
- `order_shipments.store_id -> stores.id`
- `order_shipments.created_by -> users.id`
- order-level snapshot fields in `orders`:
  - `shipping_provider`
  - `shipping_label_status`
  - `shipping_label_url`
  - `shipping_request_id`
  - `tracking_no`

### Purchase

- `purchase_orders.store_id -> stores.id`
- `purchase_orders.created_by -> users.id`
- `purchase_orders.updated_by -> users.id`
- `purchase_orders.exchange_rate_locked_by -> users.id`
- `purchase_orders.paid_by -> users.id`
- `purchase_order_items.purchase_order_id -> purchase_orders.id`
- `purchase_order_items.product_id -> products.id`
- `purchase_order_payments.purchase_order_id -> purchase_orders.id`
- `purchase_order_payments.store_id -> stores.id`
- `purchase_order_payments.created_by -> users.id`
- `purchase_order_payments.reversed_payment_id -> purchase_order_payments.id`

### Reliability / Audit

- `idempotency_requests.store_id -> stores.id`
- `idempotency_requests.created_by -> users.id`
- `audit_events.store_id -> stores.id`
- `audit_events.actor_user_id -> users.id`
- `notification_inbox.store_id -> stores.id`
- `notification_rules.store_id -> stores.id`
- `notification_rules.updated_by -> users.id`

## Important Enums / Statuses

### Orders

- channel: `WALK_IN | FACEBOOK | WHATSAPP`
- payment method: `CASH | LAO_QR | COD | BANK_TRANSFER`
- payment status:
  - `UNPAID`
  - `PENDING_PROOF`
  - `PAID`
  - `COD_PENDING_SETTLEMENT`
  - `COD_SETTLED`
  - `FAILED`
- shipping label status:
  - `NONE`
  - `REQUESTED`
  - `READY`
  - `FAILED`
- order status: `DRAFT | PENDING_PAYMENT | PAID | PACKED | SHIPPED | CANCELLED`

### Reliability

- idempotency status: `PROCESSING | SUCCEEDED | FAILED`
- audit scope: `STORE | SYSTEM`
- audit result: `SUCCESS | FAIL`
- notification topic: `PURCHASE_AP_DUE`
- notification entity type: `PURCHASE_ORDER`
- notification severity: `INFO | WARNING | CRITICAL`
- notification status: `UNREAD | READ | RESOLVED`
- notification due status: `OVERDUE | DUE_SOON`

### Purchase

- PO status: `DRAFT | ORDERED | SHIPPED | RECEIVED | CANCELLED`
- PO payment status: `UNPAID | PARTIAL | PAID`
- PO payment entry type: `PAYMENT | REVERSAL`

## Indexes Worth Knowing (Operational)

- orders:
  - `orders_store_status_created_at_idx`
  - `orders_store_payment_method_idx`
  - `orders_store_payment_status_created_at_idx`
  - `orders_store_shipping_label_status_updated_idx`
- order shipments:
  - `order_shipments_order_id_idx`
  - `order_shipments_store_status_created_at_idx`
  - `order_shipments_provider_request_id_idx`
- idempotency:
  - unique `idempotency_requests_store_action_key_unique`
- audit:
  - `audit_events_scope_occurred_at_idx`
  - `audit_events_store_occurred_at_idx`
- notifications:
  - unique `notification_inbox_store_dedupe_unique`
  - `notification_inbox_store_status_detected_idx`
  - `notification_inbox_store_topic_detected_idx`
  - unique `notification_rules_store_topic_entity_unique`
  - `notification_rules_store_topic_idx`
- product variants:
  - `product_models_store_name_unique`
  - `product_model_attributes_model_code_unique`
  - `product_model_attribute_values_attribute_code_unique`
  - `products_model_variant_options_unique`
- purchase:
  - `po_exchange_rate_locked_at_idx`
  - `po_payment_status_paid_at_idx`
  - `po_due_date_idx`
  - `po_supplier_received_at_idx`
  - `po_payments_po_id_idx`
  - `po_payments_store_paid_at_idx`
  - `po_payments_reversed_id_idx`

## Schema Change Checklist

1. แก้ `lib/db/schema/tables.ts`
2. รัน `npm run db:generate`
3. ตรวจไฟล์ที่ต้องเข้า commit:
  - `drizzle/*.sql`
  - `drizzle/meta/*_snapshot.json`
  - `drizzle/meta/_journal.json`
4. apply:

```bash
set -a
source .env.local
set +a
npm run db:repair
npm run db:migrate
```

5. ตรวจคุณภาพ:

```bash
npm run lint
npm run build
```
