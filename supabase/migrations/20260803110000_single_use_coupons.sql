create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  company_id text null references public.companies(id) on delete restrict,
  code text not null unique,
  name text not null,
  benefit_type text not null check (benefit_type in ('PERCENTAGE','FIXED_AMOUNT','FREE_MINUTES')),
  benefit_value numeric(14,2) not null check (benefit_value > 0),
  qr_token uuid not null default gen_random_uuid() unique,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','CANCELLED','REDEEMED','EXPIRED')),
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  redeemed_by uuid null references auth.users(id) on delete set null,
  redeemed_stay_id uuid null references public.parking_stays(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > valid_from),
  check ((status='REDEEMED' and redeemed_at is not null) or status<>'REDEEMED')
);

alter table public.parking_stays
  add column if not exists coupon_id uuid null references public.coupons(id) on delete restrict,
  add column if not exists coupon_code text null,
  add column if not exists discount_amount integer not null default 0 check (discount_amount >= 0),
  add column if not exists subtotal_amount integer null check (subtotal_amount is null or subtotal_amount >= 0);

create index if not exists coupons_lookup_idx on public.coupons(qr_token,status,expires_at);
alter table public.coupons enable row level security;
grant select,insert,update on public.coupons to service_role;
