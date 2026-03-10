create table if not exists product_model_attributes (
  id text primary key,
  model_id text not null references product_models (id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at text not null default current_timestamp
);

create index if not exists product_model_attributes_model_id_idx
  on product_model_attributes (model_id);
create unique index if not exists product_model_attributes_model_code_unique
  on product_model_attributes (model_id, code);

create table if not exists product_model_attribute_values (
  id text primary key,
  attribute_id text not null references product_model_attributes (id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at text not null default current_timestamp
);

create index if not exists product_model_attribute_values_attribute_id_idx
  on product_model_attribute_values (attribute_id);
create unique index if not exists product_model_attribute_values_attribute_code_unique
  on product_model_attribute_values (attribute_id, code);

create index if not exists products_category_id_idx
  on products (category_id);
create index if not exists products_model_id_idx
  on products (model_id);
create unique index if not exists products_model_variant_options_unique
  on products (model_id, variant_options_json)
  where model_id is not null and variant_options_json is not null;
