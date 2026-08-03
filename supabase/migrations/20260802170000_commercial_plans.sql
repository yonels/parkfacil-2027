create table if not exists public.commercial_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('active','inactive','draft','archived')),
  type text not null check (type in ('monthly_subscription','per_transaction','per_parking','equipment_bundle','implementation_only','custom')),
  currency text not null check (currency in ('CLP','UF','USD')),
  billing_mode text not null check (billing_mode in ('monthly','annual','one_time','per_transaction','mixed')),
  monthly_fee numeric(14,4) not null default 0 check (monthly_fee >= 0),
  annual_fee numeric(14,4) not null default 0 check (annual_fee >= 0),
  implementation_fee numeric(14,4) not null default 0 check (implementation_fee >= 0),
  transaction_fee numeric(14,4) not null default 0 check (transaction_fee >= 0),
  device_fee numeric(14,4) not null default 0 check (device_fee >= 0),
  parking_fee numeric(14,4) not null default 0 check (parking_fee >= 0),
  support_fee numeric(14,4) not null default 0 check (support_fee >= 0),
  discount_percentage numeric(5,2) not null default 0 check (discount_percentage between 0 and 100),
  minimum_monthly_charge numeric(14,4) not null default 0 check (minimum_monthly_charge >= 0),
  included_parkings integer not null default 0 check (included_parkings >= 0),
  included_devices integer not null default 0 check (included_devices >= 0),
  included_users integer not null default 0 check (included_users >= 0),
  modules text[] not null default '{}',
  equipment text[] not null default '{}',
  notes text not null default '',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_plans enable row level security;
revoke all on public.commercial_plans from public, anon, authenticated;
grant select, insert, update on public.commercial_plans to service_role;

