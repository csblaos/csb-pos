create table if not exists system_config (
  id text primary key,
  default_can_create_branches boolean not null default true,
  default_max_branches_per_store integer default 1,
  default_session_limit integer not null default 1,
  payment_max_accounts_per_store integer not null default 5,
  payment_require_slip_for_lao_qr boolean not null default true,
  store_logo_max_size_mb integer not null default 5,
  store_logo_auto_resize boolean not null default true,
  store_logo_resize_max_width integer not null default 1280,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists permissions (
  id text primary key,
  key text not null,
  resource text not null,
  action text not null
);

create unique index if not exists permissions_key_unique on permissions (key);
create unique index if not exists permissions_resource_action_unique
  on permissions (resource, action);

create table if not exists roles (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at text not null default current_timestamp
);

create index if not exists roles_store_id_idx on roles (store_id);
create index if not exists roles_created_at_idx on roles (created_at);
create unique index if not exists roles_store_name_unique on roles (store_id, name);

create table if not exists store_members (
  store_id text not null references stores (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  role_id text not null references roles (id) on delete restrict,
  status text not null default 'ACTIVE',
  added_by text references users (id) on delete set null,
  created_at text not null default current_timestamp,
  primary key (store_id, user_id),
  constraint store_members_status_check
    check (status in ('ACTIVE', 'INVITED', 'SUSPENDED'))
);

create index if not exists store_members_store_id_idx on store_members (store_id);
create index if not exists store_members_role_id_idx on store_members (role_id);
create index if not exists store_members_added_by_idx on store_members (added_by);
create index if not exists store_members_created_at_idx on store_members (created_at);

create table if not exists store_branches (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  name text not null,
  code text,
  address text,
  source_branch_id text references store_branches (id) on delete set null,
  sharing_mode text,
  sharing_config text,
  created_at text not null default current_timestamp,
  constraint store_branches_sharing_mode_check
    check (
      sharing_mode is null or sharing_mode in ('MAIN', 'BALANCED', 'FULL_SYNC', 'INDEPENDENT')
    )
);

create index if not exists store_branches_store_id_idx on store_branches (store_id);
create index if not exists store_branches_source_branch_id_idx on store_branches (source_branch_id);
create index if not exists store_branches_store_created_at_idx
  on store_branches (store_id, created_at);
create unique index if not exists store_branches_store_name_unique
  on store_branches (store_id, name);
create unique index if not exists store_branches_store_code_unique
  on store_branches (store_id, code);

create table if not exists store_member_branches (
  store_id text not null references stores (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  branch_id text not null references store_branches (id) on delete cascade,
  created_at text not null default current_timestamp,
  primary key (store_id, user_id, branch_id)
);

create index if not exists store_member_branches_store_user_idx
  on store_member_branches (store_id, user_id);
create index if not exists store_member_branches_branch_idx
  on store_member_branches (branch_id);

create table if not exists role_permissions (
  role_id text not null references roles (id) on delete cascade,
  permission_id text not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create index if not exists role_permissions_role_id_idx on role_permissions (role_id);
