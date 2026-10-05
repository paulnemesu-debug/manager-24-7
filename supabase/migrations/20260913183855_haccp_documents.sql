create table if not exists public.haccp_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  form_code text not null check (form_code ~ '^FO-H-[0-9]{2}-[0-9]{2}$'),
  location text,
  period_key text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.haccp_documents is
  'Completed HACCP documents created in Professional FoodCost. Payload contains the form header and repeatable rows.';

create index if not exists haccp_documents_user_form_updated_idx
  on public.haccp_documents (user_id, form_code, updated_at desc);

alter table public.haccp_documents enable row level security;

revoke all on table public.haccp_documents from anon;
grant select, insert, update, delete on table public.haccp_documents to authenticated;

drop policy if exists "haccp_documents_select_own" on public.haccp_documents;
create policy "haccp_documents_select_own"
  on public.haccp_documents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "haccp_documents_insert_own" on public.haccp_documents;
create policy "haccp_documents_insert_own"
  on public.haccp_documents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "haccp_documents_update_own" on public.haccp_documents;
create policy "haccp_documents_update_own"
  on public.haccp_documents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "haccp_documents_delete_own" on public.haccp_documents;
create policy "haccp_documents_delete_own"
  on public.haccp_documents
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists haccp_documents_set_updated_at on public.haccp_documents;
create trigger haccp_documents_set_updated_at
  before update on public.haccp_documents
  for each row execute function private.set_updated_at();
