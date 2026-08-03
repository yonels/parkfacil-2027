create table if not exists public.parking_stays (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  license_plate text not null,
  qr_token uuid not null default gen_random_uuid() unique,
  status text not null default 'OPEN' check (status in ('OPEN','PAID','CANCELLED')),
  entry_at timestamptz not null default now(),
  entry_operator_id uuid null references auth.users(id) on delete set null,
  entry_operator_name text not null,
  entry_source text not null default 'WEB' check (entry_source in ('WEB','POS','MOBILE','TABLET','OTHER')),
  exit_at timestamptz null,
  exit_operator_id uuid null references auth.users(id) on delete set null,
  exit_operator_name text null,
  elapsed_minutes integer null check (elapsed_minutes is null or elapsed_minutes >= 0),
  rate_id uuid null references public.parking_rates(id) on delete restrict,
  rate_name text null,
  billing_mode text null,
  net_amount integer null check (net_amount is null or net_amount >= 0),
  tax_amount integer null check (tax_amount is null or tax_amount >= 0),
  total_amount integer null check (total_amount is null or total_amount >= 0),
  payment_method text null check (payment_method is null or payment_method in ('CASH','CARD')),
  payment_code text null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (license_plate ~ '^[A-Z0-9]{4}-[A-Z0-9]{2}$'),
  check (
    (status='OPEN' and exit_at is null)
    or (status='PAID' and exit_at is not null and payment_code is not null)
    or status='CANCELLED'
  )
);

create unique index if not exists parking_stays_one_open_plate_idx on public.parking_stays(parking_id,license_plate) where status='OPEN';
create index if not exists parking_stays_open_idx on public.parking_stays(parking_id,status,entry_at);
alter table public.parking_stays enable row level security;
grant select,insert,update on public.parking_stays to service_role;
