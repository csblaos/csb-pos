alter table users
  add column if not exists preferred_language text not null default 'th';

alter table users
  drop constraint if exists users_preferred_language_check;

alter table users
  add constraint users_preferred_language_check
  check (preferred_language in ('lo', 'th', 'en'));
