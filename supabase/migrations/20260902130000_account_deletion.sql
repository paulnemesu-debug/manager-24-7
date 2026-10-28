begin;

-- ---------------------------------------------------------------------------
-- Ștergere cont/date, cerută explicit de Google Play (Data Safety) pentru
-- orice aplicație cu cont de utilizator. Funcția e apelabilă DOAR din
-- funcția Edge `delete-account`, cu cheia de service role — niciun client
-- autentificat obișnuit nu o poate invoca direct (ar putea altfel șterge
-- datele oricărui alt utilizator, dat fiind că țintește după id explicit).
-- Verificarea identității (că cererea vine chiar de la userul respectiv, pe
-- baza JWT-ului lui) se face în funcția Edge, înainte de acest apel.
-- ---------------------------------------------------------------------------

create table if not exists private.account_deletion_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text,
  requested_at timestamptz not null default now()
);

revoke all on table private.account_deletion_audit from public, anon, authenticated;

create or replace function public.purge_own_data(target_user_id uuid, target_email text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.account_deletion_audit (user_id, email)
  values (target_user_id, target_email);

  delete from public.recipe_ingredients where user_id = target_user_id;
  delete from public.recipes where user_id = target_user_id;
  delete from public.ingredient_catalog where user_id = target_user_id;
  delete from public.subscriptions where user_id = target_user_id;
  delete from public.profiles where user_id = target_user_id;
end;
$$;

revoke all on function public.purge_own_data(uuid, text) from public, anon, authenticated;
grant execute on function public.purge_own_data(uuid, text) to service_role;

commit;
