# Schema Map

อ้างอิงจาก `lib/db/schema/tables.ts` และ migration ปัจจุบัน

## Migration Status

- journal entries: `28`
- latest migration tag: `0027_tough_the_renegades`
- latest focus:
  - `order_shipments`
  - `orders.payment_status`
  - `orders.shipping_label_status` และฟิลด์เกี่ยวกับ shipping/cod

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

### Reliability / Audit / Integration

- `idempotency_requests`
- `audit_events`
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
- `purchase_order_items.purchase_order_id -> purchase_orders.id`
- `purchase_order_items.product_id -> products.id`

### Reliability / Audit

- `idempotency_requests.store_id -> stores.id`
- `idempotency_requests.created_by -> users.id`
- `audit_events.store_id -> stores.id`
- `audit_events.actor_user_id -> users.id`

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
