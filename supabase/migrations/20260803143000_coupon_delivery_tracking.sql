alter table public.coupons
  add column if not exists delivered_at timestamptz null,
  add column if not exists delivery_method text null
    check (delivery_method in ('PRINT','EMAIL'));

create index if not exists coupons_delivery_idx
  on public.coupons(company_id, delivered_at);
