-- The existing supplier-order UI supports Draft -> Sent -> Confirmed -> Received.
-- Expand only the status domain; preserve all old states and existing rows,
-- owner/entitlement policies, grants, defaults and the server revision trigger.
alter table public.supplier_orders
  drop constraint supplier_orders_status_check,
  add constraint supplier_orders_status_check
    check (status in ('draft', 'sent', 'confirmed', 'received', 'cancelled'));
