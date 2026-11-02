-- SOL-2026-11-02-004. Se ejecuta en una transacción y se deshace (ROLLBACK).
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/on_street_sms_three_reminders.test.sql
begin;
create temp table resultado(caso text, ok boolean, detalle text) on commit drop;

create function pg_temp.nueva_sesion(p_minutos integer) returns uuid language plpgsql as $$
declare v_qr record; v_id uuid;
begin
  select id, parking_id into v_qr from public.on_street_qr_locations order by created_at limit 1;
  insert into public.on_street_pilot_sessions(qr_location_id, parking_id, phone_normalized, status, started_at, purchased_minutes, expires_at)
    values (v_qr.id, v_qr.parking_id, '+5691' || lpad(floor(random() * 10000000)::text, 7, '0'), 'ACTIVE', clock_timestamp(), p_minutos, clock_timestamp() + make_interval(mins => p_minutos))
    returning id into v_id;
  return v_id;
end $$;

create function pg_temp.pendientes(p_sesion uuid) returns text language sql as $$
  select coalesce(string_agg(reminder_minutes::text, ',' order by reminder_minutes desc), '')
  from public.on_street_pilot_notifications
  where session_id = p_sesion and type = 'EXPIRING_SOON' and status = 'PENDING'
$$;

do $$
declare v_id uuid; v_vence timestamptz; v_err text; v_n integer;
begin
  -- 1. sesión larga: 3 avisos, cada uno a su hora
  v_id := pg_temp.nueva_sesion(60);
  select expires_at into v_vence from public.on_street_pilot_sessions where id = v_id;
  insert into resultado select 'sesión de 60 min programa 15, 10 y 5', pg_temp.pendientes(v_id) = '15,10,5', pg_temp.pendientes(v_id);
  select count(*) into v_n from public.on_street_pilot_notifications
    where session_id = v_id and scheduled_at = v_vence - make_interval(mins => reminder_minutes) and target_expires_at = v_vence;
  insert into resultado select 'cada aviso queda programado según su anticipación', v_n = 3, v_n::text;

  -- 2. extender cancela los pendientes y programa el nuevo ciclo
  update public.on_street_pilot_sessions set expires_at = v_vence + interval '30 minutes' where id = v_id;
  insert into resultado select 'extender deja 3 pendientes del nuevo vencimiento', pg_temp.pendientes(v_id) = '15,10,5', pg_temp.pendientes(v_id);
  select count(*) into v_n from public.on_street_pilot_notifications where session_id = v_id and status = 'CANCELLED' and target_expires_at = v_vence;
  insert into resultado select 'extender cancela los 3 avisos del ciclo anterior', v_n = 3, v_n::text;

  -- 3. finalizar cancela los pendientes
  update public.on_street_pilot_sessions set status = 'CLOSED', ended_at = clock_timestamp(), duration_seconds = 60 where id = v_id;
  insert into resultado select 'finalizar cancela todos los pendientes', pg_temp.pendientes(v_id) = '', pg_temp.pendientes(v_id);

  -- 4. sesiones cortas: solo los avisos que aún no han pasado
  v_id := pg_temp.nueva_sesion(12);
  insert into resultado select 'sesión de 12 min programa 10 y 5', pg_temp.pendientes(v_id) = '10,5', pg_temp.pendientes(v_id);
  v_id := pg_temp.nueva_sesion(15);
  insert into resultado select 'sesión de 15 min programa 10 y 5', pg_temp.pendientes(v_id) = '10,5', pg_temp.pendientes(v_id);
  v_id := pg_temp.nueva_sesion(10);
  insert into resultado select 'sesión de 10 min programa solo 5', pg_temp.pendientes(v_id) = '5', pg_temp.pendientes(v_id);
  v_id := pg_temp.nueva_sesion(3);
  insert into resultado select 'sesión de 3 min no programa avisos', pg_temp.pendientes(v_id) = '', pg_temp.pendientes(v_id);

  -- 5. extender una sesión corta programa solo lo que aún no ha pasado
  update public.on_street_pilot_sessions set expires_at = clock_timestamp() + interval '8 minutes' where id = v_id;
  insert into resultado select 'extender a 8 min programa solo 5', pg_temp.pendientes(v_id) = '5', pg_temp.pendientes(v_id);

  -- 6. restricciones
  begin
    update public.on_street_pilot_notifications set reminder_minutes = 7 where session_id = v_id;
    v_err := 'sin error';
  exception when check_violation then v_err := 'rechazado'; end;
  insert into resultado select 'la anticipación solo admite 5, 10 o 15', v_err = 'rechazado', v_err;

  begin
    insert into public.on_street_pilot_notifications(session_id, parking_id, qr_location_id, type, phone_normalized, scheduled_at, target_expires_at, reminder_minutes, message)
      select session_id, parking_id, qr_location_id, type, phone_normalized, scheduled_at, target_expires_at, reminder_minutes, message
      from public.on_street_pilot_notifications where session_id = v_id and status = 'PENDING' limit 1;
    v_err := 'sin error';
  exception when unique_violation then v_err := 'rechazado'; end;
  insert into resultado select 'no se duplica un aviso del mismo ciclo', v_err = 'rechazado', v_err;
end $$;

select case when ok then 'OK   ' else 'FALLA' end as resultado, caso, detalle from resultado;
do $$ begin
  if exists (select 1 from resultado where not ok) then raise exception 'Hay casos fallidos'; end if;
end $$;
rollback;
