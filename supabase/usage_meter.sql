-- zut-cloud usage metering (free-plan caps).
-- The VPS increments these rows per agent turn; the app never writes them directly.

create table if not exists public.usage_meter (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  model text not null default '',
  ms int not null default 0,
  input_bytes int not null default 0
);

create index if not exists usage_meter_owner_ts_idx on public.usage_meter (owner_id, ts desc);

alter table public.usage_meter enable row level security;

-- Users can read their own usage (for "X / 50 turns left" UI later).
create policy "owner read usage" on public.usage_meter
  for select to authenticated using (owner_id = auth.uid());

-- No insert/update/delete policies: only the service role (server-side) writes.
