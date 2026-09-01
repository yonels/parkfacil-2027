-- Administración Root del catálogo de códigos de Estacionamiento/Proyecto
-- (continuación 2026-08-29): agrega el estado INACTIVE ya previsto en la
-- definición aprobada del turno anterior ("DISPONIBLE/ASIGNADO/INACTIVO").
-- Solo se permite inactivar un código DISPONIBLE (nunca uno ASIGNADO, para
-- no romper la relación histórica) -- por eso INACTIVE exige exactamente
-- las mismas condiciones que AVAILABLE (parking_id/assigned_at nulos): un
-- código inactivo nunca estuvo -- ni sigue -- ligado a un parking.
alter table public.parking_code_catalog drop constraint if exists parking_code_catalog_status_check;
alter table public.parking_code_catalog add constraint parking_code_catalog_status_check
  check (status in ('AVAILABLE','ASSIGNED','INACTIVE'));

alter table public.parking_code_catalog drop constraint if exists parking_code_catalog_check;
alter table public.parking_code_catalog add constraint parking_code_catalog_check
  check (
    (status = 'ASSIGNED' and parking_id is not null)
    or (status in ('AVAILABLE','INACTIVE') and parking_id is null and assigned_at is null)
  );
