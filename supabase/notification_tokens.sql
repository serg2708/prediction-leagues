-- Run after schema.sql
-- Stores Farcaster notification tokens per user

create table notification_tokens (
  fid      bigint primary key,
  token    text   not null,
  url      text   not null,
  enabled  boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table notification_tokens enable row level security;
create policy "tokens_service_only" on notification_tokens using (false);
-- Service-role key bypasses RLS — tokens are only read/written server-side
