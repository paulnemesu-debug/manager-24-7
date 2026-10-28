begin;

-- Retain ownership and replacement history even when the user's current grant
-- changes. Raw Google purchase tokens never enter the database.
create table private.google_play_purchase_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  superseded_by_hash text check (superseded_by_hash ~ '^[a-f0-9]{64}$'),
  last_verified_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index google_play_purchase_tokens_user_idx
  on private.google_play_purchase_tokens (user_id);

insert into private.google_play_purchase_tokens (token_hash, user_id, last_verified_at)
select purchase_token_hash, user_id, last_verified_at
from public.subscriptions
where platform = 'google_play' and purchase_token_hash ~ '^[a-f0-9]{64}$';

alter table private.google_play_purchase_tokens enable row level security;
revoke all on private.google_play_purchase_tokens from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.google_play_purchase_tokens to service_role;

create function public.apply_verified_google_play_subscription(
  p_user_id uuid,
  p_product_id text,
  p_token_hash text,
  p_linked_token_hash text,
  p_status text,
  p_order_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_auto_renew boolean,
  p_verified_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_grant public.subscriptions%rowtype;
  token_record private.google_play_purchase_tokens%rowtype;
  linked_owner uuid;
  lock_key bigint;
  has_current boolean;
  entitled boolean;
  current_entitled boolean;
  next_status text;
begin
  if p_user_id is null or nullif(btrim(p_product_id), '') is null
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or (p_linked_token_hash is not null and p_linked_token_hash !~ '^[a-f0-9]{64}$')
    or p_status is null or p_status not in ('active', 'trialing', 'grace_period', 'paused', 'canceled', 'expired', 'none')
    or p_verified_at is null or not isfinite(p_verified_at)
    or (p_period_start is not null and not isfinite(p_period_start))
    or (p_period_end is not null and not isfinite(p_period_end)) then
    raise exception 'Invalid verified purchase' using errcode = '22023';
  end if;

  -- Serialize grants for one account, including the first grant when no row
  -- exists. Sorted token locks also serialize conflicting cross-account claims.
  perform pg_advisory_xact_lock(hashtextextended('google_play:user:' || p_user_id::text, 0));
  for lock_key in
    select distinct hashtextextended('google_play:token:' || value, 0)
    from unnest(array[p_token_hash, p_linked_token_hash]) as tokens(value)
    where value is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(lock_key);
  end loop;

  select * into token_record from private.google_play_purchase_tokens
  where token_hash = p_token_hash for update;
  if found and token_record.user_id <> p_user_id then
    return jsonb_build_object('valid', false, 'reason', 'ownership_conflict');
  end if;
  -- Also check current rows for legacy receipts created outside this function.
  if exists (select 1 from public.subscriptions where purchase_token_hash = p_token_hash and user_id <> p_user_id) then
    return jsonb_build_object('valid', false, 'reason', 'ownership_conflict');
  end if;
  if token_record.superseded_by_hash is not null then
    return jsonb_build_object('valid', false, 'reason', 'superseded');
  end if;
  if token_record.last_verified_at > p_verified_at then
    return jsonb_build_object('valid', false, 'reason', 'stale_verification');
  end if;
  if p_linked_token_hash is not null and p_linked_token_hash <> p_token_hash then
    select user_id into linked_owner from private.google_play_purchase_tokens where token_hash = p_linked_token_hash;
    if (linked_owner is not null and linked_owner <> p_user_id)
      or exists (select 1 from public.subscriptions where purchase_token_hash = p_linked_token_hash and user_id <> p_user_id) then
      return jsonb_build_object('valid', false, 'reason', 'ownership_conflict');
    end if;
  end if;

  select * into current_grant from public.subscriptions where user_id = p_user_id for update;
  has_current := found;
  entitled := p_status in ('active', 'trialing', 'grace_period', 'canceled')
    and p_period_end is not null and p_period_end > clock_timestamp();
  next_status := case when p_status in ('active', 'trialing', 'grace_period') and not entitled then 'expired' else p_status end;
  current_entitled := has_current and current_grant.status in ('active', 'trialing', 'grace_period', 'canceled')
    and current_grant.current_period_end is not null and current_grant.current_period_end > clock_timestamp();

  -- Requests can start in the same millisecond. In that tie, a revocation
  -- wins over an active response; a later verification can still renew access.
  if has_current and current_grant.purchase_token_hash = p_token_hash
    and token_record.last_verified_at = p_verified_at
    and not current_entitled and entitled then
    return jsonb_build_object('valid', false, 'reason', 'stale_verification');
  end if;

  insert into private.google_play_purchase_tokens(token_hash, user_id, last_verified_at)
  values (p_token_hash, p_user_id, p_verified_at)
  on conflict (token_hash) do update set last_verified_at = excluded.last_verified_at;

  if has_current and current_grant.purchase_token_hash <> p_token_hash then
    -- Pending, expired and revoked *other* receipts cannot alter this grant.
    if not entitled then
      return jsonb_build_object('valid', false, 'status', next_status, 'current_period_end', p_period_end, 'reason', 'inactive_receipt');
    end if;
    -- Google links upgrades/replacements explicitly. For unrelated receipts,
    -- require a later period without shortening an existing live entitlement.
    -- Pending purchases may have no start date. An inactive unknown-start
    -- receipt must not permanently block a fresh paid purchase.
    if p_linked_token_hash is distinct from current_grant.purchase_token_hash and (
      (current_entitled and p_period_end < current_grant.current_period_end)
      or (current_grant.platform = 'google_play' and (
        (current_entitled and current_grant.current_period_start is null)
        or (p_period_start is null and (current_entitled or current_grant.current_period_start is not null))
        or p_period_start < current_grant.current_period_start
        or (p_period_start = current_grant.current_period_start and p_period_end <= current_grant.current_period_end)
      ))
    ) then
      return jsonb_build_object('valid', false, 'reason', 'older_receipt');
    end if;
    if current_grant.platform = 'google_play' then
      insert into private.google_play_purchase_tokens(token_hash, user_id, superseded_by_hash, last_verified_at)
      values (current_grant.purchase_token_hash, p_user_id, p_token_hash, p_verified_at)
      on conflict (token_hash) do update set superseded_by_hash = excluded.superseded_by_hash;
    end if;
  end if;

  -- Only an accepted, entitled replacement invalidates its linked predecessor.
  -- This and the current-grant write below commit or roll back together.
  if entitled and p_linked_token_hash is not null and p_linked_token_hash <> p_token_hash then
    insert into private.google_play_purchase_tokens(token_hash, user_id, superseded_by_hash, last_verified_at)
    values (p_linked_token_hash, p_user_id, p_token_hash, p_verified_at)
    on conflict (token_hash) do update set superseded_by_hash = excluded.superseded_by_hash;
  end if;

  insert into public.subscriptions(user_id, platform, product_id, purchase_token_hash, status, google_order_id,
    current_period_start, current_period_end, auto_renew, last_verified_at)
  values (p_user_id, 'google_play', p_product_id, p_token_hash, next_status, p_order_id,
    p_period_start, p_period_end, coalesce(p_auto_renew, false), p_verified_at)
  on conflict (user_id) do update set
    platform = excluded.platform, product_id = excluded.product_id, purchase_token_hash = excluded.purchase_token_hash,
    status = excluded.status, google_order_id = excluded.google_order_id, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end, auto_renew = excluded.auto_renew, last_verified_at = excluded.last_verified_at;
  return jsonb_build_object('valid', entitled, 'status', next_status, 'current_period_end', p_period_end, 'reason', 'applied');
end;
$$;

revoke all on function public.apply_verified_google_play_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_google_play_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) to service_role;

commit;
