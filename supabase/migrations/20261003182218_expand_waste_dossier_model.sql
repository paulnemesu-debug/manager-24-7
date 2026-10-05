-- Extinde dosarul de risipă și redistribuire cu datele necesare raportului anual
-- și cu trasabilitatea operațională a transferurilor.

alter table public.waste_prevention_plans
  add column if not exists company_authorization text not null default '',
  add column if not exists company_phone text not null default '',
  add column if not exists company_email text not null default '';

alter table public.food_redistributions
  add column if not exists product_origin text not null default 'prepared_food',
  add column if not exists quantity_kg numeric(14,3) not null default 0,
  add column if not exists temperature_c numeric(6,2) null,
  add column if not exists traceability_reference text not null default '',
  add column if not exists safety_check text not null default 'compliant',
  add column if not exists corrective_action text not null default '',
  add column if not exists handed_over_by text not null default '',
  add column if not exists received_by text not null default '';

update public.food_redistributions
set quantity_kg = case
  when unit = 'kg' then quantity
  when unit = 'g' then quantity / 1000
  else quantity_kg
end
where quantity_kg = 0;

alter table public.food_redistributions
  drop constraint if exists food_redistributions_product_origin_check,
  add constraint food_redistributions_product_origin_check
    check (product_origin in ('animal', 'plant', 'prepared_food')),
  drop constraint if exists food_redistributions_quantity_kg_check,
  add constraint food_redistributions_quantity_kg_check check (quantity_kg >= 0),
  drop constraint if exists food_redistributions_safety_check_check,
  add constraint food_redistributions_safety_check_check
    check (safety_check in ('compliant', 'blocked'));

comment on column public.food_redistributions.product_origin is
  'Categoria produsului conform anexei pentru raportarea anuală a operatorului donator.';
comment on column public.food_redistributions.quantity_kg is
  'Cantitatea echivalentă exprimată în kg pentru raportarea anuală.';
comment on column public.food_redistributions.safety_check is
  'Confirmarea internă că produsul este eligibil pentru redistribuire.';
