-- On-Street QR: sube el rango de minutos permitido de 1-720 a 1-1440 (24h),
-- tanto en contratación inicial como en extensión, y ajusta el aviso SMS de
-- "10 minutos antes" a "15 minutos antes" del vencimiento.

-- Restricciones de tabla
alter table public.on_street_pilot_sessions
  drop constraint if exists on_street_pilot_sessions_purchased_minutes_check,
  add constraint on_street_pilot_sessions_purchased_minutes_check check (purchased_minutes is null or (purchased_minutes >= 1 and purchased_minutes <= 1440));

alter table public.on_street_pilot_extensions
  drop constraint if exists on_street_pilot_extensions_additional_minutes_check,
  add constraint on_street_pilot_extensions_additional_minutes_check check (additional_minutes >= 1 and additional_minutes <= 1440);

alter table public.on_street_payment_intents
  drop constraint if exists on_street_payment_intents_purchased_minutes_check,
  add constraint on_street_payment_intents_purchased_minutes_check check (purchased_minutes >= 1 and purchased_minutes <= 1440);

-- RPC: contratación inicial (prepago simulado, aún usada como base por
-- finalize_authorized_on_street_payment más abajo no depende de esta función,
-- pero se mantiene consistente con el nuevo rango).
create or replace function public.create_on_street_pilot_session(p_qr_code text,p_phone text,p_client_hash text,p_minutes integer)
returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v_location public.on_street_qr_locations%rowtype; v_session public.on_street_pilot_sessions%rowtype; v_rate public.parking_rates%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if p_phone !~ '^\+569[0-9]{8}$' or p_client_hash !~ '^[a-f0-9]{64}$' or p_minutes not between 1 and 1440 then raise exception 'PILOT_INPUT_INVALID' using errcode='23514'; end if;
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

-- RPC: extensión
create or replace function public.extend_on_street_pilot_session(p_public_token uuid,p_minutes integer) returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v public.on_street_pilot_sessions%rowtype; r public.parking_rates%rowtype; v_now timestamptz:=clock_timestamp(); v_previous timestamptz; v_new timestamptz;
begin if p_minutes not between 1 and 1440 then raise exception 'PILOT_INPUT_INVALID' using errcode='23514'; end if; select * into v from public.on_street_pilot_sessions where public_token=p_public_token for update; if not found then raise exception 'PILOT_SESSION_NOT_FOUND' using errcode='P0002'; end if; if v.status<>'ACTIVE' or v.expires_at<=v_now then update public.on_street_pilot_sessions set status='EXPIRED',updated_at=v_now where id=v.id and status='ACTIVE'; raise exception 'PILOT_SESSION_NOT_ACTIVE' using errcode='23514'; end if;
  select * into r from public.parking_rates where id=v.rate_id and status='ACTIVE' and valid_from<=v_now and (valid_until is null or valid_until>v_now); if not found then raise exception 'PILOT_RATE_NOT_FOUND' using errcode='P0002'; end if;
  v_previous:=v.expires_at;v_new:=v_previous+p_minutes*interval '1 minute'; insert into public.on_street_pilot_extensions(session_id,additional_minutes,rate_id,rate_per_minute,simulated_amount,previous_expires_at,new_expires_at) values(v.id,p_minutes,r.id,r.minute_amount,round(p_minutes*r.minute_amount)::integer,v_previous,v_new);
  update public.on_street_pilot_sessions set purchased_minutes=purchased_minutes+p_minutes,simulated_amount=simulated_amount+round(p_minutes*r.minute_amount)::integer,expires_at=v_new,updated_at=v_now where id=v.id returning * into v; return v; end $$;

-- Aviso SMS: 15 minutos antes del vencimiento (antes: 10).
create or replace function public.schedule_on_street_pilot_notifications() returns trigger language plpgsql security definer set search_path=public as $$
declare v_street text; v_segment text; v_path text;
begin
  if tg_op='UPDATE' and new.status='CLOSED' and old.status is distinct from new.status then
    update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp() where session_id=new.id and status='PENDING';
    return new;
  end if;
  if tg_op='UPDATE' and new.status='EXPIRED' and old.status is distinct from new.status then
    update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp() where session_id=new.id and type='EXPIRING_SOON' and status='PENDING';
    return new;
  end if;
  if new.status='ACTIVE' and new.expires_at is not null and (tg_op='INSERT' or old.expires_at is distinct from new.expires_at) then
    if tg_op='UPDATE' then update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp() where session_id=new.id and status='PENDING'; end if;
    select s.name,g.name into v_street,v_segment from public.on_street_qr_locations q join public.parking_streets s on s.id=q.street_id join public.parking_street_segments g on g.id=q.segment_id where q.id=new.qr_location_id;
    v_path:='/estacionar/sesion/'||new.public_token::text;
    insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,message) values
      (new.id,new.parking_id,new.qr_location_id,'EXPIRING_SOON',new.phone_normalized,new.expires_at-interval '15 minutes','ParkFacil: tu estacionamiento en '||v_street||' '||v_segment||' vence en 15 minutos. Si necesitas más tiempo, ingresa aquí: '||v_path),
      (new.id,new.parking_id,new.qr_location_id,'EXPIRED',new.phone_normalized,new.expires_at,'ParkFacil: tu tiempo de estacionamiento en '||v_street||' '||v_segment||' ha finalizado. Revisa tu sesión aquí: '||v_path);
  end if;
  return new;
end $$;
