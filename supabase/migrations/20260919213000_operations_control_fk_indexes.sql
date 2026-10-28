begin;

create index if not exists haccp_routine_profiles_location_idx
  on public.haccp_routine_profiles(default_location_id)
  where default_location_id is not null;

create index if not exists stock_policies_location_fk_idx
  on public.stock_policies(location_id)
  where location_id is not null;

commit;
