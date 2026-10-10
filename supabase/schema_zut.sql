-- zut — namespaced schema for SHARED Supabase projects.
-- The `projects` / `connections` / `usage_meter` names are owned by another
-- app in this database, so everything the IDE owns lives under `zut_*`.
-- Safe to re-run: tables/indexes use IF NOT EXISTS, functions use
-- CREATE OR REPLACE, policies are guarded by DO blocks, grants are idempotent.
-- For a dedicated project use supabase/schema.sql instead.

create extension if not exists "pgcrypto";

create table if not exists public.zut_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'untitled',
  files jsonb not null default '{}'::jsonb,
  share_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zut_projects_owner_idx on public.zut_projects (owner_id);
create unique index if not exists zut_projects_share_token_idx on public.zut_projects (share_token) where share_token is not null;

alter table public.zut_projects enable row level security;

-- Owner can read/write/delete their own projects
DO $$ BEGIN
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'zut_projects' and policyname = 'owner select') THEN
    create policy "owner select" on public.zut_projects
      for select to authenticated using (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'zut_projects' and policyname = 'owner insert') THEN
    create policy "owner insert" on public.zut_projects
      for insert to authenticated with check (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'zut_projects' and policyname = 'owner update') THEN
    create policy "owner update" on public.zut_projects
      for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'zut_projects' and policyname = 'owner delete') THEN
    create policy "owner delete" on public.zut_projects
      for delete to authenticated using (owner_id = auth.uid());
  END IF;
END $$;

-- Set/clear a project's share token (owner only). Called via supabase.rpc.
create or replace function public.zut_set_share_token(p_project_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zut_projects
     set share_token = p_token, updated_at = now()
   where id = p_project_id and owner_id = auth.uid();
end $$;

-- Public read-only fetch of a shared project by token. Never exposes owner_id.
-- Called via supabase.rpc by anonymous users too.
create or replace function public.zut_get_shared_project(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'name', name,
    'files', files
  )
  from public.zut_projects
  where share_token = p_token
$$;

revoke all on function public.zut_set_share_token(uuid, uuid) from public;
grant execute on function public.zut_set_share_token(uuid, uuid) to authenticated;

revoke all on function public.zut_get_shared_project(uuid) from public;
grant execute on function public.zut_get_shared_project(uuid) to anon, authenticated;

--------------------------------------------------------------------------
-- OAuth connections (GitHub / Vercel) for the Publish + AI features.
-- Rows are written/read ONLY by Supabase Edge Functions (service role).
-- Users only ever see provider + meta through the RPCs below; access
-- tokens never leave the server.
--------------------------------------------------------------------------

create table if not exists public.zut_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github', 'vercel')),
  access_token text not null,
  refresh_token text,
  scope text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists zut_connections_owner_provider_idx
  on public.zut_connections (owner_id, provider);

alter table public.zut_connections enable row level security;

-- No SELECT/UPDATE/DELETE policies: the API table is locked down. Edge
-- Functions talk to it with the service role (RLS bypassed).

-- Return which providers are connected and their display info (no tokens).
create or replace function public.zut_get_connections()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('provider', provider, 'meta', meta)),
    '[]'::jsonb
  )
  from public.zut_connections
  where owner_id = auth.uid()
$$;

-- Unlink a provider (tokens deleted server-side only).
create or replace function public.zut_disconnect_connection(p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.zut_connections
   where owner_id = auth.uid() and provider = p_provider;
end $$;

revoke all on function public.zut_get_connections() from public;
grant execute on function public.zut_get_connections() to authenticated;

revoke all on function public.zut_disconnect_connection(text) from public;
grant execute on function public.zut_disconnect_connection(text) to authenticated;

--------------------------------------------------------------------------
-- zut-cloud usage metering (free-plan caps).
-- The VPS increments these rows per agent turn; the app never writes them directly.
--------------------------------------------------------------------------

create table if not exists public.zut_usage_meter (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  model text not null default '',
  ms int not null default 0,
  input_bytes int not null default 0
);

create index if not exists zut_usage_meter_owner_ts_idx on public.zut_usage_meter (owner_id, ts desc);

alter table public.zut_usage_meter enable row level security;

-- Users can read their own usage (for "X / 50 turns left" UI later).
DO $$ BEGIN
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'zut_usage_meter' and policyname = 'owner read usage') THEN
    create policy "owner read usage" on public.zut_usage_meter
      for select to authenticated using (owner_id = auth.uid());
  END IF;
END $$;

-- No insert/update/delete policies: only the service role (server-side) writes.
