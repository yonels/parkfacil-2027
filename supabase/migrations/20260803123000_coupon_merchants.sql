create table if not exists public.coupon_merchants (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  contact_name text not null default '',
  contact_email text null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

alter table public.coupons add column if not exists merchant_id uuid null references public.coupon_merchants(id) on delete restrict;
create index if not exists coupons_merchant_stats_idx on public.coupons(merchant_id,status,created_at);
alter table public.coupon_merchants enable row level security;
grant select,insert,update on public.coupon_merchants to service_role;
