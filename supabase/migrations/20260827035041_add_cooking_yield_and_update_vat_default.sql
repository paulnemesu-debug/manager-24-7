alter table public.recipes
  add column if not exists cooking_method text not null default 'none',
  add column if not exists cooking_loss_percent numeric not null default 0;

alter table public.recipes
  alter column vat_percent set default 11;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_cooking_method_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_cooking_method_check
      check (
        cooking_method in (
          'none',
          'boil_meat_veg',
          'steam',
          'oven',
          'grill',
          'fry',
          'saute',
          'reduction',
          'custom'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_cooking_loss_percent_check'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_cooking_loss_percent_check
      check (cooking_loss_percent >= 0 and cooking_loss_percent <= 99);
  end if;
end
$$;
