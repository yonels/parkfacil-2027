-- Reporte SMS Inspector: trazabilidad de entrega (DLR) por fiscalización
-- (2026-09-03). Aditiva, nullable, sin default, sin índice, sin tocar RLS
-- ni grants -- mismo criterio ya usado por la migración anterior
-- (20260903011348_on_street_inspector_copy_sms_trace.sql) para las columnas
-- de copia inspector.
--
-- Deliberadamente SEPARADA de sms_status/sms_sent_at/sms_provider_message_id
-- (que siguen significando exactamente lo mismo que antes: "el proveedor
-- aceptó el envío", nunca "se entregó" -- ver sentralandCore.mjs) y de
-- inspector_copy_sms_status (una columna, un dato). El estado de entrega
-- real (DLR) es un dato que se conoce DESPUÉS, en un momento distinto,
-- mediante una consulta explícita al proveedor (checkStatus) -- nunca se
-- escribe automáticamente al enviar, así que necesita sus 3 columnas
-- propias: null hasta la primera consulta DLR, luego se actualizan cada vez
-- que se vuelve a consultar (nunca se sobreescribe sms_status/sms_sent_at/
-- sms_provider_message_id, que documentan el ENVÍO, no la entrega).
alter table public.on_street_inspections
  add column if not exists sms_delivery_status text,
  add column if not exists sms_delivery_checked_at timestamptz,
  add column if not exists sms_delivery_description text;
