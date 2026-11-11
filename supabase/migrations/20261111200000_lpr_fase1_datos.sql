-- ParkFacil Off Street -- Integración de cámaras LPR -- Fase 1: modelo de datos
-- (SOL-2026-11-01-001, sección 6 del proyecto PROYECTO-INTEGRACION-LPR-OFF-STREET.md)
--
-- Solo AGREGA objetos. No modifica datos existentes. Prefijo lpr_ en todas las
-- tablas nuevas (el proyecto las llamaba access_points, devices, ...; ya
-- existe billing_devices y conviene agrupar el módulo).
--
--   1. lpr_access_points      accesos (entrada/salida) de un estacionamiento
--   2. lpr_gateways           equipos locales (clave de acceso en hash)
--   3. lpr_devices            componentes: cámara, barrera, sensor, equipo local
--   4. lpr_events             lecturas de patente y decisión tomada
--   5. lpr_barrier_commands   órdenes de barrera (y auditoría)
--   6. lpr_device_status_log  historial de estados verde/rojo/gris
--   7. parking_stays: gate_exit_at (salida física) y origen de la patente
--
-- RLS activado sin políticas: solo service_role (las rutas validan antes).
-- Reversión: drop de las tablas lpr_* (en orden inverso) y de las columnas
-- gate_exit_at, entry_plate_source y exit_plate_source de parking_stays.

begin;

------------------------------------------------------------------------
-- 1. Accesos
------------------------------------------------------------------------
create table if not exists public.lpr_access_points (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  direction text not null check (direction in ('IN', 'OUT')),
  attended boolean not null default true,
  exit_grace_minutes integer not null default 15 check (exit_grace_minutes between 0 and 1440),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parking_id, name)
);

------------------------------------------------------------------------
-- 2. Equipos locales
------------------------------------------------------------------------
create table if not exists public.lpr_gateways (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- sha256 (hex) de la clave; la clave en claro solo se muestra al crearla.
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  software_version text,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------------
-- 3. Componentes
------------------------------------------------------------------------
create table if not exists public.lpr_devices (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  parking_id uuid not null references public.parkings(id) on delete cascade,
  access_point_id uuid references public.lpr_access_points(id) on delete set null,
  gateway_id uuid references public.lpr_gateways(id) on delete set null,
  type text not null check (type in ('LPR_CAMERA', 'BARRIER', 'SENSOR', 'GATEWAY')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  enabled boolean not null default true,
  health text not null default 'OK' check (health in ('OK', 'FAIL', 'DISABLED')),
  last_seen_at timestamptz,
  -- relé, tiempo de pulso (ms), umbral de confianza (min_confidence), etc.
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Desactivado siempre se ve gris.
  check (enabled or health = 'DISABLED')
);

create index if not exists lpr_devices_parking_idx on public.lpr_devices (parking_id, type);
create index if not exists lpr_devices_access_point_idx on public.lpr_devices (access_point_id);

------------------------------------------------------------------------
-- 4. Lecturas
------------------------------------------------------------------------
create table if not exists public.lpr_events (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete cascade,
  device_id uuid not null references public.lpr_devices(id) on delete restrict,
  access_point_id uuid references public.lpr_access_points(id) on delete set null,
  gateway_id uuid references public.lpr_gateways(id) on delete set null,
  -- Identificador que manda el equipo local para no registrar dos veces la
  -- misma lectura si la reenvía (cola sin conexión).
  external_id text,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  plate_raw text,
  plate_normalized text check (plate_normalized is null or plate_normalized ~ '^[A-Z0-9]{4}-[A-Z0-9]{2}$'),
  confidence integer check (confidence is null or confidence between 0 and 100),
  source text not null default 'CAMERA' check (source in ('CAMERA', 'MANUAL')),
  stay_id uuid references public.parking_stays(id) on delete set null,
  decision text not null check (decision in (
    'OPEN_PAID',        -- salida pagada dentro del plazo: abrir
    'ENTRY_NEW',        -- entrada sin estadía abierta: corresponde abrir estadía
    'ENTRY_DUPLICATE',  -- entrada con estadía ya abierta: avisar, no duplicar
    'EXIT_NOT_PAID',    -- salida con estadía abierta sin pagar
    'EXIT_GRACE_EXPIRED', -- salida pagada fuera del plazo: cobro adicional
    'EXIT_NO_STAY',     -- salida sin estadía: avisar
    'MANUAL_REQUIRED',  -- lectura fallida o dudosa: ingreso manual (R13)
    'DEVICE_DISABLED'   -- componente o acceso desactivado
  )),
  decision_detail text,
  photo_paths text[] not null default '{}',
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists lpr_events_external_idx
  on public.lpr_events (device_id, external_id) where external_id is not null;
create index if not exists lpr_events_parking_time_idx on public.lpr_events (parking_id, captured_at desc);
create index if not exists lpr_events_plate_idx on public.lpr_events (plate_normalized, captured_at desc);

------------------------------------------------------------------------
-- 5. Órdenes de barrera
------------------------------------------------------------------------
create table if not exists public.lpr_barrier_commands (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete cascade,
  device_id uuid not null references public.lpr_devices(id) on delete restrict,
  action text not null check (action in ('OPEN', 'HOLD_OPEN', 'CLOSE')),
  origin text not null check (origin in ('POS', 'AUTO', 'QR_PAYMENT', 'ADMIN')),
  requested_by uuid,
  requested_by_name text,
  reason text,
  event_id uuid references public.lpr_events(id) on delete set null,
  pulse_ms integer check (pulse_ms is null or pulse_ms between 100 and 60000),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'DONE', 'FAILED', 'EXPIRED')),
  status_detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  executed_at timestamptz,
  -- Toda apertura manual exige motivo (P1).
  check (origin not in ('POS', 'ADMIN') or char_length(btrim(coalesce(reason, ''))) > 0)
);

create index if not exists lpr_barrier_commands_pending_idx
  on public.lpr_barrier_commands (parking_id, created_at) where status = 'PENDING';

------------------------------------------------------------------------
-- 6. Historial de estados
------------------------------------------------------------------------
create table if not exists public.lpr_device_status_log (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.lpr_devices(id) on delete cascade,
  health text not null check (health in ('OK', 'FAIL', 'DISABLED')),
  changed_at timestamptz not null default now(),
  detail text
);

create index if not exists lpr_device_status_log_device_idx on public.lpr_device_status_log (device_id, changed_at desc);

------------------------------------------------------------------------
-- 7. parking_stays: salida física y origen de la patente (P5)
------------------------------------------------------------------------
alter table public.parking_stays
  add column if not exists gate_exit_at timestamptz,
  add column if not exists entry_plate_source text,
  add column if not exists exit_plate_source text;

alter table public.parking_stays drop constraint if exists parking_stays_entry_plate_source_check;
alter table public.parking_stays add constraint parking_stays_entry_plate_source_check
  check (entry_plate_source is null or entry_plate_source in ('CAMERA', 'MANUAL', 'POS'));
alter table public.parking_stays drop constraint if exists parking_stays_exit_plate_source_check;
alter table public.parking_stays add constraint parking_stays_exit_plate_source_check
  check (exit_plate_source is null or exit_plate_source in ('CAMERA', 'MANUAL', 'POS'));

------------------------------------------------------------------------
-- RLS y permisos
------------------------------------------------------------------------
alter table public.lpr_access_points enable row level security;
alter table public.lpr_gateways enable row level security;
alter table public.lpr_devices enable row level security;
alter table public.lpr_events enable row level security;
alter table public.lpr_barrier_commands enable row level security;
alter table public.lpr_device_status_log enable row level security;

revoke all on public.lpr_access_points, public.lpr_gateways, public.lpr_devices, public.lpr_events,
  public.lpr_barrier_commands, public.lpr_device_status_log from anon, authenticated;
grant select, insert, update, delete on public.lpr_access_points, public.lpr_gateways, public.lpr_devices,
  public.lpr_events, public.lpr_barrier_commands, public.lpr_device_status_log to service_role;

commit;
