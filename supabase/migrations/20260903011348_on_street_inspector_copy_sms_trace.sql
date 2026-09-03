-- Trazabilidad de la copia SMS al propio Inspector (2026-09-03,
-- "decouple printing + sms copy" -- cierre de persistencia V1).
--
-- feat(inspector): decouple printing and add sms copy (commit d01512d) ya
-- envía esta copia (sendInspectorCopySmsIfNeeded en
-- inspectorInspectionService.js), pero el resultado solo viajaba ephemeral
-- en la respuesta del POST (inspection.inspectorCopySms) -- nunca quedaba
-- persistido. Esta migración agrega las 3 columnas mínimas para cerrar esa
-- persistencia, con el MISMO nombre exacto pedido y el mismo criterio ya
-- usado por sms_status/sms_sent_at/sms_provider_message_id (arriba, en
-- 20260827200000_on_street_inspections.sql) para el SMS al conductor --
-- pero deliberadamente SIN el "not null default"/check constraint que
-- tienen esas columnas: a diferencia del SMS al conductor (que SIEMPRE
-- tiene un valor determinado -- NOT_REQUIRED/PENDING/... desde el momento
-- de la propia inserción vía register_on_street_inspection), la copia al
-- inspector es un paso posterior y opcional que puede no aplicar en
-- absoluto (fiscalización NO_SESSION/OTHER, o vehicle_still_present=false)
-- -- para esos casos, la ausencia total de valor (NULL) es la
-- representación más simple y correcta de "no aplica", sin necesidad de un
-- quinto estado explícito. Nullable, sin índice, sin default: no hay
-- necesidad real de ninguno de los tres (nunca se filtra/ordena por estas
-- columnas todavía).
alter table public.on_street_inspections
  add column if not exists inspector_copy_sms_status text,
  add column if not exists inspector_copy_sms_sent_at timestamptz,
  add column if not exists inspector_copy_sms_provider_message_id text;
