-- Motor tarifario legal: para estadías inferiores a 24 horas solo existen dos
-- modalidades (minuto efectivo, tramo vencido). El "valor único nocturno"
-- (overnight_flat_amount, agregado en 20260802183000_parking_rate_schedules_and_overnight.sql)
-- es un cargo fijo ajeno a ambas modalidades y queda retirado del motor de cálculo
-- (ver docs/MOTOR-TARIFARIO-LEGAL.md). No se elimina la columna ni se borra historial:
-- se neutraliza a nivel de base de datos y se suspende cualquier tarifa activa que la
-- use, para revisión administrativa.

-- 1) Ninguna tarifa nueva o modificada puede volver a fijar un valor nocturno > 0.
alter table public.parking_rates drop constraint if exists parking_rates_overnight_flat_amount_check;
alter table public.parking_rates add constraint parking_rates_overnight_flat_amount_check
  check (overnight_flat_amount is null or overnight_flat_amount = 0);

-- 2) Cualquier tarifa heredada que ya esté ACTIVE con un valor nocturno > 0 queda
--    suspendida (no eliminada, no reinterpretada) hasta corrección administrativa.
update public.parking_rates
set status = 'SUSPENDED', updated_at = now()
where status = 'ACTIVE' and overnight_flat_amount is not null and overnight_flat_amount > 0;
