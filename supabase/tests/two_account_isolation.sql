-- Hosted-compatible two-account RLS proof. Run only as a migration role in an
-- isolated staging database. All synthetic rows are removed by the final ROLLBACK.
begin;
do $$
declare
  account_a uuid := gen_random_uuid();
  account_b uuid := gen_random_uuid();
  recipe_a uuid;
  recipe_b uuid;
  token_a text := repeat('a', 64);
  token_b text := repeat('b', 64);
  visible_count integer;
  affected_count integer;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (account_a,'qa-isolation-a-' || account_a || '@example.invalid',now()),
    (account_b,'qa-isolation-b-' || account_b || '@example.invalid',now());

  insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_end,last_verified_at)
  values
    (account_a,'google_play','qa-isolation',token_a,'active',now()+interval '1 day',now()),
    (account_b,'google_play','qa-isolation',token_b,'active',now()+interval '1 day',now());
  insert into private.google_play_purchase_tokens(token_hash,user_id,last_verified_at)
  values (token_a,account_a,now()),(token_b,account_b,now());
  insert into public.pnl_reports(user_id,period,revenue_food,notes)
  values (account_a,date_trunc('month',current_date)::date,100,'qa-isolation'),
         (account_b,date_trunc('month',current_date)::date,200,'qa-isolation');
  insert into public.recipes(user_id,title,servings)
  values(account_a,'QA isolation recipe A',4)
  returning id into recipe_a;
  insert into public.recipes(user_id,title,servings)
  values(account_b,'QA isolation recipe B',6)
  returning id into recipe_b;
  insert into public.ingredient_catalog(user_id,name,normalized_name,purchase_price,price_unit)
  values(account_a,'QA ingredient A','qa ingredient a',10,'kg'),
        (account_b,'QA ingredient B','qa ingredient b',20,'kg');
  insert into public.recipe_ingredients(
    recipe_id,user_id,ingredient_name,quantity_net,unit,purchase_price,price_unit
  ) values
    (recipe_a,account_a,'QA ingredient A',100,'g',10,'kg'),
    (recipe_b,account_b,'QA ingredient B',200,'g',20,'kg');

  perform set_config('request.jwt.claim.sub',account_a::text,true);
  execute 'set local role authenticated';
  select count(*) into visible_count from public.profiles;
  if visible_count <> 1 then raise exception 'Account A profile isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.subscriptions;
  if visible_count <> 1 then raise exception 'Account A subscription isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.pnl_reports;
  if visible_count <> 1 then raise exception 'Account A P&L isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.recipes;
  if visible_count <> 1 then raise exception 'Account A recipe isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.recipe_ingredients;
  if visible_count <> 1 then raise exception 'Account A recipe ingredient isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.ingredient_catalog;
  if visible_count <> 1 then raise exception 'Account A catalog isolation failed: %', visible_count; end if;
  if exists(select 1 from public.pnl_reports where user_id=account_b) then
    raise exception 'Account A can read account B P&L';
  end if;
  if exists(select 1 from public.recipes where user_id=account_b) then
    raise exception 'Account A can read account B recipes';
  end if;
  if has_table_privilege('authenticated','private.google_play_purchase_tokens','SELECT') then
    raise exception 'Authenticated can access private Google Play tokens';
  end if;
  begin
    insert into public.pnl_reports(user_id,period,notes)
    values(account_b,(date_trunc('month',current_date)-interval '1 month')::date,'qa-isolation');
    raise exception 'Account A wrote account B P&L';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recipes(user_id,title,servings)
    values(account_b,'Cross-account recipe',1);
    raise exception 'Account A created account B recipe';
  exception when insufficient_privilege then null; end;
  update public.recipes set title='Cross-account update' where id=recipe_b;
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then raise exception 'Account A updated account B recipe'; end if;
  delete from public.ingredient_catalog where user_id=account_b;
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then raise exception 'Account A deleted account B catalog row'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',account_b::text,true);
  execute 'set local role authenticated';
  select count(*) into visible_count from public.profiles;
  if visible_count <> 1 then raise exception 'Account B profile isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.subscriptions;
  if visible_count <> 1 then raise exception 'Account B subscription isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.pnl_reports;
  if visible_count <> 1 then raise exception 'Account B P&L isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.recipes;
  if visible_count <> 1 then raise exception 'Account B recipe isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.recipe_ingredients;
  if visible_count <> 1 then raise exception 'Account B recipe ingredient isolation failed: %', visible_count; end if;
  select count(*) into visible_count from public.ingredient_catalog;
  if visible_count <> 1 then raise exception 'Account B catalog isolation failed: %', visible_count; end if;
  if exists(select 1 from public.pnl_reports where user_id=account_a) then
    raise exception 'Account B can read account A P&L';
  end if;
  execute 'reset role';
end;
$$;
rollback;
