create table if not exists product_categories (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at text not null default current_timestamp
);

create index if not exists product_categories_store_id_idx
  on product_categories (store_id);
create unique index if not exists product_categories_store_name_unique
  on product_categories (store_id, name);

create table if not exists product_models (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  name text not null,
  category_id text references product_categories (id) on delete set null,
  image_url text,
  description text,
  active boolean not null default true,
  created_at text not null default current_timestamp
);

create index if not exists product_models_store_id_idx on product_models (store_id);
create index if not exists product_models_created_at_idx on product_models (created_at);
create index if not exists product_models_category_id_idx on product_models (category_id);
create unique index if not exists product_models_store_name_unique
  on product_models (store_id, name);

create table if not exists product_units (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  unit_id text not null references units (id) on delete restrict,
  multiplier_to_base integer not null,
  price_per_unit integer
);

create index if not exists product_units_product_id_idx on product_units (product_id);
create unique index if not exists product_units_unique
  on product_units (product_id, unit_id);
