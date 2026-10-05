begin;

-- ---------------------------------------------------------------------------
-- Conturi de administrator cu acces nelimitat
--
-- Lista trăiește în schema `private`, care nu este expusă prin API, deci
-- nimeni nu se poate adăuga singur. Accesul se acordă automat la crearea
-- contului și se poate reaplica oricând, fără a atinge datele existente.
-- ---------------------------------------------------------------------------

create table if not exists private.admin_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

revoke all on table private.admin_emails from public, anon, authenticated;

insert into private.admin_emails (email, note)
values ('paul.nemesu@gmail.com', 'Proprietar PARADIM Operations')
on conflict (email) do nothing;

-- Acordă rolul de administrator și abonamentul permanent pentru un utilizator.
create or replace function private.grant_admin_access(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set role = 'admin'
  where user_id = target_user_id;

  insert into public.subscriptions (
    user_id, platform, product_id, purchase_token_hash, status,
    current_period_start, current_period_end, auto_renew, last_verified_at
  )
  values (
    target_user_id,
    'admin_grant',
    'professional_foodcost_admin',
    'admin:' || target_user_id::text,
    'active',
    now(),
    timestamptz '2099-12-31 00:00:00+00',
    false,
    now()
  )
  on conflict (user_id) do update set
    platform = 'admin_grant',
    product_id = 'professional_foodcost_admin',
    purchase_token_hash = 'admin:' || excluded.user_id::text,
    status = 'active',
    current_period_end = timestamptz '2099-12-31 00:00:00+00',
    auto_renew = false,
    last_verified_at = now();
end;
$$;

revoke all on function private.grant_admin_access(uuid) from public, anon, authenticated;

-- La crearea contului, profilul se creează ca până acum; dacă adresa se află
-- în lista de administratori, primește imediat și accesul nelimitat. Astfel
-- accesul revine automat chiar dacă un cont este șters și refăcut.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;

  if exists (
    select 1 from private.admin_emails
    where lower(email) = lower(new.email)
  ) then
    perform private.grant_admin_access(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

-- Aplică accesul și conturilor care există deja.
do $$
declare
  existing record;
begin
  for existing in
    select u.id
    from auth.users u
    join private.admin_emails a on lower(a.email) = lower(u.email)
  loop
    perform private.grant_admin_access(existing.id);
  end loop;
end
$$;

commit;
