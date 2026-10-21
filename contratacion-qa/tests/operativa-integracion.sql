BEGIN;
DO $test$
DECLARE rid uuid:=gen_random_uuid(); uid uuid; accounts jsonb:='[]'::jsonb; result jsonb; replay jsonb; cid text;pid uuid; n int; email text;
BEGIN
 FOR n IN 0..2 LOOP
 uid:=gen_random_uuid();email:='qa-'||uid::text||'@example.invalid';
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES(uid,email,jsonb_build_object('role','pending_enrollment','enrollment_id',rid::text),'{}');
 accounts:=accounts||jsonb_build_array(jsonb_build_object('id',uid,'email',email,'role',case when n=0 then 'company_admin' else 'operator' end,'fullName',case when n=0 then 'Ana Prueba' else 'Operador '||n::text end,'recoveryEmail','empresa@example.invalid'));
 END LOOP;
 result:=public.contratacion_operational_finish(rid,'test-fingerprint','{"empresa":"EMPRESA FICTICIA SOLO PRUEBAS","rut":"99.999.990-9","representanteNombres":"Ana","representanteApellidos":"Prueba","giro":"Ensayo","direccion":"Domicilio ficticio","comuna":"Comuna de prueba","ciudad":"Ciudad de prueba","region":"Región de prueba","correo":"empresa@example.invalid","telefono":"+56900000000","planId":"start","plazas":50,"estacionamientoNombre":"Parking ficticio","estacionamientoDireccion":"Dirección de prueba","estacionamientoComuna":"Comuna de prueba","estacionamientoCiudad":"Ciudad de prueba","estacionamientoRegion":"Región de prueba"}'::jsonb,accounts);
 cid:=result->>'companyId';pid:=(result->>'parkingId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=cid AND status='inactive') THEN RAISE EXCEPTION 'COMPANY_NOT_INACTIVE';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.parkings WHERE id=pid AND status='DRAFT' AND type='OFF_STREET' AND off_street_configuration_status='EMPTY') THEN RAISE EXCEPTION 'PARKING_INVALID';END IF;
 IF (SELECT count(*) FROM public.company_members WHERE company_id=cid AND status='inactive' AND must_change_password)=3 IS NOT TRUE THEN RAISE EXCEPTION 'MEMBERS_INVALID';END IF;
 IF (SELECT count(*) FROM public.company_member_parkings WHERE parking_id=pid)<>3 THEN RAISE EXCEPTION 'ASSIGNMENTS_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.parking_zones WHERE parking_id=pid AND capacity=50 AND occupied=0) THEN RAISE EXCEPTION 'CAPACITY_INVALID';END IF;
 replay:=public.contratacion_operational_finish(rid,'test-fingerprint','{"empresa":"EMPRESA FICTICIA SOLO PRUEBAS","rut":"99.999.990-9","representanteNombres":"Ana","representanteApellidos":"Prueba","giro":"Ensayo","direccion":"Domicilio ficticio","comuna":"Comuna de prueba","ciudad":"Ciudad de prueba","region":"Región de prueba","correo":"empresa@example.invalid","telefono":"+56900000000","planId":"start","plazas":50,"estacionamientoNombre":"Parking ficticio","estacionamientoDireccion":"Dirección de prueba","estacionamientoComuna":"Comuna de prueba","estacionamientoCiudad":"Ciudad de prueba","estacionamientoRegion":"Región de prueba"}'::jsonb,accounts);
 IF result<>replay THEN RAISE EXCEPTION 'RETRY_CHANGED_IDS';END IF;
 BEGIN
 DELETE FROM public.company_members WHERE company_id=cid;
 RAISE EXCEPTION 'DELETE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ACCOUNT_HISTORY_MUST_BE_PRESERVED' THEN RAISE;END IF;END;
 IF (SELECT count(*) FROM public.company_members WHERE company_id=cid)<>3 THEN RAISE EXCEPTION 'HISTORY_LOST';END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: empresa inactiva, parking DRAFT, tres miembros y asignaciones, 50 cupos, reintento estable, borrado bloqueado; fixture SQL revertida. No prueba inicio de sesión Auth.' as resultado;
