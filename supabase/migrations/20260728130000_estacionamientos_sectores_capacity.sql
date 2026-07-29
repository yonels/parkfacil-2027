create extension if not exists pgcrypto;

create table if not exists public.parkings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  company_id text not null,
  company_name text null,
  type text not null check (type in ('OFF_STREET','ON_STREET')),
  status text not null check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  address text not null,
  city text not null,
  country text not null default '',
  schedule text not null default '',
  description text not null default '',
  access_count integer not null default 0 check (access_count >= 0),
  exit_count integer not null default 0 check (exit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parking_sectors (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  code text not null,
  name text not null,
  type text not null check (type in ('OFF_STREET','ON_STREET')),
  status text not null check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  capacity integer not null check (capacity > 0),
  occupied integer not null default 0 check (occupied >= 0 and occupied <= capacity),
  notes text not null default '',
  level text null,
  zone text null,
  location_description text null,
  access_count integer not null default 0 check (access_count >= 0),
  exit_count integer not null default 0 check (exit_count >= 0),
  street text null,
  from_reference text null,
  to_reference text null,
  district text null,
  segment_description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parking_id, code),
  check (
    (type = 'OFF_STREET' and level is not null and zone is not null)
    or
    (type = 'ON_STREET' and street is not null and from_reference is not null and to_reference is not null)
  )
);

create index if not exists parkings_status_type_idx on public.parkings(status, type);
create index if not exists parking_sectors_parking_status_idx on public.parking_sectors(parking_id, status);
alter table public.parkings enable row level security;
alter table public.parking_sectors enable row level security;
grant select, insert, update on public.parkings, public.parking_sectors to service_role;
