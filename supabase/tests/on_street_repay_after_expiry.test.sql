-- SOL-2026-11-02-004. Se ejecuta en una transacción y se deshace (ROLLBACK).
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/on_street_repay_after_expiry.test.sql
begin;
create temp table resultado(caso text, ok boolean, detalle text) on commit drop;

-- Pago ya autorizado por Transbank, listo para confirmarse en la base.
create function pg_temp.pago_autorizado(p_qr uuid, p_parking uuid, p_telefono text) returns uuid language plpgsql as $$
declare v_intent uuid; v_tx uuid;
begin
  insert into public.on_street_payment_intents(qr_location_id, parking_id, phone_normalized, operation_type, purchased_minutes, rate_id, rate_per_minute, amount, currency, location_snapshot, rate_snapshot, idempotency_key, status, expires_at, license_plate_normalized)
    select p_qr, p_parking, p_telefono, 'INITIAL', 10, rate_id, 35, 350, currency, location_snapshot, rate_snapshot, gen_random_uuid()::text, 'PAYMENT_PROCESSING', clock_timestamp() + interval '10 minutes', 'QAAV03'
    from public.on_street_payment_intents order by created_at desc limit 1
    returning id into v_intent;
  insert into public.payment_transactions(provider, source_type, source_id, amount, currency, buy_order, provider_session_id, idempotency_key, status)
    values ('TRANSBANK_WEBPAY', 'ON_STREET_INITIAL', v_intent, 350, 'CLP', 'QT' || floor(random() * 1e12)::text, 'qt', gen_random_uuid()::text, 'COMMITTING')
    returning id into v_tx;
  return v_tx;
end $$;

create function pg_temp.sesion(p_qr uuid, p_parking uuid, p_telefono text, p_vence interval) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.on_street_pilot_sessions(qr_location_id, parking_id, phone_normalized, status, started_at, purchased_minutes, expires_at, license_plate_normalized)
    values (p_qr, p_parking, p_telefono, 'ACTIVE', clock_timestamp() - interval '20 minutes', 10, clock_timestamp() + p_vence, 'QAAV03')
    returning id into v_id;
  return v_id;
end $$;

do $$
declare v_qr record; v_vieja uuid; v_tx uuid; v_err text; v_estado text; v_n integer; v_tel text;
begin
  select id, parking_id into v_qr from public.on_street_qr_locations order by created_at limit 1;

  -- 1. sesión vencida que sigue ACTIVE: el pago nuevo debe crear la sesión
  v_tel := '+5691' || lpad(floor(random() * 10000000)::text, 7, '0');
  v_vieja := pg_temp.sesion(v_qr.id, v_qr.parking_id, v_tel, interval '-1 minute');
  v_tx := pg_temp.pago_autorizado(v_qr.id, v_qr.parking_id, v_tel);
  begin
    perform public.finalize_authorized_on_street_payment(v_tx, 'AUTHORIZED', 'QA', 0, '{}'::jsonb, 'CREDIT', 'VN');
    v_err := 'sin error';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  insert into resultado select 'pagar de nuevo tras vencer no falla', v_err = 'sin error', left(v_err, 70);
  select status into v_estado from public.on_street_pilot_sessions where id = v_vieja;
  insert into resultado select 'la sesión vencida queda EXPIRED', v_estado = 'EXPIRED', v_estado;
  select count(*) into v_n from public.on_street_pilot_sessions where phone_normalized = v_tel and status = 'ACTIVE' and expires_at > clock_timestamp();
  insert into resultado select 'queda una sesión activa vigente', v_n = 1, v_n::text;

  -- 2. sesión todavía vigente: se conserva sin cambios
  v_tel := '+5691' || lpad(floor(random() * 10000000)::text, 7, '0');
  v_vieja := pg_temp.sesion(v_qr.id, v_qr.parking_id, v_tel, interval '5 minutes');
  v_tx := pg_temp.pago_autorizado(v_qr.id, v_qr.parking_id, v_tel);
  begin
    perform public.finalize_authorized_on_street_payment(v_tx, 'AUTHORIZED', 'QA', 0, '{}'::jsonb, 'CREDIT', 'VN');
    v_err := 'sin error';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  select status into v_estado from public.on_street_pilot_sessions where id = v_vieja;
  insert into resultado select 'una sesión vigente no se marca como vencida', v_estado = 'ACTIVE', v_estado;
  raise notice 'pago con sesión aún vigente: %', left(v_err, 110);
end $$;

select case when ok then 'OK   ' else 'FALLA' end as resultado, caso, detalle from resultado;
do $$ begin
  if exists (select 1 from resultado where not ok) then raise exception 'Hay casos fallidos'; end if;
end $$;
rollback;
