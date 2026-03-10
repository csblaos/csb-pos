create table if not exists inventory_movements (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  product_id text not null references products (id) on delete restrict,
  type text not null,
  qty_base integer not null,
  ref_type text not null,
  ref_id text,
  note text,
  created_by text references users (id) on delete set null,
  created_at text not null default current_timestamp,
  constraint inventory_movements_type_check
    check (type in ('IN', 'OUT', 'RESERVE', 'RELEASE', 'ADJUST', 'RETURN')),
  constraint inventory_movements_ref_type_check
    check (ref_type in ('ORDER', 'MANUAL', 'RETURN', 'PURCHASE'))
);

create index if not exists inventory_movements_store_id_idx
  on inventory_movements (store_id);
create index if not exists inventory_movements_store_created_at_idx
  on inventory_movements (store_id, created_at, id);
create index if not exists inventory_movements_store_type_created_at_idx
  on inventory_movements (store_id, type, created_at, id);
create index if not exists inventory_movements_product_id_idx
  on inventory_movements (product_id);
create index if not exists inventory_movements_created_at_idx
  on inventory_movements (created_at);
