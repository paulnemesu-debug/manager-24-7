begin;

drop index if exists public.supplier_product_mappings_catalog_idx;
create index if not exists supplier_product_mappings_user_catalog_idx
  on public.supplier_product_mappings (user_id, catalog_id);

commit;
