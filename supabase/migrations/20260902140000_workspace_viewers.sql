begin;

-- ---------------------------------------------------------------------------
-- Echipă: un singur editor (proprietarul contului, cel cu abonament), care
-- poate invita colegi pe adresa de email. Colegii primesc acces DOAR DE
-- CITIRE la rețetele și catalogul proprietarului — nu au propriul abonament,
-- accesul e moștenit. Nimic din politica de scriere existentă nu se schimbă:
-- INSERT/UPDATE/DELETE rămân posibile doar pentru proprietar.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete cascade,
  invited_email text not null,
  role text not null default 'viewer' check (role = 'viewer'),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, invited_email)
);

create index if not exists workspace_members_member_idx
  on public.workspace_members (member_user_id)
  where status = 'active';

drop trigger if exists workspace_members_set_updated_at on public.workspace_members;
create trigger workspace_members_set_updated_at
  before update on public.workspace_members
  for each row execute function private.set_updated_at();

alter table public.workspace_members enable row level security;

-- Proprietarul își administrează complet propria listă de invitații.
drop policy if exists workspace_members_owner_all on public.workspace_members;
create policy workspace_members_owner_all on public.workspace_members
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

-- Un membru își vede propria apartenență (ca să știe la ce workspace e
-- conectat), dar nu poate modifica nimic.
drop policy if exists workspace_members_self_select on public.workspace_members;
create policy workspace_members_self_select on public.workspace_members
  for select to authenticated
  using ((select auth.uid()) = member_user_id);

revoke all on table public.workspace_members from anon;
revoke all on table public.workspace_members from authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;

-- ---------------------------------------------------------------------------
-- La crearea contului, orice invitație în așteptare pe aceeași adresă de
-- email se activează automat — colegul nu trebuie să facă nimic în plus
-- după ce primește invitația și se autentifică prima dată.
-- ---------------------------------------------------------------------------

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

  update public.workspace_members
  set member_user_id = new.id, status = 'active'
  where lower(invited_email) = lower(new.email)
    and status = 'pending';

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

-- Activează și invitațiile trimise către adrese care au deja cont.
update public.workspace_members wm
set member_user_id = u.id, status = 'active'
from auth.users u
where wm.status = 'pending'
  and lower(wm.invited_email) = lower(u.email);

-- ---------------------------------------------------------------------------
-- Acces de citire pentru membri, pe lângă accesul existent al proprietarului.
-- Scrierea (insert/update/delete) rămâne neschimbată — doar proprietarul cu
-- abonament activ poate modifica date; membrii nu primesc nicio politică nouă
-- de scriere, deci orice încercare este respinsă automat de RLS.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_viewer_of(target_owner uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.owner_user_id = target_owner
      and wm.member_user_id = (select auth.uid())
      and wm.status = 'active'
  );
$$;

revoke all on function public.is_active_viewer_of(uuid) from public, anon;
grant execute on function public.is_active_viewer_of(uuid) to authenticated;

drop policy if exists recipes_select_entitled on public.recipes;
create policy recipes_select_entitled on public.recipes
  for select to authenticated
  using (
    (auth.uid() = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

drop policy if exists recipe_ingredients_select_entitled on public.recipe_ingredients;
create policy recipe_ingredients_select_entitled on public.recipe_ingredients
  for select to authenticated
  using (
    (auth.uid() = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

drop policy if exists ingredient_catalog_select_entitled on public.ingredient_catalog;
create policy ingredient_catalog_select_entitled on public.ingredient_catalog
  for select to authenticated
  using (
    (auth.uid() = user_id and (select public.has_professional_access()))
    or (select public.is_active_viewer_of(user_id))
  );

commit;
