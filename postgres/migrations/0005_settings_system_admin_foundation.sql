create table if not exists fb_connections (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  status text not null default 'DISCONNECTED',
  page_name text,
  page_id text,
  connected_at text,
  constraint fb_connections_status_check
    check (status in ('CONNECTED', 'DISCONNECTED', 'ERROR'))
);

create index if not exists fb_connections_store_id_idx on fb_connections (store_id);
create index if not exists fb_connections_status_idx on fb_connections (status);

create table if not exists wa_connections (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  status text not null default 'DISCONNECTED',
  phone_number text,
  connected_at text,
  constraint wa_connections_status_check
    check (status in ('CONNECTED', 'DISCONNECTED', 'ERROR'))
);

create index if not exists wa_connections_store_id_idx on wa_connections (store_id);
create index if not exists wa_connections_status_idx on wa_connections (status);
