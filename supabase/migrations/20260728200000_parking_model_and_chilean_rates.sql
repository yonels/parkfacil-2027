-- Evolución operacional: continuidad histórica, tramos On Street y tarifas de estacionamiento.

alter table public.parkings drop constraint if exists parkings_status_check;
alter table public.parkings
  add constraint parkings_status_check check (status in (
    'DRAFT','CONFIGURING','READY_FOR_REVIEW','ACTIVE','INACTIVE','SUSPENDED','CLOSED'
  )),
  add column if not exists predecessor_parking_id uuid references public.parkings(id) on delete restrict,
  add column if not exists suspended_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closure_reason text not null default '';
create unique index if not exists parkings_single_successor_idx
  on public.parkings(predecessor_parking_id) where predecessor_parking_id is not null;

create table if not exists public.parking_street_segments (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  area_id uuid not null references public.parking_sectors(id) on delete restrict,
  street_id uuid not null references public.parking_streets(id) on delete restrict,
  code text not null,
  name text not null,
  from_number integer not null check (from_number >= 0),
  to_number integer not null check (to_number >= from_number),
  street_side text not null default 'BOTH' check (street_side in ('BOTH','EVEN','ODD')),
  capacity integer not null check (capacity > 0),
  occupied_spaces integer not null default 0 check (occupied_spaces >= 0 and occupied_spaces <= capacity),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  sort_order integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (street_id, code)
);

create or replace function public.validate_parking_street_segment()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.parking_street_segments other
    where other.street_id = new.street_id
      and other.id <> new.id
      and other.status <> 'INACTIVE'
      and new.status <> 'INACTIVE'
      and (other.street_side = 'BOTH' or new.street_side = 'BOTH' or other.street_side = new.street_side)
      and int4range(other.from_number, other.to_number, '[]') && int4range(new.from_number, new.to_number, '[]')
  ) then
    raise exception 'STREET_SEGMENT_RANGE_OVERLAP' using errcode='23514';
  end if;
  if not exists (
    select 1 from public.parking_streets street
    where street.id=new.street_id and street.parking_id=new.parking_id and street.sector_id=new.area_id
  ) then
    raise exception 'STREET_SEGMENT_PARENT_MISMATCH' using errcode='23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists parking_street_segments_validate on public.parking_street_segments;
create trigger parking_street_segments_validate before insert or update on public.parking_street_segments
for each row execute function public.validate_parking_street_segment();
create index if not exists parking_street_segments_structure_idx
  on public.parking_street_segments(parking_id,area_id,street_id,status,sort_order);

-- Preserva la capacidad actualmente declarada creando un tramo inicial por calle.
insert into public.parking_street_segments (
  parking_id,area_id,street_id,code,name,from_number,to_number,capacity,occupied_spaces,status
)
select street.parking_id,street.sector_id,street.id,'TR-001','Tramo inicial',0,
  street.capacity,street.capacity,street.occupied,street.status
from public.parking_streets street
where street.capacity > 0
  and not exists (select 1 from public.parking_street_segments segment where segment.street_id=street.id);

create table if not exists public.parking_rates (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  area_id uuid null references public.parking_sectors(id) on delete restrict,
  name text not null,
  billing_mode text not null check (billing_mode in ('EFFECTIVE_MINUTE','EXPIRED_BLOCKS')),
  currency text not null default 'CLP' check (currency='CLP'),
  minute_amount numeric(14,4) null check (minute_amount is null or minute_amount > 0),
  free_period_seconds integer not null default 0 check (free_period_seconds >= 0),
  multiply_by_spaces boolean not null default false,
  daily_flat_amount numeric(14,2) null check (daily_flat_amount is null or daily_flat_amount >= 0),
  valid_from timestamptz not null,
  valid_until timestamptz null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','SUSPENDED','ENDED')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from),
  check (
    (billing_mode='EFFECTIVE_MINUTE' and minute_amount is not null)
    or (billing_mode='EXPIRED_BLOCKS' and minute_amount is null)
  )
);

create table if not exists public.parking_rate_blocks (
  id uuid primary key default gen_random_uuid(),
  rate_id uuid not null references public.parking_rates(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  duration_seconds integer not null,
  amount numeric(14,2) not null check (amount >= 0),
  repeat_after boolean not null default false,
  created_at timestamptz not null default now(),
  unique (rate_id,sequence),
  check (
    (sequence=1 and duration_seconds >= 1800)
    or (sequence>1 and duration_seconds >= 600)
  )
);

create or replace function public.validate_parking_rate()
returns trigger language plpgsql as $$
begin
  if new.status='ACTIVE' and new.billing_mode='EXPIRED_BLOCKS' and not exists (
    select 1 from public.parking_rate_blocks block where block.rate_id=new.id and block.sequence=1
  ) then
    raise exception 'RATE_FIRST_BLOCK_REQUIRED' using errcode='23514';
  end if;
  if new.status='ACTIVE' and exists (
    select 1 from public.parking_rates other
    where other.parking_id=new.parking_id
      and coalesce(other.area_id,'00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(new.area_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and other.id<>new.id and other.status='ACTIVE'
      and tstzrange(other.valid_from,coalesce(other.valid_until,'infinity'::timestamptz),'[)')
        && tstzrange(new.valid_from,coalesce(new.valid_until,'infinity'::timestamptz),'[)')
  ) then
    raise exception 'ACTIVE_RATE_VALIDITY_OVERLAP' using errcode='23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists parking_rates_validate on public.parking_rates;
create trigger parking_rates_validate before insert or update on public.parking_rates
for each row execute function public.validate_parking_rate();

create or replace function public.prevent_parking_type_change_with_history()
returns trigger language plpgsql as $$
declare v_has_data boolean;
begin
  if new.type = old.type then return new; end if;
  select
    old.status not in ('DRAFT','CONFIGURING')
    or exists(select 1 from public.parking_levels where parking_id=old.id)
    or exists(select 1 from public.parking_zones where parking_id=old.id)
    or exists(select 1 from public.parking_sectors where parking_id=old.id)
    or exists(select 1 from public.parking_streets where parking_id=old.id)
    or exists(select 1 from public.operator_assignments where parking_id=old.id)
    or exists(select 1 from public.operator_shifts where parking_id=old.id)
    or exists(select 1 from public.shift_closures where parking_id=old.id)
    or exists(select 1 from public.parking_rates where parking_id=old.id)
  into v_has_data;
  if v_has_data then
    raise exception 'TYPE_CHANGE_REQUIRES_SUCCESSOR_PARKING' using errcode='P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists parkings_prevent_type_change_with_history on public.parkings;
create trigger parkings_prevent_type_change_with_history before update of type on public.parkings
for each row execute function public.prevent_parking_type_change_with_history();

alter table public.parking_street_segments enable row level security;
alter table public.parking_rates enable row level security;
alter table public.parking_rate_blocks enable row level security;
grant select,insert,update on public.parking_street_segments,public.parking_rates,public.parking_rate_blocks to service_role;

create or replace function public.create_successor_parking(
  p_predecessor_id uuid,
  p_code text,
  p_name text,
  p_new_type text,
  p_previous_status text,
  p_reason text
) returns public.parkings
language plpgsql security definer set search_path=public as $$
declare v_previous public.parkings%rowtype; v_successor public.parkings%rowtype;
begin
  if p_new_type not in ('OFF_STREET','ON_STREET') then raise exception 'INVALID_PARKING_TYPE' using errcode='22023'; end if;
  if p_previous_status not in ('SUSPENDED','CLOSED') then raise exception 'INVALID_PREDECESSOR_STATUS' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'SUCCESSION_REASON_REQUIRED' using errcode='23514'; end if;
  select * into v_previous from public.parkings where id=p_predecessor_id for update;
  if not found then raise exception 'PARKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_previous.type=p_new_type then raise exception 'SUCCESSOR_TYPE_MUST_DIFFER' using errcode='23514'; end if;
  if exists(select 1 from public.parkings where predecessor_parking_id=v_previous.id) then raise exception 'SUCCESSOR_ALREADY_EXISTS' using errcode='23505'; end if;

  update public.parkings set
    status=p_previous_status,
    suspended_at=case when p_previous_status='SUSPENDED' then clock_timestamp() else suspended_at end,
    closed_at=case when p_previous_status='CLOSED' then clock_timestamp() else closed_at end,
    closure_reason=left(trim(p_reason),1000),
    updated_at=clock_timestamp()
  where id=v_previous.id;

  insert into public.parkings (
    code,name,company_id,company_name,type,status,address,city,country,schedule,description,
    access_count,exit_count,district,region,notes,predecessor_parking_id,
    off_street_configuration_status,on_street_configuration_status
  ) values (
    upper(trim(p_code)),trim(p_name),v_previous.company_id,v_previous.company_name,p_new_type,'DRAFT',
    v_previous.address,v_previous.city,v_previous.country,v_previous.schedule,'',
    0,0,v_previous.district,v_previous.region,'Continuidad operacional de '||v_previous.code,v_previous.id,
    case when p_new_type='OFF_STREET' then 'ACTIVE' else 'EMPTY' end,
    case when p_new_type='ON_STREET' then 'ACTIVE' else 'EMPTY' end
  ) returning * into v_successor;
  return v_successor;
end;
$$;
revoke all on function public.create_successor_parking(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_successor_parking(uuid,text,text,text,text,text) to service_role;

create or replace function public.activate_parking_configuration(p_parking_id uuid,p_actor_id uuid)
returns public.parkings language plpgsql security definer set search_path=public as $$
declare v_parking public.parkings%rowtype; v_parent integer; v_child integer; v_capacity integer; v_rates integer;
begin
  select * into v_parking from public.parkings where id=p_parking_id for update;
  if not found then raise exception 'PARKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_parking.type='OFF_STREET' then
    select count(*) into v_parent from public.parking_levels where parking_id=p_parking_id and status='ACTIVE';
    select count(*),coalesce(sum(capacity),0) into v_child,v_capacity from public.parking_zones where parking_id=p_parking_id and status='ACTIVE';
  else
    select count(*) into v_parent from public.parking_sectors where parking_id=p_parking_id and status='ACTIVE';
    select count(*),coalesce(sum(capacity),0) into v_child,v_capacity from public.parking_street_segments where parking_id=p_parking_id and status='ACTIVE';
    if not exists(select 1 from public.parking_streets where parking_id=p_parking_id and status='ACTIVE') then
      raise exception 'ACTIVATION_STREET_REQUIRED' using errcode='23514';
    end if;
  end if;
  select count(*) into v_rates from public.parking_rates
  where parking_id=p_parking_id and status='ACTIVE' and valid_from<=now() and (valid_until is null or valid_until>now());
  if v_parent<1 or v_child<1 or v_capacity<1 then raise exception 'ACTIVATION_STRUCTURE_PENDING' using errcode='23514'; end if;
  if v_rates<1 then raise exception 'ACTIVATION_RATE_REQUIRED' using errcode='23514'; end if;
  update public.parkings set status='ACTIVE',updated_at=clock_timestamp() where id=p_parking_id returning * into v_parking;
  return v_parking;
end;
$$;
