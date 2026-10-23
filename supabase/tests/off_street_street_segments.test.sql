-- SOL-2026-10-23-001, etapa 1. Se ejecuta en una transacción y se deshace (ROLLBACK).
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/off_street_street_segments.test.sql
begin;
create temp table resultado(caso text, ok boolean, detalle text) on commit drop;

do $$
declare
  v_parking uuid; v_sector uuid; v_street uuid; v_seg uuid; v_seg2 uuid; v_err text;
  procedure_ok boolean;
begin
  select id into v_parking from public.parkings where type = 'OFF_STREET' order by created_at limit 1;
  insert into public.parking_sectors(parking_id, code, name, type, status, capacity, occupied, level, zone, structure_kind)
    values (v_parking, 'TZC', 'Zona Centro', 'OFF_STREET', 'ACTIVE', 10, 0, 'CALLE', 'Zona Centro', 'STREET') returning id into v_sector;
  insert into public.parking_streets(parking_id, sector_id, name, status, capacity)
    values (v_parking, v_sector, 'Agustinas', 'ACTIVE', 10) returning id into v_street;
  insert into public.parking_street_segments(parking_id, area_id, street_id, code, name, from_number, to_number, capacity)
    values (v_parking, v_sector, v_street, 'T1', 'Agustinas 100-200', 100, 200, 2) returning id into v_seg;

  -- 1. ingreso en tramo: completa calle y zona desde el tramo
  insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name, segment_id, street_number)
    values ('TST-SEG-1', v_parking, 'AAAA-11', 'Prueba', v_seg, 150);
  insert into resultado select 'ingreso en tramo completa calle y zona',
    (select street_id = v_street and sector_id = v_sector from public.parking_stays where code = 'TST-SEG-1'), null;

  -- 2. segundo ingreso (cupo 2) y fuera de asignación marcado
  insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name, segment_id, out_of_assignment)
    values ('TST-SEG-2', v_parking, 'BBBB-22', 'Prueba', v_seg, true);
  insert into resultado values ('segundo ingreso con cupo y fuera de rango marcado', public.off_street_segment_occupancy(v_seg) = 2, null);

  -- 3. tercer ingreso: tramo lleno
  begin
    insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name, segment_id) values ('TST-SEG-3', v_parking, 'CCCC-33', 'Prueba', v_seg);
    insert into resultado values ('tramo lleno bloquea', false, 'no bloqueó');
  exception when others then insert into resultado values ('tramo lleno bloquea', sqlerrm = 'STREET_SEGMENT_FULL', sqlerrm); end;

  -- 4. al salir uno (PAID) se libera cupo
  update public.parking_stays set status = 'CANCELLED' where code = 'TST-SEG-1';
  insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name, segment_id) values ('TST-SEG-4', v_parking, 'DDDD-44', 'Prueba', v_seg);
  insert into resultado values ('salida libera cupo', public.off_street_segment_occupancy(v_seg) = 2, null);

  -- 5. reabrir una estadía cancelada con el tramo lleno: bloquea
  begin
    update public.parking_stays set status = 'OPEN' where code = 'TST-SEG-1';
    insert into resultado values ('reabrir con tramo lleno bloquea', false, 'no bloqueó');
  exception when others then insert into resultado values ('reabrir con tramo lleno bloquea', sqlerrm = 'STREET_SEGMENT_FULL', sqlerrm); end;

  -- 6. número fuera del tramo
  insert into public.parking_street_segments(parking_id, area_id, street_id, code, name, from_number, to_number, capacity)
    values (v_parking, v_sector, v_street, 'T2', 'Agustinas 201-300', 201, 300, 5) returning id into v_seg2;
  begin
    insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name, segment_id, street_number) values ('TST-SEG-5', v_parking, 'EEEE-55', 'Prueba', v_seg2, 150);
    insert into resultado values ('número fuera del tramo', false, 'aceptó');
  exception when others then insert into resultado values ('número fuera del tramo', sqlerrm = 'STAY_STREET_NUMBER_OUT_OF_SEGMENT', sqlerrm); end;

  -- 7. calle sin tramo
  begin
    insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name, street_id) values ('TST-SEG-6', v_parking, 'FFFF-66', 'Prueba', v_street);
    insert into resultado values ('calle sin tramo', false, 'aceptó');
  exception when others then insert into resultado values ('calle sin tramo', sqlerrm = 'STAY_STREET_SEGMENT_REQUIRED', sqlerrm); end;

  -- 8. tramos solapados en la misma calle (validación existente)
  begin
    insert into public.parking_street_segments(parking_id, area_id, street_id, code, name, from_number, to_number, capacity) values (v_parking, v_sector, v_street, 'T3', 'Solapado', 150, 250, 3);
    insert into resultado values ('tramos solapados', false, 'aceptó');
  exception when others then insert into resultado values ('tramos solapados', sqlerrm = 'STREET_SEGMENT_RANGE_OVERLAP', sqlerrm); end;

  -- 9. estadía de recinto (sin tramo) no cambia
  insert into public.parking_stays(code, parking_id, license_plate, entry_operator_name) values ('TST-SEG-7', v_parking, 'GGGG-77', 'Prueba');
  insert into resultado select 'estadía de recinto sin cambios', (select segment_id is null and sector_id is null and not out_of_assignment from public.parking_stays where code = 'TST-SEG-7'), null;

  -- 10. asignación de operador a un rango del tramo (tabla existente)
  insert into public.operator_assignments(operator_id, parking_id, sector_id, street_id, number_from, number_to, max_vehicles, valid_from, start_time, end_time, days_of_week, status)
    values ('op-prueba', v_parking, v_sector, v_street, 100, 200, 2, current_date, '08:00', '20:00', array[1,2,3,4,5], 'ACTIVE');
  insert into resultado values ('asignación de operador con horario y días', true, null);
end $$;

select caso, case when ok then 'OK' else 'FALLA' end, coalesce(detalle, '') from resultado;
select count(*) filter (where ok) || '/' || count(*) as total from resultado;
rollback;
