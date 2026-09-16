-- zut — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'untitled',
  files jsonb not null default '{}'::jsonb,
  share_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects (owner_id);
create unique index if not exists projects_share_token_idx on public.projects (share_token) where share_token is not null;

alter table public.projects enable row level security;

-- Owner can read/write/delete their own projects
create policy "owner select" on public.projects
  for select to authenticated using (owner_id = auth.uid());

create policy "owner insert" on public.projects
  for insert to authenticated with check (owner_id = auth.uid());

create policy "owner update" on public.projects
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner delete" on public.projects
  for delete to authenticated using (owner_id = auth.uid());

-- Set/clear a project's share token (owner only). Called via supabase.rpc.
create or replace function public.set_share_token(p_project_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
     set share_token = p_token, updated_at = now()
   where id = p_project_id and owner_id = auth.uid();
end $$;

-- Public read-only fetch of a shared project by token. Never exposes owner_id.
-- Called via supabase.rpc by anonymous users too.
create or replace function public.get_shared_project(p_token uuid)
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
  from public.projects
  where share_token = p_token
$$;

revoke all on function public.set_share_token(uuid, uuid) from public;
grant execute on function public.set_share_token(uuid, uuid) to authenticated;

revoke all on function public.get_shared_project(uuid) from public;
grant execute on function public.get_shared_project(uuid) to anon, authenticated;

--------------------------------------------------------------------------
-- OAuth connections (GitHub / Vercel) for the Publish + AI features.
-- Rows are written/read ONLY by Supabase Edge Functions (service role).
-- Users only ever see provider + meta through the RPCs below; access
-- tokens never leave the server.
--------------------------------------------------------------------------

create table if not exists public.connections (
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

create unique index if not exists connections_owner_provider_idx
  on public.connections (owner_id, provider);

alter table public.connections enable row level security;

-- No SELECT/UPDATE/DELETE policies: the API table is locked down. Edge
-- Functions talk to it with the service role (RLS bypassed).

-- Return which providers are connected and their display info (no tokens).
create or replace function public.get_connections()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('provider', provider, 'meta', meta)),
    '[]'::jsonb
  )
  from public.connections
  where owner_id = auth.uid()
$$;

-- Unlink a provider (tokens deleted server-side only).
create or replace function public.disconnect_connection(p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.connections
   where owner_id = auth.uid() and provider = p_provider;
end $$;

revoke all on function public.get_connections() from public;
grant execute on function public.get_connections() to authenticated;

revoke all on function public.disconnect_connection(text) from public;
grant execute on function public.disconnect_connection(text) to authenticated;