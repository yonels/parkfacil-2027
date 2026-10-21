-- Piloto prepago simulado. No crea cobros ni integra proveedores de pago.
alter table public.on_street_pilot_sessions drop constraint if exists on_street_pilot_sessions_status_check;
alter table public.on_street_pilot_sessions add constraint on_street_pilot_sessions_status_check check(status in ('ACTIVE','CLOSED','EXPIRED'));
alter table public.on_street_pilot_sessions drop constraint if exists on_street_pilot_sessions_check;
alter table public.on_street_pilot_sessions
  add column if not exists purchased_minutes integer null check(purchased_minutes between 1 and 720),
  add column if not exists rate_id uuid null references public.parking_rates(id) on delete restrict,
  add column if not exists rate_per_minute numeric(14,4) null check(rate_per_minute>0),
  add column if not exists simulated_amount integer null check(simulated_amount>=0),
  add column if not exists expires_at timestamptz null;
alter table public.on_street_pilot_sessions add constraint on_street_pilot_sessions_lifecycle_check check(
  (status='ACTIVE' and ended_at is null and duration_seconds is null) or
  (status='CLOSED' and ended_at is not null and duration_seconds is not null) or
  (status='EXPIRED' and ended_at is null and duration_seconds is null)
);

create table if not exists public.on_street_pilot_extensions(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.on_street_pilot_sessions(id) on delete restrict,
  additional_minutes integer not null check(additional_minutes between 1 and 720),
  rate_id uuid not null references public.parking_rates(id) on delete restrict,
  rate_per_minute numeric(14,4) not null check(rate_per_minute>0),
  simulated_amount integer not null check(simulated_amount>=0),
  previous_expires_at timestamptz not null,
  new_expires_at timestamptz not null,
  origin text not null default 'PILOT' check(origin='PILOT'),
  created_at timestamptz not null default clock_timestamp(),
  check(new_expires_at>previous_expires_at)
);
create index if not exists on_street_pilot_extensions_session_idx on public.on_street_pilot_extensions(session_id,created_at);
alter table public.on_street_pilot_extensions enable row level security;
revoke all on public.on_street_pilot_extensions from anon,authenticated;
grant select,insert on public.on_street_pilot_extensions to service_role;

drop function if exists public.create_on_street_pilot_session(text,text,text);
create or replace function public.create_on_street_pilot_session(p_qr_code text,p_phone text,p_client_hash text,p_minutes integer)
returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v_location public.on_street_qr_locations%rowtype; v_session public.on_street_pilot_sessions%rowtype; v_rate public.parking_rates%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if p_phone !~ '^\+569[0-9]{8}$' or p_client_hash !~ '^[a-f0-9]{64}$' or p_minutes not between 1 and 720 then raise exception 'PILOT_INPUT_INVALID' using errcode='23514'; end if;
  select q.* into v_location from public.on_street_qr_locations q join public.parkings p on p.id=q.parking_id and p.type='ON_STREET' and p.status='ACTIVE' join public.parking_street_segments g on g.id=q.segment_id and g.status='ACTIVE' where q.public_code=p_qr_code and q.status='ACTIVE';
  if not found then raise exception 'QR_LOCATION_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_rate from public.parking_rates where parking_id=v_location.parking_id and billing_mode='EFFECTIVE_MINUTE' and status='ACTIVE' and valid_from<=v_now and (valid_until is null or valid_until>v_now) and (area_id is null or area_id=v_location.sector_id) order by (area_id is not null) desc,valid_from desc limit 1;
  if not found or v_rate.minute_amount is null then raise exception 'PILOT_RATE_NOT_FOUND' using errcode='P0002'; end if;
  if (select count(*) from public.on_street_pilot_attempts where qr_location_id=v_location.id and client_hash=p_client_hash and attempted_at>v_now-interval '1 minute')>=5 then raise exception 'PILOT_RATE_LIMITED' using errcode='P0001'; end if;
  insert into public.on_street_pilot_attempts(qr_location_id,client_hash) values(v_location.id,p_client_hash);
  update public.on_street_pilot_sessions set status='EXPIRED',updated_at=v_now where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE' and expires_at is not null and expires_at<=v_now;
  select * into v_session from public.on_street_pilot_sessions where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE'; if found then return v_session; end if;
  begin insert into public.on_street_pilot_sessions(qr_location_id,parking_id,phone_normalized,purchased_minutes,rate_id,rate_per_minute,simulated_amount,expires_at,started_at,created_at,updated_at)
    values(v_location.id,v_location.parking_id,p_phone,p_minutes,v_rate.id,v_rate.minute_amount,round(p_minutes*v_rate.minute_amount)::integer,v_now+p_minutes*interval '1 minute',v_now,v_now,v_now) returning * into v_session;
  exception when unique_violation then select * into v_session from public.on_street_pilot_sessions where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE'; end;
  return v_session;
end $$;

create or replace function public.refresh_on_street_pilot_session(p_public_token uuid) returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v public.on_street_pilot_sessions%rowtype; begin update public.on_street_pilot_sessions set status='EXPIRED',updated_at=clock_timestamp() where public_token=p_public_token and status='ACTIVE' and expires_at<=clock_timestamp(); select * into v from public.on_street_pilot_sessions where public_token=p_public_token; if not found then raise exception 'PILOT_SESSION_NOT_FOUND' using errcode='P0002'; end if; return v; end $$;

create or replace function public.extend_on_street_pilot_session(p_public_token uuid,p_minutes integer) returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v public.on_street_pilot_sessions%rowtype; r public.parking_rates%rowtype; v_now timestamptz:=clock_timestamp(); v_previous timestamptz; v_new timestamptz;
begin if p_minutes not between 1 and 720 then raise exception 'PILOT_INPUT_INVALID' using errcode='23514'; end if; select * into v from public.on_street_pilot_sessions where public_token=p_public_token for update; if not found then raise exception 'PILOT_SESSION_NOT_FOUND' using errcode='P0002'; end if; if v.status<>'ACTIVE' or v.expires_at<=v_now then update public.on_street_pilot_sessions set status='EXPIRED',updated_at=v_now where id=v.id and status='ACTIVE'; raise exception 'PILOT_SESSION_NOT_ACTIVE' using errcode='23514'; end if;
  select * into r from public.parking_rates where id=v.rate_id and status='ACTIVE' and valid_from<=v_now and (valid_until is null or valid_until>v_now); if not found then raise exception 'PILOT_RATE_NOT_FOUND' using errcode='P0002'; end if;
  v_previous:=v.expires_at;v_new:=v_previous+p_minutes*interval '1 minute'; insert into public.on_street_pilot_extensions(session_id,additional_minutes,rate_id,rate_per_minute,simulated_amount,previous_expires_at,new_expires_at) values(v.id,p_minutes,r.id,r.minute_amount,round(p_minutes*r.minute_amount)::integer,v_previous,v_new);
  update public.on_street_pilot_sessions set purchased_minutes=purchased_minutes+p_minutes,simulated_amount=simulated_amount+round(p_minutes*r.minute_amount)::integer,expires_at=v_new,updated_at=v_now where id=v.id returning * into v; return v; end $$;

create or replace function public.expire_on_street_pilot_sessions(p_parking_id uuid) returns integer language plpgsql security definer set search_path=public as $$ declare n integer; begin update public.on_street_pilot_sessions set status='EXPIRED',updated_at=clock_timestamp() where parking_id=p_parking_id and status='ACTIVE' and expires_at<=clock_timestamp(); get diagnostics n=row_count; return n; end $$;

revoke all on function public.create_on_street_pilot_session(text,text,text,integer),public.refresh_on_street_pilot_session(uuid),public.extend_on_street_pilot_session(uuid,integer),public.expire_on_street_pilot_sessions(uuid) from public,anon,authenticated;
grant execute on function public.create_on_street_pilot_session(text,text,text,integer),public.refresh_on_street_pilot_session(uuid),public.extend_on_street_pilot_session(uuid,integer),public.expire_on_street_pilot_sessions(uuid) to service_role;
