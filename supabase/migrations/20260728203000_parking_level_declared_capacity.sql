alter table public.parking_levels
  add column if not exists declared_capacity integer not null default 0
  check (declared_capacity >= 0);
