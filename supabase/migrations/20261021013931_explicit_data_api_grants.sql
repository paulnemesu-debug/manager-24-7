begin;

-- Supabase stops auto-exposing new public objects on 2026-10-30. Opt in
-- deliberately now so production, preview branches and fresh environments use
-- the same permission model. Future migrations must grant access explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public;

-- The locale column was added to the historical source migration after the
-- production migration had already been applied. Reconcile that drift before
-- referring to the column in the least-privilege grants below.
alter table public.profiles
  add column if not exists locale text not null default 'ro';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_locale_check'
  ) then
    alter table public.profiles
      add constraint profiles_locale_check check (locale in ('ro', 'en'));
  end if;
end
$$;

-- Remove historical broad defaults. RLS remains defence in depth, but object
-- privileges must also follow least privilege.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
revoke all on all tables in schema public from service_role;
revoke all on all sequences in schema public from service_role;

-- Table-level revokes do not remove explicit column grants from older
-- migrations. Reset the only two tables that intentionally used them.
revoke insert (user_id, email, business_name, locale),
       update (email, business_name, locale)
  on table public.profiles from anon, authenticated, service_role;
revoke insert (id, owner_user_id, member_user_id, invited_email, role, status,
               created_at, updated_at, location_id, invite_sent_at,
               invite_delivery, invite_error),
       update (id, owner_user_id, member_user_id, invited_email, role, status,
               created_at, updated_at, location_id, invite_sent_at,
               invite_delivery, invite_error)
  on table public.workspace_members from anon, authenticated, service_role;

-- Signed-in application access. Every row remains constrained by the existing
-- owner/workspace RLS policies.
grant select, insert, update, delete on table
  public.ingredient_catalog,
  public.recipes,
  public.recipe_ingredients,
  public.haccp_documents,
  public.user_preferences,
  public.ingredient_supplier_offers,
  public.menu_sales,
  public.consumption_vouchers,
  public.bulk_batches,
  public.pnl_reports,
  public.supplier_product_mappings,
  public.business_locations,
  public.inventory_counts,
  public.sales_imports,
  public.labor_entries,
  public.haccp_autocontrol_events,
  public.haccp_routine_profiles,
  public.haccp_equipment,
  public.stock_policies,
  public.supplier_orders,
  public.waste_entries,
  public.inventory_schedules,
  public.waste_prevention_plans,
  public.waste_receivers,
  public.food_redistributions,
  public.hr_employees,
  public.hr_shifts
to authenticated;

grant select, insert, update on table
  public.operational_documents,
  public.hr_lifecycle
to authenticated;

grant select, insert on table public.product_events to authenticated;
grant select on table public.subscriptions to authenticated;
grant select on table public.recipe_versions to authenticated;
grant select on table public.ingredient_price_history to authenticated;
grant select on table public.workspace_members to authenticated;
grant update (status) on table public.workspace_members to authenticated;

grant select on table public.profiles to authenticated;
grant insert (user_id, email, business_name, locale)
  on table public.profiles to authenticated;
grant update (email, business_name, locale)
  on table public.profiles to authenticated;

-- Server-side Edge Functions and administrative RPCs use service_role. It is
-- never shipped in the application client and bypasses RLS by design.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Fail the migration if a public table could be exposed without RLS or if an
-- expected API table has no policy. This also protects fresh branches/resets.
do $$
declare
  unsafe_tables text;
begin
  select string_agg(format('%I', c.relname), ', ' order by c.relname)
    into unsafe_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if unsafe_tables is not null then
    raise exception 'public table % does not have RLS enabled', unsafe_tables;
  end if;

  select string_agg(format('%I', c.relname), ', ' order by c.relname)
    into unsafe_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = c.oid
    );

  if unsafe_tables is not null then
    raise exception 'public table % does not have an RLS policy', unsafe_tables;
  end if;
end
$$;

commit;
