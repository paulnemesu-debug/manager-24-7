begin;

-- Private Storage metadata is exposed only to the service-role deletion worker.
-- This function never deletes metadata: the worker uses the Storage API so the
-- corresponding object bytes are removed as well.
create or replace function public.list_account_storage_objects(
  target_user_id uuid,
  page_size integer default 500
)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select object.bucket_id, object.name
  from storage.objects as object
  where object.owner_id = target_user_id::text
     or object.owner = target_user_id
     or (object.bucket_id = 'recipe-images'
         and (storage.foldername(object.name))[1] = target_user_id::text)
  order by object.bucket_id, object.name
  limit greatest(1, least(coalesce(page_size, 500), 500));
$$;

revoke all on function public.list_account_storage_objects(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_account_storage_objects(uuid, integer) to service_role;

comment on function public.list_account_storage_objects(uuid, integer) is
  'Service-only account deletion inventory. Never invoke with a body-supplied user ID; verify Auth identity in the Edge function first.';

commit;
