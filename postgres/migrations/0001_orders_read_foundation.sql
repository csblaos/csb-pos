create table if not exists users (
  id text primary key,
  email text not null,
  name text not null,
  password_hash text not null,
  created_by text,
  must_change_password boolean not null default false,
  password_updated_at text,
  system_role text not null default 'USER',
  can_create_stores boolean,
  max_stores integer,
  can_create_branches boolean,
  max_branches_per_store integer,
  session_limit integer,
  created_at text not null default current_timestamp,
  constraint users_system_role_check
    check (system_role in ('USER', 'SUPERADMIN', 'SYSTEM_ADMIN'))
);

create unique index if not exists users_email_unique on users (email);
create index if not exists users_created_by_idx on users (created_by);
create index if not exists users_created_at_idx on users (created_at);

create table if not exists stores (
  id text primary key,
  name text not null,
  logo_name text,
  logo_url text,
  address text,
  phone_number text,
  store_type text not null default 'ONLINE_RETAIL',
  currency text not null default 'LAK',
  supported_currencies text not null default '["LAK"]',
  vat_enabled boolean not null default false,
  vat_rate integer not null default 700,
  vat_mode text not null default 'EXCLUSIVE',
  out_stock_threshold integer not null default 0,
  low_stock_threshold integer not null default 10,
  max_branches_override integer,
  pdf_show_logo boolean not null default true,
  pdf_show_signature boolean not null default true,
  pdf_show_note boolean not null default true,
  pdf_header_color text not null default '#f1f5f9',
  pdf_company_name text,
  pdf_company_address text,
  pdf_company_phone text,
  created_at text not null default current_timestamp,
  constraint stores_store_type_check
    check (store_type in ('ONLINE_RETAIL', 'RESTAURANT', 'CAFE', 'OTHER')),
  constraint stores_currency_check
    check (currency in ('LAK', 'THB', 'USD')),
  constraint stores_vat_mode_check
    check (vat_mode in ('EXCLUSIVE', 'INCLUSIVE'))
);

create index if not exists stores_created_at_idx on stores (created_at);

create table if not exists contacts (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  channel text not null,
  display_name text not null,
  phone text,
  last_inbound_at text,
  notes text,
  created_at text not null default current_timestamp,
  constraint contacts_channel_check
    check (channel in ('FACEBOOK', 'WHATSAPP'))
);

create index if not exists contacts_store_id_idx on contacts (store_id);
create index if not exists contacts_created_at_idx on contacts (created_at);

create table if not exists store_payment_accounts (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  display_name text not null,
  account_type text not null,
  bank_name text,
  account_name text not null,
  account_number text,
  qr_image_url text,
  promptpay_id text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  constraint store_payment_accounts_account_type_check
    check (account_type in ('BANK', 'LAO_QR'))
);

create index if not exists store_payment_accounts_store_id_idx
  on store_payment_accounts (store_id);
create index if not exists store_payment_accounts_store_active_idx
  on store_payment_accounts (store_id, is_active);
create unique index if not exists store_payment_accounts_store_default_unique
  on store_payment_accounts (store_id)
  where is_default = true and is_active = true;

create table if not exists units (
  id text primary key,
  store_id text references stores (id) on delete cascade,
  scope text not null default 'SYSTEM',
  code text not null,
  name_th text not null,
  created_at text not null default current_timestamp,
  constraint units_scope_check
    check (scope in ('SYSTEM', 'STORE'))
);

create index if not exists units_created_at_idx on units (created_at);
create unique index if not exists units_system_code_unique
  on units (code)
  where scope = 'SYSTEM';
create unique index if not exists units_store_code_unique
  on units (store_id, code)
  where scope = 'STORE';

create table if not exists products (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  sku text not null,
  name text not null,
  barcode text,
  model_id text,
  variant_label text,
  variant_options_json text,
  variant_sort_order integer not null default 0,
  image_url text,
  category_id text,
  base_unit_id text not null references units (id),
  price_base integer not null,
  cost_base integer not null default 0,
  out_stock_threshold integer,
  low_stock_threshold integer,
  active boolean not null default true,
  created_at text not null default current_timestamp
);

create index if not exists products_store_id_idx on products (store_id);
create index if not exists products_created_at_idx on products (created_at);
create index if not exists products_store_barcode_idx on products (store_id, barcode);
create unique index if not exists products_store_sku_unique on products (store_id, sku);

create table if not exists orders (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  order_no text not null,
  channel text not null default 'WALK_IN',
  status text not null default 'DRAFT',
  contact_id text references contacts (id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_address text,
  subtotal integer not null default 0,
  discount integer not null default 0,
  vat_amount integer not null default 0,
  shipping_fee_charged integer not null default 0,
  total integer not null default 0,
  payment_currency text not null default 'LAK',
  payment_method text not null default 'CASH',
  payment_status text not null default 'UNPAID',
  payment_account_id text references store_payment_accounts (id) on delete set null,
  payment_slip_url text,
  payment_proof_submitted_at text,
  shipping_provider text,
  shipping_label_status text not null default 'NONE',
  shipping_label_url text,
  shipping_label_file_key text,
  shipping_request_id text,
  shipping_carrier text,
  tracking_no text,
  shipping_cost integer not null default 0,
  cod_amount integer not null default 0,
  cod_fee integer not null default 0,
  cod_return_note text,
  cod_settled_at text,
  cod_returned_at text,
  paid_at text,
  shipped_at text,
  created_by text not null references users (id),
  created_at text not null default current_timestamp,
  constraint orders_channel_check
    check (channel in ('WALK_IN', 'FACEBOOK', 'WHATSAPP')),
  constraint orders_status_check
    check (status in (
      'DRAFT',
      'PENDING_PAYMENT',
      'READY_FOR_PICKUP',
      'PICKED_UP_PENDING_PAYMENT',
      'PAID',
      'PACKED',
      'SHIPPED',
      'COD_RETURNED',
      'CANCELLED'
    )),
  constraint orders_payment_currency_check
    check (payment_currency in ('LAK', 'THB', 'USD')),
  constraint orders_payment_method_check
    check (payment_method in ('CASH', 'LAO_QR', 'ON_CREDIT', 'COD', 'BANK_TRANSFER')),
  constraint orders_payment_status_check
    check (payment_status in (
      'UNPAID',
      'PENDING_PROOF',
      'PAID',
      'COD_PENDING_SETTLEMENT',
      'COD_SETTLED',
      'FAILED'
    )),
  constraint orders_shipping_label_status_check
    check (shipping_label_status in ('NONE', 'REQUESTED', 'READY', 'FAILED'))
);

create index if not exists orders_store_id_idx on orders (store_id);
create index if not exists orders_order_no_idx on orders (order_no);
create index if not exists orders_created_at_idx on orders (created_at);
create index if not exists orders_store_created_at_idx on orders (store_id, created_at);
create index if not exists orders_store_status_created_at_idx on orders (store_id, status, created_at);
create index if not exists orders_store_status_paid_at_idx on orders (store_id, status, paid_at);
create index if not exists orders_store_payment_method_idx on orders (store_id, payment_method);
create index if not exists orders_store_payment_status_created_at_idx
  on orders (store_id, payment_status, created_at);
create index if not exists orders_store_shipping_label_status_updated_idx
  on orders (store_id, shipping_label_status, created_at);
create index if not exists orders_store_status_channel_idx
  on orders (store_id, status, channel);
create unique index if not exists orders_store_order_no_unique on orders (store_id, order_no);

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  product_id text not null references products (id) on delete restrict,
  unit_id text not null references units (id) on delete restrict,
  qty integer not null,
  qty_base integer not null,
  price_base_at_sale integer not null,
  cost_base_at_sale integer not null,
  line_total integer not null
);

create index if not exists order_items_order_id_idx on order_items (order_id);
create index if not exists order_items_product_id_idx on order_items (product_id);

create table if not exists audit_events (
  id text primary key,
  scope text not null,
  store_id text references stores (id) on delete set null,
  actor_user_id text references users (id) on delete set null,
  actor_name text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  result text not null default 'SUCCESS',
  reason_code text,
  ip_address text,
  user_agent text,
  request_id text,
  metadata jsonb,
  before jsonb,
  after jsonb,
  occurred_at text not null default current_timestamp,
  constraint audit_events_scope_check
    check (scope in ('STORE', 'SYSTEM')),
  constraint audit_events_result_check
    check (result in ('SUCCESS', 'FAIL'))
);

create index if not exists audit_events_scope_occurred_at_idx on audit_events (scope, occurred_at);
create index if not exists audit_events_store_occurred_at_idx on audit_events (store_id, occurred_at);
create index if not exists audit_events_actor_occurred_at_idx on audit_events (actor_user_id, occurred_at);
create index if not exists audit_events_entity_occurred_at_idx
  on audit_events (entity_type, entity_id, occurred_at);
create index if not exists audit_events_action_occurred_at_idx on audit_events (action, occurred_at);
