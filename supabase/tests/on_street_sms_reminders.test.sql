-- SOL-2026-11-02-004. Se ejecuta en una transacción y se deshace (ROLLBACK).
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/on_street_sms_reminders.test.sql
begin;
create temp table resultado(caso text, ok boolean, detalle text) on commit drop;

create function pg_temp.nueva_sesion(p_minutos integer) returns uuid language plpgsql as $$
declare v_qr record; v_id uuid;
begin
  select id, parking_id into v_qr from public.on_street_qr_locations order by created_at limit 1;
  insert into public.on_street_pilot_sessions(qr_location_id, parking_id, phone_normalized, license_plate_normalized, status, started_at, purchased_minutes, expires_at)
    values (v_qr.id, v_qr.parking_id, '+5691' || lpad(floor(random() * 10000000)::text, 7, '0'), 'QA' || lpad(floor(random() * 10000)::text, 4, '0'), 'ACTIVE', clock_timestamp(), p_minutos, clock_timestamp() + make_interval(mins => p_minutos))
    returning id into v_id;
  return v_id;
end $$;

create function pg_temp.pendientes(p_sesion uuid) returns text language sql as $$
  select coalesce(string_agg(type, ',' order by scheduled_at), '')
  from public.on_street_pilot_notifications
  where session_id = p_sesion and status = 'PENDING'
$$;

do $$
declare v_id uuid; v_vence timestamptz; v_n integer;
begin
  -- 1. sesión larga: los 2 avisos, cada uno a su hora
  v_id := pg_temp.nueva_sesion(60);
  select expires_at into v_vence from public.on_street_pilot_sessions where id = v_id;
  insert into resultado select 'sesión de 60 min programa los 2 avisos', pg_temp.pendientes(v_id) = 'EXPIRING_SOON,EXPIRED', pg_temp.pendientes(v_id);
  select count(*) into v_n from public.on_street_pilot_notifications where session_id = v_id and type = 'EXPIRING_SOON' and scheduled_at = v_vence - interval '15 minutes';
  insert into resultado select 'el aviso previo queda a 15 minutos', v_n = 1, v_n::text;
  select count(*) into v_n from public.on_street_pilot_notifications where session_id = v_id and type = 'EXPIRED' and scheduled_at = v_vence;
  insert into resultado select 'el aviso al vencer queda en el vencimiento', v_n = 1, v_n::text;

  -- 2. extender cancela los pendientes y programa el nuevo ciclo
  update public.on_street_pilot_sessions set expires_at = v_vence + interval '30 minutes' where id = v_id;
  insert into resultado select 'extender deja los 2 avisos del nuevo vencimiento', pg_temp.pendientes(v_id) = 'EXPIRING_SOON,EXPIRED', pg_temp.pendientes(v_id);
  select count(*) into v_n from public.on_street_pilot_notifications where session_id = v_id and status = 'CANCELLED' and target_expires_at = v_vence;
  insert into resultado select 'extender cancela los 2 avisos del ciclo anterior', v_n = 2, v_n::text;

  -- 3. al vencer se conserva solo el aviso de vencimiento
  update public.on_street_pilot_sessions set status = 'EXPIRED' where id = v_id;
  insert into resultado select 'al vencer queda solo el aviso de vencimiento', pg_temp.pendientes(v_id) = 'EXPIRED', pg_temp.pendientes(v_id);

  -- 4. finalizar cancela todo
  v_id := pg_temp.nueva_sesion(60);
  update public.on_street_pilot_sessions set status = 'CLOSED', ended_at = clock_timestamp(), duration_seconds = 60 where id = v_id;
  insert into resultado select 'finalizar cancela todos los pendientes', pg_temp.pendientes(v_id) = '', pg_temp.pendientes(v_id);

  -- 5. sesiones cortas: solo el aviso al vencer
  v_id := pg_temp.nueva_sesion(16);
  insert into resultado select 'sesión de 16 min tiene los 2 avisos', pg_temp.pendientes(v_id) = 'EXPIRING_SOON,EXPIRED', pg_temp.pendientes(v_id);
  v_id := pg_temp.nueva_sesion(15);
  insert into resultado select 'sesión de 15 min tiene solo el aviso al vencer', pg_temp.pendientes(v_id) = 'EXPIRED', pg_temp.pendientes(v_id);
  v_id := pg_temp.nueva_sesion(3);
  insert into resultado select 'sesión de 3 min tiene solo el aviso al vencer', pg_temp.pendientes(v_id) = 'EXPIRED', pg_temp.pendientes(v_id);

  -- 6. extender una sesión corta a más de 15 minutos recupera el aviso previo
  update public.on_street_pilot_sessions set expires_at = clock_timestamp() + interval '20 minutes' where id = v_id;
  insert into resultado select 'extender a 20 min recupera el aviso previo', pg_temp.pendientes(v_id) = 'EXPIRING_SOON,EXPIRED', pg_temp.pendientes(v_id);
end $$;

select case when ok then 'OK   ' else 'FALLA' end as resultado, caso, detalle from resultado;
do $$ begin
  if exists (select 1 from resultado where not ok) then raise exception 'Hay casos fallidos'; end if;
end $$;
rollback;
