create table if not exists notification_inbox (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  topic text not null default 'PURCHASE_AP_DUE',
  entity_type text not null,
  entity_id text not null,
  dedupe_key text not null,
  title text not null,
  message text not null,
  severity text not null default 'WARNING',
  status text not null default 'UNREAD',
  due_status text,
  due_date text,
  payload text not null default '{}',
  first_detected_at text not null default current_timestamp,
  last_detected_at text not null default current_timestamp,
  read_at text,
  resolved_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  constraint notification_inbox_topic_check
    check (topic in ('PURCHASE_AP_DUE')),
  constraint notification_inbox_entity_type_check
    check (entity_type in ('PURCHASE_ORDER')),
  constraint notification_inbox_severity_check
    check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  constraint notification_inbox_status_check
    check (status in ('UNREAD', 'READ', 'RESOLVED')),
  constraint notification_inbox_due_status_check
    check (due_status is null or due_status in ('OVERDUE', 'DUE_SOON'))
);

create unique index if not exists notification_inbox_store_dedupe_unique
  on notification_inbox (store_id, dedupe_key);
create index if not exists notification_inbox_store_status_detected_idx
  on notification_inbox (store_id, status, last_detected_at);
create index if not exists notification_inbox_store_topic_detected_idx
  on notification_inbox (store_id, topic, last_detected_at);
create index if not exists notification_inbox_store_entity_idx
  on notification_inbox (store_id, entity_type, entity_id);

create table if not exists notification_rules (
  id text primary key,
  store_id text not null references stores (id) on delete cascade,
  topic text not null default 'PURCHASE_AP_DUE',
  entity_type text not null,
  entity_id text not null,
  muted_forever boolean not null default false,
  muted_until text,
  snoozed_until text,
  note text,
  updated_by text references users (id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  constraint notification_rules_topic_check
    check (topic in ('PURCHASE_AP_DUE')),
  constraint notification_rules_entity_type_check
    check (entity_type in ('PURCHASE_ORDER'))
);

create unique index if not exists notification_rules_store_topic_entity_unique
  on notification_rules (store_id, topic, entity_type, entity_id);
create index if not exists notification_rules_store_topic_idx
  on notification_rules (store_id, topic);
create index if not exists notification_rules_store_entity_idx
  on notification_rules (store_id, entity_type, entity_id);
