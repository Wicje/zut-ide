-- Zut waitlist: ONE script does everything (table + welcome emails).
-- HOW TO RUN (2 min):
--   1. Open supabase.com/dashboard -> project "supabase-Continua" -> SQL Editor -> New query.
--   2. Replace SENDLIBERTY_KEY_HERE below with your sl_... key (keep the quotes).
--   3. Replace FROM_GMAIL_HERE with the Gmail you connected in Sendliberty,
--      e.g. '"Zut" <you@gmail.com>' (keep the single quotes).
--   4. Paste this whole file, press Run. Done — no CLI, no extra steps.
--   5. Test: join the waitlist on the live site, check your inbox (and spam).

-- ---------- 1. table + locked-down access ----------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "Anyone can join the waitlist" on public.waitlist;
create policy "Anyone can join the waitlist"
  on public.waitlist for insert
  to anon
  with check (true);
-- NOTE: anon can INSERT only. Nobody can list or read emails with the anon key.

-- ---------- 2. extensions for sending mail from the database ----------
create extension if not exists pg_net with schema extensions;
create extension if not exists vault;

-- ---------- 3. store the Sendliberty key in the vault (not in code) ----------
-- Replace SENDLIBERTY_KEY_HERE with your sl_... key, then run.
-- If you ever re-run this file, delete the old secret first:
--   delete from vault.secrets where name = 'sendliberty_api_key';
select vault.create_secret(
  'SENDLIBERTY_KEY_HERE',
  'sendliberty_api_key',
  'Sendliberty API key used by the waitlist welcome trigger'
);

-- ---------- 4. trigger: welcome email on every new signup ----------
create or replace function public.send_waitlist_welcome()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions, vault
as $$
declare
  v_key text;
  -- The Gmail you connected in Sendliberty. Display name keeps it professional.
  v_from text := '"Zut" <FROM_GMAIL_HERE>';
  v_body jsonb;
begin
  -- Email must never break signup: any failure below is swallowed.
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'sendliberty_api_key'
    limit 1;

    -- No key stored? Save the signup, skip the email.
    if v_key is null or v_key = 'SENDLIBERTY_KEY_HERE' then
      return new;
    end if;

    v_body := jsonb_build_object(
      'from', v_from,
      'to', new.email,
      'subject', 'You are on the Zut waitlist',
    'text',
      'Hi!' || chr(10) || chr(10) ||
      'You joined the Zut waitlist — where sentences become software.' || chr(10) || chr(10) ||
      'Zut is the browser-based AI IDE: describe what you want in plain English, ' ||
      'the agent writes the code, you review the diff, and it previews live. ' ||
      'Zero install, runs on laptops and Chromebooks.' || chr(10) || chr(10) ||
      'Pilot members get in first, free. Watch your inbox.' || chr(10) || chr(10) ||
      '— The Zut team' || chr(10) ||
      'https://landing-two-beta-xy9r9089if.vercel.app'
  );

  -- Async: returns immediately, signup never waits on the email.
  perform http_post(
    url := 'https://sendliberty.com/api/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := v_body
  );
  exception when others then
    -- Swallowed on purpose: the signup is already safe.
    return new;
  end;

  return new;
end;
$$;

drop trigger if exists on_waitlist_insert on public.waitlist;
create trigger on_waitlist_insert
  after insert on public.waitlist
  for each row execute function public.send_waitlist_welcome();
