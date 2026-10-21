-- Catálogo de códigos de Estacionamiento/Proyecto (corrección funcional
-- "Código de estacionamiento desde catálogo/dropdown", 2026-08-29).
--
-- Definición aprobada por el usuario:
--   - Los códigos los genera/administra ParkFacil internamente (Root).
--   - Catálogo GLOBAL, no por Empresa (coincide con parkings.code, que ya
--     es UNIQUE global -- no se cambia esa semántica).
--   - Al crear un Estacionamiento se elige un código AVAILABLE del
--     catálogo, nunca se escribe libremente.
--   - Al asignarse pasa a ASSIGNED y queda ligado a parking_id.
--   - Los códigos ya existentes en parkings.code se preservan íntegros --
--     se registran en el catálogo como ASSIGNED, sin regenerarlos.
--
-- No reemplaza ni relaja parkings.code (sigue existiendo, sigue siendo la
-- fuente de verdad para el resto del sistema -- rutas, FKs, etc.). Este
-- catálogo es la capa de "qué códigos existen y cuáles están libres".
create table if not exists public.parking_code_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ASSIGNED')),
  parking_id uuid null references public.parkings(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_at timestamptz null,
  -- Consistencia: ASSIGNED siempre trae parking_id: AVAILABLE nunca lo trae.
  check (
    (status = 'ASSIGNED' and parking_id is not null)
    or (status = 'AVAILABLE' and parking_id is null and assigned_at is null)
  )
);

-- Un parking_id no puede aparecer en más de una fila del catálogo (además
-- de la unicidad de code, que ya por sí sola evita que dos estacionamientos
-- compartan código).
create unique index if not exists parking_code_catalog_parking_id_unique
  on public.parking_code_catalog(parking_id) where parking_id is not null;

create index if not exists parking_code_catalog_status_idx on public.parking_code_catalog(status);

create or replace function public.touch_parking_code_catalog()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists parking_code_catalog_touch on public.parking_code_catalog;
create trigger parking_code_catalog_touch before update on public.parking_code_catalog
for each row execute function public.touch_parking_code_catalog();

-- Carga de históricos: cada código ya usado en parkings.code se registra
-- ASSIGNED, ligado a su parking real, preservando el valor EXACTO (sin
-- normalizar/regenerar). Idempotente vía "on conflict do nothing" -- si esta
-- migración se re-ejecutara o ya existieran filas, no duplica ni pisa nada.
insert into public.parking_code_catalog (code, status, parking_id, assigned_at, created_at)
select p.code, 'ASSIGNED', p.id, p.created_at, p.created_at
from public.parkings p
on conflict (code) do nothing;
