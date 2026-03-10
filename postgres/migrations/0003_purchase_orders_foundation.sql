create table if not exists purchase_orders (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  po_number text not null,
  supplier_name text,
  supplier_contact text,
  purchase_currency text not null default 'LAK',
  exchange_rate integer not null default 1,
  exchange_rate_initial integer not null default 1,
  exchange_rate_locked_at text,
  exchange_rate_locked_by text references users (id) on delete set null,
  exchange_rate_lock_note text,
  payment_status text not null default 'UNPAID',
  paid_at text,
  paid_by text references users (id) on delete set null,
  payment_reference text,
  payment_note text,
  due_date text,
  shipping_cost integer not null default 0,
  other_cost integer not null default 0,
  other_cost_note text,
  status text not null default 'DRAFT',
  ordered_at text,
  expected_at text,
  shipped_at text,
  received_at text,
  cancelled_at text,
  tracking_info text,
  note text,
  created_by text references users (id) on delete set null,
  updated_by text references users (id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  constraint purchase_orders_currency_check
    check (purchase_currency in ('LAK', 'THB', 'USD')),
  constraint purchase_orders_payment_status_check
    check (payment_status in ('UNPAID', 'PARTIAL', 'PAID')),
  constraint purchase_orders_status_check
    check (status in ('DRAFT', 'ORDERED', 'SHIPPED', 'RECEIVED', 'CANCELLED'))
);

create index if not exists purchase_orders_store_id_idx
  on purchase_orders (store_id);
create index if not exists purchase_orders_store_status_idx
  on purchase_orders (store_id, status);
create index if not exists purchase_orders_store_created_at_idx
  on purchase_orders (store_id, created_at);
create index if not exists purchase_orders_store_updated_at_idx
  on purchase_orders (store_id, updated_at);
create index if not exists purchase_orders_exchange_rate_locked_at_idx
  on purchase_orders (store_id, exchange_rate_locked_at);
create index if not exists purchase_orders_payment_status_paid_at_idx
  on purchase_orders (store_id, payment_status, paid_at);
create index if not exists purchase_orders_due_date_idx
  on purchase_orders (store_id, due_date);
create index if not exists purchase_orders_supplier_received_at_idx
  on purchase_orders (store_id, supplier_name, received_at);
create unique index if not exists purchase_orders_store_po_number_unique
  on purchase_orders (store_id, po_number);

create table if not exists purchase_order_items (
  id text primary key,
  purchase_order_id text not null references purchase_orders (id) on delete cascade,
  product_id text not null references products (id) on delete restrict,
  qty_ordered integer not null,
  qty_received integer not null default 0,
  unit_cost_purchase integer not null default 0,
  unit_cost_base integer not null default 0,
  landed_cost_per_unit integer not null default 0
);

create index if not exists purchase_order_items_po_id_idx
  on purchase_order_items (purchase_order_id);
create index if not exists purchase_order_items_product_id_idx
  on purchase_order_items (product_id);

create table if not exists purchase_order_payments (
  id text primary key,
  purchase_order_id text not null references purchase_orders (id) on delete cascade,
  store_id text not null references stores (id) on delete cascade,
  entry_type text not null default 'PAYMENT',
  amount_base integer not null,
  paid_at text not null default current_timestamp,
  reference text,
  note text,
  reversed_payment_id text references purchase_order_payments (id) on delete set null,
  created_by text references users (id) on delete set null,
  created_at text not null default current_timestamp,
  constraint purchase_order_payments_entry_type_check
    check (entry_type in ('PAYMENT', 'REVERSAL'))
);

create index if not exists purchase_order_payments_po_id_idx
  on purchase_order_payments (purchase_order_id);
create index if not exists purchase_order_payments_store_paid_at_idx
  on purchase_order_payments (store_id, paid_at);
create index if not exists purchase_order_payments_reversed_id_idx
  on purchase_order_payments (reversed_payment_id);
