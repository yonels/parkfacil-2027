-- Piloto On Street QR: ubicaciones publicas y sesiones sin cobro.
create extension if not exists pgcrypto;

create table if not exists public.on_street_qr_locations (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  sector_id uuid not null references public.parking_sectors(id) on delete restrict,
  street_id uuid not null references public.parking_streets(id) on delete restrict,
  segment_id uuid not null unique references public.parking_street_segments(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_code ~ '^[a-zA-Z0-9_-]{20,80}$')
);

create table if not exists public.on_street_pilot_sessions (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  qr_location_id uuid not null references public.on_street_qr_locations(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  phone_normalized text not null check (phone_normalized ~ '^\+569[0-9]{8}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED')),
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz null,
  duration_seconds integer null check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status='ACTIVE' and ended_at is null and duration_seconds is null) or (status='CLOSED' and ended_at is not null and duration_seconds is not null))
);

create unique index if not exists on_street_one_active_phone_location_idx
  on public.on_street_pilot_sessions(qr_location_id, phone_normalized) where status='ACTIVE';
create index if not exists on_street_sessions_parking_started_idx
  on public.on_street_pilot_sessions(parking_id, started_at desc);

create table if not exists public.on_street_pilot_attempts (
  id bigint generated always as identity primary key,
  qr_location_id uuid not null references public.on_street_qr_locations(id) on delete cascade,
  client_hash text not null check (length(client_hash)=64),
  attempted_at timestamptz not null default clock_timestamp()
);
create index if not exists on_street_attempts_limit_idx on public.on_street_pilot_attempts(qr_location_id,client_hash,attempted_at desc);

create or replace function public.validate_on_street_qr_location() returns trigger
language plpgsql set search_path=public as $$
begin
  if not exists (
    select 1 from public.parkings p
    join public.parking_sectors a on a.parking_id=p.id
    join public.parking_streets s on s.parking_id=p.id and s.sector_id=a.id
    join public.parking_street_segments g on g.parking_id=p.id and g.area_id=a.id and g.street_id=s.id
    where p.id=new.parking_id and p.type='ON_STREET' and a.id=new.sector_id and s.id=new.street_id and g.id=new.segment_id
  ) then raise exception 'QR_LOCATION_HIERARCHY_INVALID' using errcode='23514'; end if;
  new.updated_at=clock_timestamp(); return new;
end $$;
drop trigger if exists on_street_qr_location_validate on public.on_street_qr_locations;
create trigger on_street_qr_location_validate before insert or update on public.on_street_qr_locations
for each row execute function public.validate_on_street_qr_location();

create or replace function public.create_on_street_pilot_session(p_qr_code text,p_phone text,p_client_hash text)
returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v_location public.on_street_qr_locations%rowtype; v_session public.on_street_pilot_sessions%rowtype;
begin
  if p_phone !~ '^\+569[0-9]{8}$' or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'PILOT_INPUT_INVALID' using errcode='23514'; end if;
  select q.* into v_location from public.on_street_qr_locations q
  join public.parkings p on p.id=q.parking_id and p.type='ON_STREET' and p.status='ACTIVE'
  join public.parking_street_segments g on g.id=q.segment_id and g.status='ACTIVE'
  where q.public_code=p_qr_code and q.status='ACTIVE';
  if not found then raise exception 'QR_LOCATION_NOT_FOUND' using errcode='P0002'; end if;
  if (select count(*) from public.on_street_pilot_attempts where qr_location_id=v_location.id and client_hash=p_client_hash and attempted_at>clock_timestamp()-interval '1 minute') >= 5
    then raise exception 'PILOT_RATE_LIMITED' using errcode='P0001'; end if;
  insert into public.on_street_pilot_attempts(qr_location_id,client_hash) values(v_location.id,p_client_hash);
  select * into v_session from public.on_street_pilot_sessions where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE';
  if found then return v_session; end if;
  begin
    insert into public.on_street_pilot_sessions(qr_location_id,parking_id,phone_normalized)
    values(v_location.id,v_location.parking_id,p_phone) returning * into v_session;
  exception when unique_violation then
    select * into v_session from public.on_street_pilot_sessions where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE';
  end;
  return v_session;
end $$;

create or replace function public.close_on_street_pilot_session(p_public_token uuid)
returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v_session public.on_street_pilot_sessions%rowtype; v_end timestamptz:=clock_timestamp();
begin
  select * into v_session from public.on_street_pilot_sessions where public_token=p_public_token for update;
  if not found then raise exception 'PILOT_SESSION_NOT_FOUND' using errcode='P0002'; end if;
  if v_session.status='ACTIVE' then
    update public.on_street_pilot_sessions set status='CLOSED',ended_at=v_end,
      duration_seconds=greatest(0,floor(extract(epoch from (v_end-started_at)))::integer),updated_at=v_end
    where id=v_session.id returning * into v_session;
  end if;
  return v_session;
end $$;

alter table public.on_street_qr_locations enable row level security;
alter table public.on_street_pilot_sessions enable row level security;
alter table public.on_street_pilot_attempts enable row level security;
revoke all on public.on_street_qr_locations,public.on_street_pilot_sessions,public.on_street_pilot_attempts from anon,authenticated;
grant select,insert,update on public.on_street_qr_locations,public.on_street_pilot_sessions,public.on_street_pilot_attempts to service_role;
grant usage,select on sequence public.on_street_pilot_attempts_id_seq to service_role;
revoke all on function public.create_on_street_pilot_session(text,text,text),public.close_on_street_pilot_session(uuid) from public,anon,authenticated;
grant execute on function public.create_on_street_pilot_session(text,text,text),public.close_on_street_pilot_session(uuid) to service_role;
