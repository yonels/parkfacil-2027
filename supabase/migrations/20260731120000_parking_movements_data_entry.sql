create table if not exists public.parking_movements (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  movement_type text not null check (movement_type in ('ENTRY','EXIT')),
  license_plate text not null,
  access_point text not null,
  source text not null check (source in ('MOBILE','POS','TABLET','DESKTOP','OTHER')),
  status text not null default 'RECORDED' check (status in ('RECORDED','CANCELLED')),
  notes text not null default '',
  client_request_id uuid null unique,
  created_by uuid null references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (license_plate = upper(license_plate) and license_plate ~ '^[A-Z0-9]{4,8}$')
);

create index if not exists parking_movements_parking_date_idx on public.parking_movements(parking_id, occurred_at desc);
create index if not exists parking_movements_plate_date_idx on public.parking_movements(license_plate, occurred_at desc);
alter table public.parking_movements enable row level security;
grant select, insert on public.parking_movements to service_role;
