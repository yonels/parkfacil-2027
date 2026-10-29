-- Ejecutar dentro de BEGIN/ROLLBACK, después de 20261029012245_released_plates_client_model.sql, solo en base local.
-- Requiere un company_admin activo de emp-5q (qa.pl.admin5q@…) y el estacionamiento «QA Pago liberado».
do $$
declare
  admin uuid;
  otro uuid;
  parking uuid;
  a public.released_plate_authorizations%rowtype;
  b public.released_plate_authorizations%rowtype;
  s public.parking_stays%rowtype;
  ahora timestamptz := clock_timestamp();
  libre jsonb;
  tercero jsonb;
begin
  select u.id into admin from auth.users u where u.email like 'qa.pl.admin5q@%';
  select u.id into otro from auth.users u where u.email like 'qa.pl.adminramis@%';
  select id into parking from public.parkings where company_id = 'emp-5q' and name = 'QA Pago liberado' limit 1;
  if admin is null or otro is null or parking is null then raise exception 'fixture: admin 5Q, admin Ramis y estacionamiento QA Pago liberado'; end if;
  delete from public.parking_stays where license_plate in ('TSTA-11', 'TS12-34') and status = 'OPEN';
  -- 20261029130000: la regla de reingreso es por estacionamiento.

  if has_table_privilege('authenticated', 'public.released_plate_authorizations', 'select')
    or has_function_privilege('anon', 'public.released_plate_register_entry(uuid,uuid,jsonb,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.released_plate_save(uuid,text,uuid,timestamptz,jsonb,boolean)', 'execute') then
    raise exception 'objetos expuestos';
  end if;

  libre := jsonb_build_object('license_plate', 'TSTA-11', 'valid_from', ahora - interval '1 hour', 'valid_to', ahora + interval '2 hours',
    'duration_quantity', 3, 'duration_unit', 'HOUR', 'beneficiary_name', 'Ana Prueba', 'beneficiary_rut', '12.345.678-5',
    'beneficiary_phone', '+56 9 1234 5678', 'beneficiary_email', 'ana@prueba.cl', 'reason', 'Cortesía', 'modality', 'FREE',
    'usage_mode', 'MAX', 'max_uses', 2);

  -- Otra empresa no puede crear en emp-5q.
  begin
    perform public.released_plate_save(otro, 'emp-5q', null, null, libre, false);
    raise exception 'debía rechazar actor de otra empresa';
  exception when sqlstate '42501' then if sqlerrm <> 'RELEASED_PLATE_FORBIDDEN' then raise; end if; end;

  a := public.released_plate_save(admin, 'emp-5q', null, null, libre, false);
  if a.status <> 'ACTIVE' or a.uses_count <> 0 or a.max_uses <> 2 then raise exception 'creación'; end if;

  -- Segunda autorización vigente de la misma patente: rechazada.
  begin
    perform public.released_plate_save(admin, 'emp-5q', null, null, libre, false);
    raise exception 'debía rechazar superposición';
  exception when sqlstate '23505' then if sqlerrm <> 'RELEASED_PLATE_OVERLAP' then raise; end if; end;

  -- Cobro a tercero sin monto: rechazado por la forma.
  tercero := libre || jsonb_build_object('license_plate', 'TS12-34', 'modality', 'THIRD_PARTY', 'third_party_name', 'Conv SpA',
    'third_party_rut', '76.123.456-0', 'third_party_email', 'f@conv.cl', 'third_party_currency', 'UF', 'usage_mode', 'MULTIPLE', 'max_uses', null);
  begin
    perform public.released_plate_save(admin, 'emp-5q', null, null, tercero, false);
    raise exception 'debía exigir monto del tercero';
  exception when check_violation then null; end;
  b := public.released_plate_save(admin, 'emp-5q', null, null, tercero || jsonb_build_object('third_party_amount', 2.5), true);
  if b.modality <> 'THIRD_PARTY' or b.third_party_amount <> 2.5 then raise exception 'tercero'; end if;
  if (select event_type from public.released_plate_authorization_events where authorization_id = b.id) <> 'IMPORTED' then raise exception 'evento importado'; end if;

  -- Concurrencia: versión desactualizada.
  begin
    perform public.released_plate_save(admin, 'emp-5q', a.id, a.updated_at - interval '1 second', libre, false);
    raise exception 'debía detectar conflicto';
  exception when sqlstate 'P0001' then if sqlerrm <> 'RELEASED_PLATE_CONFLICT' then raise; end if; end;

  -- Módulo desactivado: no hay ingreso con beneficio.
  perform public.released_plate_set_parking(admin, parking, false);
  begin
    perform public.released_plate_register_entry(parking, a.id, '{"version":5}'::jsonb, jsonb_build_object('code', 'ING-TST-1', 'license_plate', 'TSTA-11'));
    raise exception 'debía rechazar módulo desactivado';
  exception when sqlstate '23514' then if sqlerrm <> 'RELEASED_PLATE_MODULE_DISABLED' then raise; end if; end;

  perform public.released_plate_set_parking(admin, parking, true);
  -- Estadía abierta de la misma patente en OTRO estacionamiento (otra empresa): no bloquea.
  insert into public.parking_stays (code, parking_id, license_plate, entry_source, entry_operator_name)
  values ('ING-TST-OTRA', '10000000-0000-4000-8000-000000000101', 'TSTA-11', 'WEB', 'Prueba');
  s := public.released_plate_register_entry(parking, a.id, '{"version":5}'::jsonb, jsonb_build_object('code', 'ING-TST-1', 'license_plate', 'TSTA-11'));
  if s.released_plate_authorization_id <> a.id or (select uses_count from public.released_plate_authorizations where id = a.id) <> 1 then raise exception 'ingreso'; end if;

  -- Dentro: no reingresa.
  begin
    perform public.released_plate_register_entry(parking, a.id, '{"version":5}'::jsonb, jsonb_build_object('code', 'ING-TST-2', 'license_plate', 'TSTA-11'));
    raise exception 'debía rechazar reingreso';
  exception when sqlstate '23505' then if sqlerrm <> 'RELEASED_PLATE_STAY_DUPLICATE' then raise; end if; end;

  -- Sale y vuelve: segundo uso; el tercero se rechaza por máximo.
  update public.parking_stays set status = 'CANCELLED' where id = s.id;
  perform public.released_plate_register_entry(parking, a.id, '{"version":5}'::jsonb, jsonb_build_object('code', 'ING-TST-3', 'license_plate', 'TSTA-11'));
  update public.parking_stays set status = 'CANCELLED' where code = 'ING-TST-3';
  begin
    perform public.released_plate_register_entry(parking, a.id, '{"version":5}'::jsonb, jsonb_build_object('code', 'ING-TST-4', 'license_plate', 'TSTA-11'));
    raise exception 'debía rechazar usos agotados';
  exception when sqlstate '23514' then if sqlerrm <> 'RELEASED_PLATE_NO_USES' then raise; end if; end;

  -- Usos agotados: la patente queda libre para una autorización nueva.
  perform public.released_plate_save(admin, 'emp-5q', null, null, libre || jsonb_build_object('usage_mode', 'MULTIPLE', 'max_uses', null), false);

  -- Eliminar (lógico) y no se puede borrar físicamente.
  select * into b from public.released_plate_authorizations where id = b.id;
  b := public.released_plate_set_status(admin, 'emp-5q', b.id, b.updated_at, 'DELETE');
  if b.status <> 'DELETED' then raise exception 'eliminar'; end if;
  begin
    delete from public.released_plate_authorizations where id = b.id;
    raise exception 'debía impedir borrado físico';
  exception when sqlstate '42501' then null; end;
  b := public.released_plate_set_status(admin, 'emp-5q', b.id, b.updated_at, 'RESTORE');
  if b.status <> 'ACTIVE' then raise exception 'restaurar'; end if;

  -- Finalizar ahora.
  b := public.released_plate_set_status(admin, 'emp-5q', b.id, b.updated_at, 'FINISH');
  if b.status <> 'FINISHED' or b.valid_to > clock_timestamp() then raise exception 'finalizar'; end if;

  -- Historial inmutable.
  begin
    update public.released_plate_authorization_events set actor_email = 'x' where authorization_id = a.id;
    raise exception 'debía proteger el historial';
  exception when sqlstate '42501' then null; end;

  raise notice 'released_plates_client_model.test.sql: OK';
end $$;
