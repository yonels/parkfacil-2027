-- Off Street — Fase 6: captura fotográfica de patente (configurable) +
-- impresión en ticket.
--
-- Dos piezas nuevas, siguiendo patrones ya existentes en el repo:
--
-- 1) `parking_offstreet_settings`: una fila por estacionamiento con la
--    configuración de esta feature. Sigue exactamente el mismo patrón RLS
--    que el resto de tablas "hijas de parking" (parking_rates,
--    parking_levels, etc. — ver 20260806120000_definitive_tenant_rls.sql):
--    lectura vía pf_can_access_parking(parking_id), escritura vía
--    pf_can_manage_parking(parking_id). No se agrega a la migración
--    original (que es un bloque cerrado ya aplicado) — se declara aquí con
--    el mismo criterio para la tabla nueva.
--
-- 2) `parking_stay_evidence` + bucket privado `off-street-plate-photos`:
--    evidencia fotográfica operacional. Mismo patrón que
--    on_street_inspection_evidence (20260828150000): bucket privado, sin
--    policies para anon/authenticated (revoke all + grant solo a
--    service_role) — toda lectura/escritura pasa por rutas server-side que
--    ya validan sesión/rol/alcance (authorizeOperationRequest /
--    requireOperationalParking) antes de tocar el bucket o la tabla. Esto
--    es más estricto que el patrón pf_can_access_parking (ningún tenant
--    puede leer directamente ni siquiera su propia evidencia sin pasar por
--    la ruta autorizada), acorde al carácter sensible de la fotografía.

-- ------------------------------------------------------------------
-- 1) Configuración por estacionamiento
-- ------------------------------------------------------------------
create table if not exists public.parking_offstreet_settings (
  parking_id uuid primary key references public.parkings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  plate_photo_mode text not null default 'DISABLED' check (plate_photo_mode in ('DISABLED', 'OPTIONAL', 'REQUIRED')),
  print_plate_photo_on_ticket boolean not null default false,
  -- Retención de evidencia (§11 del encargo): el valor se guarda desde ya
  -- para que la UI/admin pueda declararlo, aunque la eliminación automática
  -- por antigüedad es una tarea separada (cron/job), fuera de esta fase.
  evidence_retention_days integer check (evidence_retention_days is null or evidence_retention_days in (30, 60, 90)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists parking_offstreet_settings_company_idx on public.parking_offstreet_settings(company_id);

alter table public.parking_offstreet_settings enable row level security;
alter table public.parking_offstreet_settings force row level security;
revoke all on public.parking_offstreet_settings from anon, authenticated;
grant select, insert, update on public.parking_offstreet_settings to service_role;
grant select on public.parking_offstreet_settings to authenticated;
grant insert, update on public.parking_offstreet_settings to authenticated;

drop policy if exists parking_offstreet_settings_read on public.parking_offstreet_settings;
drop policy if exists parking_offstreet_settings_write on public.parking_offstreet_settings;
create policy parking_offstreet_settings_read on public.parking_offstreet_settings
  for select to authenticated using (public.pf_can_access_parking(parking_id));
create policy parking_offstreet_settings_write on public.parking_offstreet_settings
  for all to authenticated using (public.pf_can_manage_parking(parking_id)) with check (public.pf_can_manage_parking(parking_id));

-- ------------------------------------------------------------------
-- 2) Evidencia fotográfica (bucket privado + metadata)
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('off-street-plate-photos', 'off-street-plate-photos', false, 716800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- 716800 bytes = 700 KiB: por encima del objetivo de compresión (100-300 KB,
-- §5 del encargo) con margen; el límite real de negocio se valida además en
-- la ruta de subida (platePhotoEvidenceRepository.js), igual criterio que el
-- resto del proyecto (defensa en profundidad).

create table if not exists public.parking_stay_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parking_id uuid not null references public.parkings(id) on delete cascade,
  parking_stay_id uuid not null references public.parking_stays(id) on delete cascade,
  type text not null check (type in ('PLATE_ENTRY_PHOTO')),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 716800),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists parking_stay_evidence_stay_idx on public.parking_stay_evidence(parking_stay_id);
create index if not exists parking_stay_evidence_parking_idx on public.parking_stay_evidence(parking_id);

alter table public.parking_stay_evidence enable row level security;
alter table public.parking_stay_evidence force row level security;
revoke all on public.parking_stay_evidence from anon, authenticated;
grant select, insert, delete on public.parking_stay_evidence to service_role;
