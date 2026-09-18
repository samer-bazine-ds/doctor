create extension if not exists pgcrypto;

create table if not exists public.records (
  kind text not null,
  id text not null,
  data jsonb not null,
  primary key (kind, id)
);

create table if not exists public.users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('ADMIN', 'DOCTOR', 'SECRETARIAT', 'PATIENT')),
  salt text not null,
  hash text not null
);

create table if not exists public.sessions (
  token text primary key,
  user_id text not null references public.users(id) on delete cascade,
  expires bigint not null
);

create index if not exists records_kind_idx on public.records(kind);
create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_expires_idx on public.sessions(expires);

alter table public.records enable row level security;
alter table public.users enable row level security;
alter table public.sessions enable row level security;

revoke all on public.records from anon, authenticated;
revoke all on public.users from anon, authenticated;
revoke all on public.sessions from anon, authenticated;

comment on table public.records is 'JSON documents retained for compatibility with the existing application model.';