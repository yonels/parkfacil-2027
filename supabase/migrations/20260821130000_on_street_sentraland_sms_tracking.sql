-- On-Street QR: soporte de tracking de proveedor SMS real (Sentraland u
-- otro proveedor futuro). Aditivo, no reemplaza ni modifica el piloto
-- simulado existente (on_street_pilot_notifications, trigger T-15).
--
-- 1) Estado intermedio PROCESSING para reclamar un aviso antes de enviarlo:
--    el scheduler hace `update ... set status='PROCESSING' where id=X and
--    status='PENDING'` — si dos ejecuciones concurrentes intentan reclamar
--    la misma fila, el UPDATE condicional solo puede ganarlo una de las
--    dos (la otra actualiza 0 filas), evitando un envío duplicado del
--    mismo SMS. Ver src/lib/onStreetSmsService.js.
--
-- 2) Columnas para conservar la respuesta real del proveedor: idmensaje
--    (obligatorio para poder consultar smsstatus más tarde), estado y
--    descripción crudos, y las dos fechas que distinguen "el proveedor
--    aceptó el envío" (accepted_at) de "el SMS fue entregado al teléfono"
--    (delivered_at, solo se completa cuando smsstatus confirma DELIVRD).
--    Nunca deben confundirse entre sí.
alter table public.on_street_pilot_notifications
  drop constraint if exists on_street_pilot_notifications_status_check,
  add constraint on_street_pilot_notifications_status_check
    check (status in ('PENDING','PROCESSING','SENT','FAILED','CANCELLED'));

alter table public.on_street_pilot_notifications
  add column if not exists provider text null
    check (provider is null or provider in ('SIMULATED','SENTRALAND')),
  add column if not exists provider_message_id text null,
  add column if not exists provider_status text null,
  add column if not exists provider_description text null,
  add column if not exists accepted_at timestamptz null,
  add column if not exists delivered_at timestamptz null;

-- Índice para el job de consulta de DLR: avisos ya enviados (aceptados por
-- el proveedor) a los que aún no se les confirma entrega.
create index if not exists on_street_pilot_notifications_delivery_pending_idx
  on public.on_street_pilot_notifications(status, delivered_at)
  where status = 'SENT' and delivered_at is null;
