-- Proyectos On Street: asociación EXPLÍCITA de tarifa por Ubicación QR.
--
-- Hoy la tarifa de una Ubicación QR se resuelve dinámicamente en dos lugares distintos
-- y de forma inconsistente:
--   1) onStreetAdminRepository.js (activeRatesByParking/resolveRate) — solo para mostrar
--      "tarifa vigente" en la ficha/listado admin, sí considera area_id.
--   2) onStreetPilotRepository.js — usado en la creación REAL de sesiones públicas
--      (cobro efectivo), NO considera area_id: toma la tarifa ACTIVE más reciente del
--      parking (order by valid_from desc limit 1). Con múltiples tarifas ACTIVE
--      simultáneas (ver migración anterior) esto sería un fallback silencioso — exactamente
--      lo que el rediseño de Proyectos On Street prohíbe.
--
-- Columna aditiva, nullable, sin backfill: las Ubicaciones QR existentes quedan con
-- rate_id=null y conservan el comportamiento dinámico anterior (fallback documentado,
-- no silencioso: se mantiene únicamente porque son datos históricos previos a esta
-- funcionalidad). Las Ubicaciones QR nuevas creadas desde un Proyecto exigen elegir
-- una tarifa explícita de las disponibles del parking (ver UI de Proyectos On Street).
--
-- No destructiva, aditiva, idempotente, solo LOCAL.

alter table public.on_street_qr_locations
  add column if not exists rate_id uuid null references public.parking_rates(id) on delete restrict;

comment on column public.on_street_qr_locations.rate_id is
  'Tarifa explícitamente asignada a esta ubicación (Proyectos On Street). NULL en '
  'ubicaciones creadas antes de esta funcionalidad: para esas se conserva la resolución '
  'dinámica histórica (tarifa ACTIVE más reciente del parking) como fallback documentado, '
  'nunca silencioso.';

create index if not exists on_street_qr_locations_rate_id_idx on public.on_street_qr_locations(rate_id);
