-- Off Street — Ajuste final de evidencia de patente configurable por
-- proyecto: GPS configurable (§18/§19 del encargo) + metadatos de
-- trazabilidad de la evidencia (§16, captured_at/GPS/dispositivo/hash).
--
-- Puramente aditiva sobre lo ya creado en 20260905130000_off_street_plate_photo.sql
-- -- no se borra ni se recalcula evidencia antigua (§27): toda columna
-- nueva admite NULL para las filas históricas, que quedan exactamente como
-- estaban salvo el backfill explícitamente seguro descrito abajo.

-- ------------------------------------------------------------------
-- 1) GPS configurable en la configuración por estacionamiento
-- ------------------------------------------------------------------
-- Reutiliza el MISMO enum DISABLED/OPTIONAL/REQUIRED que plate_photo_mode
-- (ver GPS_MODES en offStreetPlatePhoto.mjs -- alias intencional, no un
-- segundo sistema paralelo).
alter table public.parking_offstreet_settings
  add column if not exists gps_mode text not null default 'DISABLED'
    check (gps_mode in ('DISABLED', 'OPTIONAL', 'REQUIRED'));

-- ------------------------------------------------------------------
-- 2) Metadatos de trazabilidad de cada fotografía real
-- ------------------------------------------------------------------
-- operator_id / ticket-estadía ya existían (created_by / parking_stay_id) --
-- no se duplican. El nombre del operador tampoco se duplica aquí: ya vive
-- denormalizado en parking_stays.entry_operator_name (relación 1:1 real
-- entre esta evidencia y el ENTRY de esa misma estadía).
alter table public.parking_stay_evidence
  add column if not exists captured_at timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists gps_accuracy_m double precision,
  add column if not exists device_info jsonb,
  add column if not exists evidence_type text
    check (evidence_type is null or evidence_type in ('PHOTO_CAPTURED', 'PLATE_RENDERED')),
  add column if not exists sha256 text;

-- Backfill seguro, sin inventar nada (§27):
-- - evidence_type: toda fila existente es, por construcción, una fotografía
--   real (PLATE_RENDERED no existía como concepto hasta esta migración) --
--   esto es una inferencia correcta, no un dato inventado.
-- - captured_at: no existe otro dato para reconstruir el instante exacto de
--   captura de una fila histórica; created_at (fecha de inserción de la
--   metadata, ya tomada con clock_timestamp()) es la mejor aproximación
--   disponible y honesta -- nunca se inventa GPS/hash/dispositivo, esos
--   quedan NULL para la evidencia histórica.
update public.parking_stay_evidence
set evidence_type = 'PHOTO_CAPTURED'
where evidence_type is null;

update public.parking_stay_evidence
set captured_at = created_at
where captured_at is null;

-- evidence_type sí se exige de aquí en adelante (con default seguro); las
-- demás columnas nuevas se dejan nullable a propósito -- código de
-- aplicación las completa siempre que corresponda, pero la base no debe
-- bloquear un futuro caso legítimo sin alguno de estos datos (p. ej. GPS
-- DISABLED nunca los solicita).
alter table public.parking_stay_evidence
  alter column evidence_type set not null,
  alter column evidence_type set default 'PHOTO_CAPTURED';
