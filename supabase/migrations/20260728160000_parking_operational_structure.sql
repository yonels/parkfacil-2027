-- Etapa 19: separación definitiva Off Street / On Street.
-- Migración evolutiva: no elimina columnas heredadas de parking_sectors.
create extension if not exists pgcrypto;

alter table public.parking_sectors
  alter column type drop not null,
  alter column capacity drop not null,
  alter column status set default 'ACTIVE';
alter table public.parking_sectors drop constraint if exists parking_sectors_check;
alter table public.parking_sectors drop constraint if exists parking_sectors_type_check;
alter table public.parking_sectors drop constraint if exists parking_sectors_capacity_check;
alter table public.parking_sectors drop constraint if exists parking_sectors_occupied_check;
alter table public.parking_sectors add column if not exists description text not null default '';
alter table public.parking_sectors add constraint parking_sectors_code_letter_check check (code ~ '^[A-Z]$') not valid;

create table if not exists public.parking_levels (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  description text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parking_id, code)
);

create table if not exists public.parking_level_counters (
  parking_id uuid primary key references public.parkings(id) on delete restrict,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.create_parking_level(
  p_parking_id uuid,
  p_name text,
  p_status text,
  p_description text default '',
  p_notes text default ''
) returns public.parking_levels
language plpgsql security definer set search_path=public as $$
declare
  v_counter bigint;
  v_code text;
  v_level public.parking_levels%rowtype;
begin
  if length(trim(coalesce(p_name,''))) = 0 or length(trim(p_name)) > 120 then
    raise exception 'LEVEL_NAME_INVALID' using errcode='23514';
  end if;
  if p_status not in ('ACTIVE','INACTIVE','MAINTENANCE') then
    raise exception 'LEVEL_STATUS_INVALID' using errcode='23514';
  end if;
  if not exists(select 1 from public.parkings where id=p_parking_id and type='OFF_STREET') then
    raise exception 'OFF_STREET_PARKING_NOT_FOUND' using errcode='P0002';
  end if;
  insert into public.parking_level_counters(parking_id,last_value) values(p_parking_id,0)
    on conflict(parking_id) do nothing;
  select last_value into v_counter from public.parking_level_counters where parking_id=p_parking_id for update;
  loop
    v_counter := v_counter + 1;
    v_code := 'NIV-' || lpad(v_counter::text,3,'0');
    exit when not exists(select 1 from public.parking_levels where parking_id=p_parking_id and code=v_code);
  end loop;
  update public.parking_level_counters set last_value=v_counter,updated_at=now() where parking_id=p_parking_id;
  insert into public.parking_levels(parking_id,code,name,status,description,notes)
  values(p_parking_id,v_code,trim(p_name),p_status,left(trim(coalesce(p_description,'')),500),left(trim(coalesce(p_notes,'')),500))
  returning * into v_level;
  return v_level;
end;
$$;
alter table public.parking_level_counters enable row level security;
grant select,insert,update on public.parking_level_counters to service_role;
revoke all on function public.create_parking_level(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_parking_level(uuid,text,text,text,text) to service_role;

create table if not exists public.parking_zones (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  level_id uuid not null references public.parking_levels(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  capacity integer not null check (capacity > 0),
  occupied integer not null default 0 check (occupied >= 0 and occupied <= capacity),
  description text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level_id, code)
);

create table if not exists public.parking_streets (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  sector_id uuid not null references public.parking_sectors(id) on delete restrict,
  name text not null,
  district text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  capacity integer not null check (capacity > 0),
  occupied integer not null default 0 check (occupied >= 0 and occupied <= capacity),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sector_id, name)
);

create table if not exists public.operator_assignments (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  sector_id uuid not null references public.parking_sectors(id) on delete restrict,
  street_id uuid not null references public.parking_streets(id) on delete restrict,
  number_from integer not null,
  number_to integer not null,
  max_vehicles integer not null check (max_vehicles > 0),
  valid_from date not null,
  valid_until date null,
  start_time time not null,
  end_time time not null,
  days_of_week smallint[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  supervisor_id text null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (number_from < number_to),
  check (end_time > start_time),
  check (valid_until is null or valid_until >= valid_from)
);

create table if not exists public.operator_shifts (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  sector_id uuid not null references public.parking_sectors(id) on delete restrict,
  street_id uuid not null references public.parking_streets(id) on delete restrict,
  assignment_id uuid not null references public.operator_assignments(id) on delete restrict,
  shift_date date not null,
  scheduled_start time not null,
  scheduled_end time not null,
  opened_at timestamptz null,
  closed_at timestamptz null,
  status text not null default 'PROGRAMMED' check (status in ('PROGRAMMED','OPEN','CLOSING','CLOSED','CANCELLED')),
  device_id text null,
  supervisor_id text null,
  notes text not null default '',
  opened_by text null,
  closed_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (closed_at is null or opened_at is null or closed_at >= opened_at)
);

create unique index if not exists operator_one_open_shift_idx
  on public.operator_shifts(operator_id) where status in ('OPEN','CLOSING');

create table if not exists public.shift_closures (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.operator_shifts(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  sector_id uuid not null references public.parking_sectors(id) on delete restrict,
  street_id uuid not null references public.parking_streets(id) on delete restrict,
  operator_id text not null,
  supervisor_id text null,
  own_vehicles_count integer not null default 0 check (own_vehicles_count >= 0),
  received_vehicles_count integer not null default 0 check (received_vehicles_count >= 0),
  charged_vehicles_count integer not null default 0 check (charged_vehicles_count >= 0),
  exited_vehicles_count integer not null default 0 check (exited_vehicles_count >= 0),
  pending_vehicles_count integer not null default 0 check (pending_vehicles_count >= 0),
  cancelled_vehicles_count integer not null default 0 check (cancelled_vehicles_count >= 0),
  exempt_vehicles_count integer not null default 0 check (exempt_vehicles_count >= 0),
  unpaid_exit_count integer not null default 0 check (unpaid_exit_count >= 0),
  transferred_vehicles_count integer not null default 0 check (transferred_vehicles_count >= 0),
  collected_own_vehicles numeric(14,2) null,
  collected_received_vehicles numeric(14,2) null,
  payments_count integer null,
  discounts_total numeric(14,2) null,
  exemptions_total numeric(14,2) null,
  financial_cancellations_total numeric(14,2) null,
  cash_difference numeric(14,2) null,
  estimated_pending_amount numeric(14,2) null,
  capacity_snapshot integer not null check (capacity_snapshot >= 0),
  occupied_snapshot integer not null check (occupied_snapshot >= 0 and occupied_snapshot <= capacity_snapshot),
  snapshot_at timestamptz not null,
  notes text not null default '',
  confirmed_at timestamptz not null default now(),
  confirmed_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_handoffs (
  id uuid primary key default gen_random_uuid(),
  outgoing_shift_id uuid not null references public.operator_shifts(id) on delete restrict,
  incoming_shift_id uuid null references public.operator_shifts(id) on delete restrict,
  outgoing_operator_id text not null,
  incoming_operator_id text null,
  supervisor_id text null,
  transferred_vehicles_count integer not null default 0 check (transferred_vehicles_count >= 0),
  estimated_pending_amount numeric(14,2) null,
  accepted_at timestamptz null,
  accepted_by text null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outgoing_shift_id)
);

create table if not exists public.shift_incidents (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.operator_shifts(id) on delete restrict,
  closure_id uuid null references public.shift_closures(id) on delete restrict,
  type text not null check (type in ('UNPAID_EXIT','POS_OFFLINE','COMMUNICATION','ACCIDENT','COMPLAINT','ABANDONED_VEHICLE','DAMAGE','SECURITY','OPERATIONAL_ERROR','OTHER')),
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  reported_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parking_levels_parking_idx on public.parking_levels(parking_id, status);
create index if not exists parking_zones_level_idx on public.parking_zones(level_id, status);
create index if not exists parking_streets_sector_idx on public.parking_streets(sector_id, status);
create index if not exists assignments_street_schedule_idx on public.operator_assignments(street_id, status, valid_from, valid_until);
create index if not exists shifts_assignment_date_idx on public.operator_shifts(assignment_id, shift_date);
create index if not exists incidents_shift_idx on public.shift_incidents(shift_id);

alter table public.parking_levels enable row level security;
alter table public.parking_zones enable row level security;
alter table public.parking_streets enable row level security;
alter table public.operator_assignments enable row level security;
alter table public.operator_shifts enable row level security;
alter table public.shift_closures enable row level security;
alter table public.shift_handoffs enable row level security;
alter table public.shift_incidents enable row level security;

grant select, insert, update on
  public.parking_levels, public.parking_zones, public.parking_streets,
  public.operator_assignments, public.operator_shifts, public.shift_closures,
  public.shift_handoffs, public.shift_incidents
to service_role;

-- Los cierres confirmados son inmutables incluso para escrituras accidentales.
create or replace function public.prevent_shift_closure_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'SHIFT_CLOSURE_IMMUTABLE' using errcode = 'P0001';
end;
$$;
drop trigger if exists shift_closures_immutable on public.shift_closures;
create trigger shift_closures_immutable before update or delete on public.shift_closures
for each row execute function public.prevent_shift_closure_mutation();

-- Fotografía histórica aprobada para el comprobante de cierre.
alter table public.shift_closures
  add column if not exists assignment_id uuid references public.operator_assignments(id) on delete restrict,
  add column if not exists operator_name text,
  add column if not exists company_name text,
  add column if not exists parking_name text,
  add column if not exists sector_name text,
  add column if not exists street_name text,
  add column if not exists number_from integer,
  add column if not exists number_to integer,
  add column if not exists assigned_spaces integer,
  add column if not exists shift_date date,
  add column if not exists actual_start_at timestamptz,
  add column if not exists actual_close_at timestamptz,
  add column if not exists collected_amount numeric(14,2),
  add column if not exists paid_vehicles_count integer,
  add column if not exists closure_status text not null default 'CONFIRMED',
  add column if not exists folio text unique;
create index if not exists shift_closures_operator_date_idx on public.shift_closures(operator_id, shift_date);

-- Transacción única. Las tablas parking_movements y parking_payments son una
-- dependencia explícita de la futura etapa operacional; si no existen, no cierra.
create or replace function public.close_operator_shift(
  p_shift_id uuid, p_actor_id text, p_actor_name text, p_actor_is_admin boolean, p_notes text
) returns public.shift_closures
language plpgsql security definer set search_path=public as $$
declare
  v_shift public.operator_shifts%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_parking public.parkings%rowtype;
  v_sector public.parking_sectors%rowtype;
  v_street public.parking_streets%rowtype;
  v_close_at timestamptz := clock_timestamp();
  v_amount numeric(14,2);
  v_paid integer;
  v_pending integer;
  v_cancelled integer;
  v_closure public.shift_closures%rowtype;
begin
  select * into v_shift from public.operator_shifts where id=p_shift_id for update;
  if not found then raise exception 'SHIFT_NOT_FOUND' using errcode='P0002'; end if;
  if v_shift.status not in ('OPEN','CLOSING') then raise exception 'SHIFT_NOT_CLOSABLE' using errcode='P0001'; end if;
  if v_shift.operator_id<>p_actor_id and not p_actor_is_admin then raise exception 'SHIFT_FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.shift_closures where shift_id=v_shift.id) then raise exception 'SHIFT_ALREADY_CLOSED' using errcode='23505'; end if;
  select * into v_assignment from public.operator_assignments where id=v_shift.assignment_id;
  if not found or v_assignment.number_from>=v_assignment.number_to or v_assignment.max_vehicles<=0 then raise exception 'ASSIGNMENT_INVALID' using errcode='23514'; end if;
  select * into v_parking from public.parkings where id=v_shift.parking_id;
  select * into v_sector from public.parking_sectors where id=v_shift.sector_id;
  select * into v_street from public.parking_streets where id=v_shift.street_id;
  if v_parking.id is null or v_sector.id is null or v_street.id is null then raise exception 'ASSIGNMENT_INVALID' using errcode='23514'; end if;
  if to_regclass('public.parking_movements') is null or to_regclass('public.parking_payments') is null then
    raise exception 'OPERATIONAL_DATA_SOURCE_UNAVAILABLE' using errcode='P0001';
  end if;

  execute 'select coalesce(sum(amount),0),count(distinct movement_id) from public.parking_payments where collected_in_shift_id=$1 and collected_by_operator_id=$2 and status=''PROCESSED'''
    into v_amount,v_paid using v_shift.id,v_shift.operator_id;
  execute 'select count(*) from public.parking_movements where parking_id=$1 and sector_id=$2 and street_id=$3 and status=''PENDING_PAYMENT'''
    into v_pending using v_shift.parking_id,v_shift.sector_id,v_shift.street_id;
  execute 'select count(*) from public.parking_movements where cancelled_in_shift_id=$1 and status=''CANCELLED'''
    into v_cancelled using v_shift.id;
  if v_amount is null or v_paid is null or v_pending is null or v_cancelled is null then raise exception 'OPERATIONAL_TOTALS_UNAVAILABLE' using errcode='22004'; end if;

  insert into public.shift_closures(
    shift_id,assignment_id,parking_id,sector_id,street_id,operator_id,operator_name,
    company_name,parking_name,sector_name,street_name,number_from,number_to,assigned_spaces,
    shift_date,actual_start_at,actual_close_at,collected_amount,paid_vehicles_count,
    pending_vehicles_count,cancelled_vehicles_count,capacity_snapshot,occupied_snapshot,
    snapshot_at,notes,confirmed_by,folio
  ) values (
    v_shift.id,v_assignment.id,v_shift.parking_id,v_shift.sector_id,v_shift.street_id,
    v_shift.operator_id,coalesce(nullif(trim(p_actor_name),''),v_shift.operator_id),coalesce(v_parking.company_name,''),v_parking.name,
    'Sector '||v_sector.code||' - '||v_sector.name,v_street.name,v_assignment.number_from,
    v_assignment.number_to,v_assignment.max_vehicles,v_shift.shift_date,v_shift.opened_at,
    v_close_at,v_amount,v_paid,v_pending,v_cancelled,v_assignment.max_vehicles,
    least(v_pending,v_assignment.max_vehicles),v_close_at,left(trim(coalesce(p_notes,'')),1000),
    p_actor_id,'CT-'||to_char(v_close_at at time zone 'America/Santiago','YYYYMMDD-HH24MISS')||'-'||upper(substr(v_shift.id::text,1,8))
  ) returning * into v_closure;
  update public.operator_shifts set status='CLOSED',closed_at=v_close_at,closed_by=p_actor_id,
    notes=left(trim(coalesce(p_notes,'')),1000),updated_at=v_close_at where id=v_shift.id;
  return v_closure;
end;
$$;
revoke all on function public.close_operator_shift(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.close_operator_shift(uuid,text,text,boolean,text) to service_role;
