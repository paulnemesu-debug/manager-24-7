-- Existing-ID PostgREST upserts must return the revision of the accepted edit.
-- Reuse the server clock already used by operations tables. No row backfill,
-- API signature, owner policy, grant or INSERT default changes are required.
drop trigger if exists waste_prevention_plans_set_updated_at on public.waste_prevention_plans;
create trigger waste_prevention_plans_set_updated_at
  before update on public.waste_prevention_plans
  for each row execute function private.set_updated_at();

drop trigger if exists waste_receivers_set_updated_at on public.waste_receivers;
create trigger waste_receivers_set_updated_at
  before update on public.waste_receivers
  for each row execute function private.set_updated_at();

drop trigger if exists food_redistributions_set_updated_at on public.food_redistributions;
create trigger food_redistributions_set_updated_at
  before update on public.food_redistributions
  for each row execute function private.set_updated_at();
