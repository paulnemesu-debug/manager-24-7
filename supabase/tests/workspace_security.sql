-- Reviewable post-migration smoke test. Run as the migration role in an isolated
-- database, or after explicit approval against a hosted project. Synthetic Auth
-- users are transaction-local; this script MUST retain its final ROLLBACK.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  attacker_id uuid := gen_random_uuid();
  pending_id uuid := gen_random_uuid();
  owner_email text := 'qa-owner-' || owner_id || '@example.invalid';
  member_email text := 'qa-member-' || member_id || '@example.invalid';
  pending_email text := 'qa-pending-' || pending_id || '@example.invalid';
  result jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (owner_id,owner_email,now()),(member_id,member_email,now()),
    (attacker_id,'qa-attacker-' || attacker_id || '@example.invalid',now());
  insert into public.subscriptions(user_id,platform,product_id,purchase_token_hash,status,current_period_end)
    values(owner_id,'google_play','qa-workspace','qa:' || owner_id,'active',now()+interval '1 day');

  result := public.prepare_workspace_invitation(owner_id,member_email,'viewer');
  if result->>'status' <> 'active' then raise exception 'Confirmed member must activate'; end if;
  if has_function_privilege('authenticated','public.prepare_workspace_invitation(uuid,text,text)','EXECUTE') then
    raise exception 'Authenticated must not execute invitation RPC';
  end if;
  if not has_function_privilege('service_role','public.prepare_workspace_invitation(uuid,text,text)','EXECUTE') then
    raise exception 'Service role must execute invitation RPC';
  end if;
  if has_table_privilege('authenticated','public.workspace_members','INSERT,DELETE')
     or has_column_privilege('authenticated','public.workspace_members','member_user_id','UPDATE') then
    raise exception 'Authenticated membership identity privileges are too broad';
  end if;
  if not has_column_privilege('authenticated','public.workspace_members','status','UPDATE') then
    raise exception 'Owner revocation requires status privilege';
  end if;

  perform set_config('request.jwt.claim.sub',member_id::text,true);
  execute 'set local role authenticated';
  if not public.has_professional_access() or not public.is_active_viewer_of(owner_id) then
    raise exception 'Verified member lost entitled owner access';
  end if;
  execute 'reset role';
  update public.subscriptions set current_period_end=now()-interval '1 second' where user_id=owner_id;
  execute 'set local role authenticated';
  if public.has_professional_access() or public.is_active_viewer_of(owner_id) then
    raise exception 'Expired owner still grants access';
  end if;
  execute 'reset role';
  update public.subscriptions set current_period_end=now()+interval '1 day' where user_id=owner_id;

  perform set_config('request.jwt.claim.sub',attacker_id::text,true);
  execute 'set local role authenticated';
  begin
    insert into public.workspace_members(owner_user_id,member_user_id,invited_email,status)
      values(attacker_id,attacker_id,'qa-self@example.invalid','active');
    raise exception 'Self membership unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  update public.workspace_members set status='revoked' where owner_user_id=owner_id;
  if not found then raise exception 'Owner revocation changed no row'; end if;
  begin
    update public.workspace_members set status='active' where owner_user_id=owner_id;
    raise exception 'Direct reactivation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  result := public.prepare_workspace_invitation(owner_id,pending_email,'viewer');
  if result->>'status' <> 'pending' then raise exception 'Missing account must remain pending'; end if;
  insert into auth.users(id,email) values(pending_id,pending_email);
  if exists(select 1 from public.workspace_members where invited_email=pending_email and status='active') then
    raise exception 'Unconfirmed signup activated invitation';
  end if;
  update auth.users set email_confirmed_at=now() where id=pending_id;
  if not exists(select 1 from public.workspace_members where invited_email=pending_email and member_user_id=pending_id and status='active') then
    raise exception 'Confirmed signup failed to activate invitation';
  end if;
  update auth.users set email='qa-changed-' || pending_id || '@example.invalid' where id=pending_id;
  if exists(select 1 from public.workspace_members where invited_email=pending_email and member_user_id=pending_id) then
    raise exception 'Changed Auth email retained old identity';
  end if;
end;
$$;
rollback;
