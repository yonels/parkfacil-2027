-- Pago liberado gestionado por el cliente (SOL-2026-10-28-003): corrección de
-- la regla «un vehículo dentro no puede volver a ingresar».
--
-- Problema (prueba en PRO2, 2026-10-29): released_plate_register_entry rechazaba
-- el ingreso si la patente tenía una estadía abierta en CUALQUIER
-- estacionamiento de la plataforma, incluso de otra empresa; el POS mostraba
-- «ya tiene un ingreso abierto en este estacionamiento» aunque no figuraba.
-- Corrección: solo se considera el estacionamiento del ingreso. Solo reemplaza
-- la función; no toca tablas ni datos.

create or replace function public.released_plate_register_entry(
  p_parking_id uuid, p_authorization_id uuid, p_snapshot jsonb, p_stay jsonb
)
returns public.parking_stays
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_tz text := 'America/Santiago';
  v_company text;
  v_enabled boolean;
  v_auth public.released_plate_authorizations%rowtype;
  v_plate text := upper(btrim(coalesce(p_stay->>'license_plate', '')));
  v_stay public.parking_stays%rowtype;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'RELEASED_PLATE_SNAPSHOT_INVALID' using errcode = '22023';
  end if;
  select company_id into v_company from public.parkings where id = p_parking_id;
  perform pg_advisory_xact_lock(hashtextextended('released_plate:' || coalesce(v_company, '') || ':' || v_plate, 0));

  select enabled into v_enabled from public.released_plate_parking_settings where parking_id = p_parking_id;
  if not coalesce(v_enabled, false) then
    raise exception 'RELEASED_PLATE_MODULE_DISABLED' using errcode = '23514';
  end if;

  select * into v_auth from public.released_plate_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'ACTIVE' or v_auth.company_id <> v_company or v_auth.license_plate <> v_plate then
    raise exception 'RELEASED_PLATE_AUTHORIZATION_INVALID' using errcode = '23514';
  end if;
  if v_now < v_auth.valid_from or v_now >= v_auth.valid_to then
    raise exception 'RELEASED_PLATE_NOT_CURRENT' using errcode = '23514';
  end if;
  if v_auth.weekdays_only and extract(isodow from (v_now at time zone v_tz)) in (6, 7) then
    raise exception 'RELEASED_PLATE_WEEKEND' using errcode = '23514';
  end if;
  if v_auth.max_uses is not null and v_auth.uses_count >= v_auth.max_uses then
    raise exception 'RELEASED_PLATE_NO_USES' using errcode = '23514';
  end if;
  -- Solo en ESTE estacionamiento (misma regla que el ingreso normal: índice
  -- parking_stays_one_open_plate_idx por estacionamiento). Una estadía abierta en
  -- otro estacionamiento u otra empresa no bloquea ni se revela.
  if exists (select 1 from public.parking_stays where parking_id = p_parking_id and license_plate = v_plate and status = 'OPEN') then
    raise exception 'RELEASED_PLATE_STAY_DUPLICATE' using errcode = '23505';
  end if;

  insert into public.parking_stays (
    code, parking_id, license_plate, entry_operator_id, entry_operator_name, entry_source, entry_shift_id,
    released_plate_authorization_id, released_plate_snapshot
  ) values (
    p_stay->>'code', p_parking_id, v_plate, nullif(p_stay->>'entry_operator_id', '')::uuid, coalesce(p_stay->>'entry_operator_name', ''),
    coalesce(p_stay->>'entry_source', 'POS'), nullif(p_stay->>'entry_shift_id', '')::uuid,
    v_auth.id, p_snapshot
  ) returning * into v_stay;

  update public.released_plate_authorizations set uses_count = uses_count + 1 where id = v_auth.id;
  insert into public.released_plate_authorization_events (authorization_id, company_id, event_type, parking_id, stay_id, new_values, actor_id, actor_email)
  values (v_auth.id, v_company, 'USED', p_parking_id, v_stay.id,
    jsonb_build_object('uses_count', v_auth.uses_count + 1, 'max_uses', v_auth.max_uses, 'stay_code', v_stay.code),
    nullif(p_stay->>'entry_operator_id', '')::uuid, coalesce(p_stay->>'entry_operator_name', ''));
  return v_stay;
end;
$$;

revoke all on function public.released_plate_register_entry(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.released_plate_register_entry(uuid, uuid, jsonb, jsonb) to service_role;
