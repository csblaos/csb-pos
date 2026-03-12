create table if not exists shipping_providers (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  code text not null,
  display_name text not null,
  branch_name text,
  aliases text not null default '[]',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at text not null default current_timestamp
);

create index if not exists shipping_providers_store_id_idx
  on shipping_providers (store_id);

create index if not exists shipping_providers_store_active_sort_idx
  on shipping_providers (store_id, active, sort_order, created_at);

create unique index if not exists shipping_providers_store_code_unique
  on shipping_providers (store_id, code);

insert into shipping_providers (
  id,
  store_id,
  code,
  display_name,
  branch_name,
  aliases,
  active,
  sort_order
)
select
  gen_random_uuid()::text,
  s.id,
  seed.code,
  seed.display_name,
  null,
  '[]',
  true,
  seed.sort_order
from stores s
cross join (
  values
    ('HOUNGALOUN', 'Houngaloun', 10),
    ('ANOUSITH', 'Anousith', 20),
    ('MIXAY', 'Mixay', 30)
) as seed(code, display_name, sort_order)
where not exists (
  select 1
  from shipping_providers sp
  where sp.store_id = s.id
    and sp.code = seed.code
);
