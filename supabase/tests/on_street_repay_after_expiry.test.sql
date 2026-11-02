-- SOL-2026-11-02-004. Se ejecuta en una transacción y se deshace (ROLLBACK).
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/on_street_repay_after_expiry.test.sql
begin;
create temp table resultado(caso text, ok boolean, detalle text) on commit drop;

-- Pago ya autorizado por Transbank, listo para confirmarse en la base.
create function pg_temp.pago_autorizado(p_qr uuid, p_parking uuid, p_telefono text, p_patente text) returns uuid language plpgsql as $$
declare v_intent uuid; v_tx uuid;
begin
  insert into public.on_street_payment_intents(qr_location_id, parking_id, phone_normalized, operation_type, purchased_minutes, rate_id, rate_per_minute, amount, currency, location_snapshot, rate_snapshot, idempotency_key, status, expires_at, license_plate_normalized)
    select p_qr, p_parking, p_telefono, 'INITIAL', 10, rate_id, 35, 350, currency, location_snapshot, rate_snapshot, gen_random_uuid()::text, 'PAYMENT_PROCESSING', clock_timestamp() + interval '10 minutes', p_patente
    from public.on_street_payment_intents order by created_at desc limit 1
    returning id into v_intent;
  insert into public.payment_transactions(provider, source_type, source_id, amount, currency, buy_order, provider_session_id, idempotency_key, status)
    values ('TRANSBANK_WEBPAY', 'ON_STREET_INITIAL', v_intent, 350, 'CLP', 'QT' || floor(random() * 1e12)::text, 'qt', gen_random_uuid()::text, 'COMMITTING')
    returning id into v_tx;
  return v_tx;
end $$;

create function pg_temp.sesion(p_qr uuid, p_parking uuid, p_telefono text, p_patente text, p_vence interval) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.on_street_pilot_sessions(qr_location_id, parking_id, phone_normalized, status, started_at, purchased_minutes, expires_at, license_plate_normalized)
    values (p_qr, p_parking, p_telefono, 'ACTIVE', clock_timestamp() - interval '20 minutes', 10, clock_timestamp() + p_vence, p_patente)
    returning id into v_id;
  return v_id;
end $$;

create function pg_temp.confirmar(p_tx uuid) returns text language plpgsql as $$
begin
  perform public.finalize_authorized_on_street_payment(p_tx, 'AUTHORIZED', 'QA', 0, '{}'::jsonb, 'CREDIT', 'VN');
  return 'sin error';
exception when others then return sqlstate;
end $$;

do $$
declare v_qr record; v_vieja uuid; v_tx uuid; v_err text; v_estado text; v_n integer; v_tel text;
begin
  select id, parking_id into v_qr from public.on_street_qr_locations order by created_at limit 1;
  v_tel := '+5691' || lpad(floor(random() * 10000000)::text, 7, '0');

  -- 1. misma patente, sesión vencida que sigue ACTIVE: el pago nuevo crea la sesión
  v_vieja := pg_temp.sesion(v_qr.id, v_qr.parking_id, v_tel, 'QAPAT1', interval '-1 minute');
  v_err := pg_temp.confirmar(pg_temp.pago_autorizado(v_qr.id, v_qr.parking_id, v_tel, 'QAPAT1'));
  insert into resultado select 'pagar de nuevo tras vencer no falla', v_err = 'sin error', v_err;
  select status into v_estado from public.on_street_pilot_sessions where id = v_vieja;
  insert into resultado select 'la sesión vencida queda EXPIRED', v_estado = 'EXPIRED', v_estado;
  select count(*) into v_n from public.on_street_pilot_sessions where license_plate_normalized = 'QAPAT1' and status = 'ACTIVE' and expires_at > clock_timestamp();
  insert into resultado select 'queda una sesión activa vigente', v_n = 1, v_n::text;

  -- 2. mismo móvil, otra patente: cada vehículo tiene su sesión
  v_err := pg_temp.confirmar(pg_temp.pago_autorizado(v_qr.id, v_qr.parking_id, v_tel, 'QAPAT2'));
  insert into resultado select 'el mismo móvil puede pagar otra patente', v_err = 'sin error', v_err;
  select count(*) into v_n from public.on_street_pilot_sessions where phone_normalized = v_tel and status = 'ACTIVE' and expires_at > clock_timestamp();
  insert into resultado select 'el móvil queda con 2 sesiones activas', v_n = 2, v_n::text;

  -- 3. misma patente con tiempo vigente: la base sigue impidiendo una segunda sesión
  v_err := pg_temp.confirmar(pg_temp.pago_autorizado(v_qr.id, v_qr.parking_id, '+56900000075', 'QAPAT2'));
  insert into resultado select 'una patente no puede tener 2 sesiones activas en un QR', v_err = '23505', v_err;

  -- 4. sesiones sin patente no compiten entre sí
  v_tel := '+5691' || lpad(floor(random() * 10000000)::text, 7, '0');
  perform pg_temp.sesion(v_qr.id, v_qr.parking_id, v_tel, null, interval '30 minutes');
  perform pg_temp.sesion(v_qr.id, v_qr.parking_id, v_tel, null, interval '30 minutes');
  insert into resultado select 'sesiones sin patente se admiten', true, '';
end $$;

select case when ok then 'OK   ' else 'FALLA' end as resultado, caso, detalle from resultado;
do $$ begin
  if exists (select 1 from resultado where not ok) then raise exception 'Hay casos fallidos'; end if;
end $$;
rollback;
