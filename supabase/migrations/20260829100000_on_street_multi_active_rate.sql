-- Proyectos On Street: permite múltiples tarifas ACTIVE simultáneas para un mismo
-- estacionamiento ON_STREET (p.ej. Normal + Comercial + Nocturna vigentes a la vez).
--
-- Motivo: en Off Street la tarifa "vigente" se resuelve dinámicamente en tiempo real
-- (selectActiveRate, ver docs/MOTOR-TARIFARIO-LEGAL.md) para un vehículo anónimo que
-- sale — por eso NUNCA puede haber ambigüedad y el trigger original impide dos ACTIVE
-- superpuestas para el mismo (parking_id, area_id). En On Street cada Ubicación QR
-- pasa a asociarse explícitamente a una tarifa concreta (on_street_qr_locations.rate_id,
-- ver siguiente migración) — no hay resolución dinámica ni ambigüedad posible — por lo
-- que la restricción de "una sola ACTIVE" deja de ser necesaria para parkings ON_STREET.
--
-- No se toca el comportamiento para Off Street: la función solo agrega una excepción
-- explícita cuando el parking de la tarifa es ON_STREET. No se elimina ni relaja
-- ninguna otra validación (modalidad exclusiva, tramo inicial, valor nocturno, etc.).

create or replace function public.validate_parking_rate()
returns trigger language plpgsql as $$
declare
  v_parking_type text;
begin
  if new.status='ACTIVE' and new.billing_mode='EXPIRED_BLOCKS' and not exists (
    select 1 from public.parking_rate_blocks block where block.rate_id=new.id and block.sequence=1
  ) then
    raise exception 'RATE_FIRST_BLOCK_REQUIRED' using errcode='23514';
  end if;

  select p.type into v_parking_type from public.parkings p where p.id=new.parking_id;

  if new.status='ACTIVE' and coalesce(v_parking_type,'') <> 'ON_STREET' and exists (
    select 1 from public.parking_rates other
    where other.parking_id=new.parking_id
      and coalesce(other.area_id,'00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(new.area_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and other.id<>new.id and other.status='ACTIVE'
      and tstzrange(other.valid_from,coalesce(other.valid_until,'infinity'::timestamptz),'[)')
        && tstzrange(new.valid_from,coalesce(new.valid_until,'infinity'::timestamptz),'[)')
  ) then
    raise exception 'ACTIVE_RATE_VALIDITY_OVERLAP' using errcode='23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
