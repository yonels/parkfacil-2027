-- Corrección UX/funcional "Proyectos On Street": el Tramo pasa a mostrarse
-- como letra (A, B, C...) derivada de sort_order (ver parkingSegments.mjs:
-- sortOrderToLetter/letterToSortOrder). La letra debe ser única POR CALLE
-- (street_id) -- nunca dos "Tramo A" en la misma calle -- pero la MISMA letra
-- puede repetirse en calles distintas.
--
-- Igual que en 20260829100000_on_street_multi_active_rate.sql: la regla
-- nueva se agrega SOLO para parkings ON_STREET (join a parkings.type dentro
-- del trigger). Off Street sigue usando "Orden" como campo numérico libre,
-- editable, sin esta restricción -- StreetSegmentsManager/SegmentForm.js
-- (compartidos con Off Street vía StructureRoute.js) no cambian de
-- comportamiento. Esto es intencional y no una restricción a nivel de tabla:
-- una constraint plana `unique(street_id, sort_order)` habría afectado
-- también a Off Street, que hoy permite valores de "Orden" repetidos.

create or replace function public.validate_parking_street_segment()
returns trigger language plpgsql as $$
declare
  v_parking_type text;
begin
  if exists (
    select 1 from public.parking_street_segments other
    where other.street_id = new.street_id
      and other.id <> new.id
      and other.status <> 'INACTIVE'
      and new.status <> 'INACTIVE'
      and (other.street_side = 'BOTH' or new.street_side = 'BOTH' or other.street_side = new.street_side)
      and int4range(other.from_number, other.to_number, '[]') && int4range(new.from_number, new.to_number, '[]')
  ) then
    raise exception 'STREET_SEGMENT_RANGE_OVERLAP' using errcode='23514';
  end if;
  if not exists (
    select 1 from public.parking_streets street
    where street.id=new.street_id and street.parking_id=new.parking_id and street.sector_id=new.area_id
  ) then
    raise exception 'STREET_SEGMENT_PARENT_MISMATCH' using errcode='23514';
  end if;

  select p.type into v_parking_type from public.parkings p where p.id=new.parking_id;
  if v_parking_type = 'ON_STREET' and exists (
    select 1 from public.parking_street_segments other
    where other.street_id = new.street_id
      and other.id <> new.id
      and other.sort_order = new.sort_order
  ) then
    raise exception 'STREET_SEGMENT_SORT_ORDER_DUPLICATE' using errcode='23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
