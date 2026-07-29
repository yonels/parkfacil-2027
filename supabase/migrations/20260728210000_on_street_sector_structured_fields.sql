-- Las áreas On Street usan códigos alfabéticos como NOR, SUR o CENTRO.
-- La calle y el rango numérico pertenecen a parking_streets y
-- parking_street_segments respectivamente.
alter table public.parking_sectors
  drop constraint if exists parking_sectors_code_letter_check;

alter table public.parking_sectors
  drop constraint if exists parking_sectors_code_format_check;

alter table public.parking_sectors
  drop constraint if exists parking_sectors_check1;

alter table public.parking_sectors
  add constraint parking_sectors_area_code_check
  check (code ~ '^[A-Z]{1,10}$') not valid;

-- Convierte el registro heredado NOR-80, que mezclaba área, calle y tramo,
-- en la jerarquía acordada: NOR > Calle 80 > NOR-80-100-200.
do $$
declare
  legacy_area record;
  target_street_id uuid;
  target_segment_id uuid;
begin
  for legacy_area in
    select id, parking_id, status, coalesce(occupied, 0) as occupied
    from public.parking_sectors
    where code = 'NOR-80'
  loop
    -- Solo se transforma cuando NOR está libre en el mismo estacionamiento.
    if not exists (
      select 1 from public.parking_sectors
      where parking_id = legacy_area.parking_id
        and code = 'NOR'
        and id <> legacy_area.id
    ) then
      update public.parking_sectors
      set code = 'NOR',
          name = 'Norte',
          description = 'Área operacional norte',
          type = null,
          capacity = null,
          street = null,
          from_reference = null,
          to_reference = null,
          district = null,
          segment_description = null,
          updated_at = now()
      where id = legacy_area.id;

      select id into target_street_id
      from public.parking_streets
      where sector_id = legacy_area.id and name = 'Calle 80';

      if target_street_id is null then
        insert into public.parking_streets (
          parking_id, sector_id, name, district, status, capacity, occupied, notes
        ) values (
          legacy_area.parking_id, legacy_area.id, 'Calle 80', 'Norte',
          legacy_area.status, 36, least(legacy_area.occupied, 36), ''
        )
        returning id into target_street_id;
      else
        update public.parking_streets
        set district = 'Norte',
            capacity = 36,
            occupied = least(occupied, 36),
            updated_at = now()
        where id = target_street_id;
      end if;

      -- Reutiliza el tramo inicial creado por migraciones anteriores para
      -- evitar duplicar capacidad o provocar solapamientos.
      select id into target_segment_id
      from public.parking_street_segments
      where street_id = target_street_id
      order by sort_order, created_at
      limit 1;

      if target_segment_id is null then
        insert into public.parking_street_segments (
          parking_id, area_id, street_id, code, name, from_number, to_number,
          street_side, capacity, occupied_spaces, status, sort_order, notes
        ) values (
          legacy_area.parking_id, legacy_area.id, target_street_id,
          'NOR-80-100-200', 'Tramo 100–200', 100, 200, 'BOTH', 36,
          least(legacy_area.occupied, 36), legacy_area.status, 1, ''
        );
      else
        update public.parking_street_segments
        set code = 'NOR-80-100-200',
            name = 'Tramo 100–200',
            from_number = 100,
            to_number = 200,
            street_side = 'BOTH',
            capacity = 36,
            occupied_spaces = least(occupied_spaces, 36),
            status = legacy_area.status,
            sort_order = 1,
            updated_at = now()
        where id = target_segment_id;
      end if;
    end if;
  end loop;
end;
$$;
