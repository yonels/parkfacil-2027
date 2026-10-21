-- Cierra el gap de aislamiento detectado en auditoría RLS:
-- public.parking_street_segment_zones se creó en 20260731173000_on_street_
-- spaces_and_zones.sql, ANTES de que 20260806120000_definitive_tenant_rls.sql
-- habilitara RLS para toda la familia de tablas On Street (parking_sectors,
-- parking_streets, parking_street_segments, parking_rates, etc. -- ver el
-- `foreach` de esa migración). Quedó fuera de ese arreglo por ser posterior
-- a esa foto del esquema, no por decisión deliberada: es la única tabla de
-- esa familia sin RLS.
--
-- Ownership: parking_street_segment_zones.segment_id -> parking_street_segments.id
-- -> parking_street_segments.parking_id -> parkings.company_id. No tiene
-- columna parking_id propia (a diferencia de parking_street_segments), así
-- que reutiliza el mismo patrón de join-a-través-del-padre ya usado por
-- parking_rate_blocks (que tampoco tiene parking_id propia, solo rate_id).
--
-- Confirmado contra el esquema real antes de escribir esto (no supuesto):
-- columnas de parking_street_segment_zones (segment_id uuid NOT NULL, resto
-- sin relevancia para la política); firmas de
-- pf_can_access_parking(p_parking_id uuid) y
-- pf_can_manage_parking(p_parking_id uuid); nombres de policy ya en uso
-- (parking_street_segments_read/write, rate_blocks_read/write) para seguir
-- la misma convención "<tabla>_read"/"<tabla>_write"; ninguna policy
-- preexistente sobre esta tabla (sin riesgo de duplicado); RLS
-- efectivamente deshabilitado (relrowsecurity=false) antes de esta
-- migración.
--
-- No se modifican grants: anon/authenticated ya carecen de SELECT/INSERT/
-- DELETE sobre esta tabla (privilegio por defecto del esquema, igual que en
-- parking_street_segments); solo tienen UPDATE por defecto, lo cual permitía
-- un UPDATE ciego a una fila de otra empresa conociendo su id -- exactamente
-- el gap que esta migración cierra. El código de la aplicación no se ve
-- afectado: no hay ninguna referencia a esta tabla en src/, y todo acceso
-- server-side existente usa el cliente admin (service_role), que RLS no
-- restringe.
alter table public.parking_street_segment_zones enable row level security;

create policy parking_street_segment_zones_read
on public.parking_street_segment_zones
for select
to authenticated
using (
  exists (
    select 1
    from public.parking_street_segments s
    where s.id = segment_id
      and public.pf_can_access_parking(s.parking_id)
  )
);

create policy parking_street_segment_zones_write
on public.parking_street_segment_zones
for all
to authenticated
using (
  exists (
    select 1
    from public.parking_street_segments s
    where s.id = segment_id
      and public.pf_can_manage_parking(s.parking_id)
  )
)
with check (
  exists (
    select 1
    from public.parking_street_segments s
    where s.id = segment_id
      and public.pf_can_manage_parking(s.parking_id)
  )
);
