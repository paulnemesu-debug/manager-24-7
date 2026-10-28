begin;

create index if not exists inventory_counts_location_idx
  on public.inventory_counts (location_id)
  where location_id is not null;

create index if not exists labor_entries_location_idx
  on public.labor_entries (location_id)
  where location_id is not null;

create index if not exists sales_imports_location_idx
  on public.sales_imports (location_id)
  where location_id is not null;

create index if not exists workspace_members_location_idx
  on public.workspace_members (location_id)
  where location_id is not null;

commit;
