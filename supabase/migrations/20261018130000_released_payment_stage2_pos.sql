-- Off Street — Pago liberado, Etapa 2 (Fase D: POS). SOL-2026-10-16-003, paso 2.3.
--
-- Requiere la Etapa 1 (20261016200000). Agrega a `parking_stays` las columnas
-- de estadía liberada y la RPC de ingreso con beneficio, y vuelve a impedir
-- bajar los cupos por debajo de la ocupación liberada vigente.
--
-- Reglas del ingreso con beneficio (decisiones del usuario, 2026-10-16/18):
-- - Módulo activo y contratación vigente (la que el POS validó).
-- - Autorización ACTIVA de esa patente en ese estacionamiento y PAGADA: pago
--   vigente registrado por el total acordado (sin pagos parciales).
-- - Vigencia: el ingreso es antes del término y la autorización ya comenzó o
--   comienza el MISMO DÍA calendario (America/Santiago). Los minutos previos al
--   inicio y los que quedan fuera de las franjas horarias se cobran a la salida
--   con la tarifa del estacionamiento (cada intervalo no cubierto por separado).
-- - Cupo: estadías liberadas abiertas < cupos del cliente, con bloqueo por
--   estacionamiento (dos ingresos simultáneos nunca superan los cupos).
-- - Nunca dos estadías abiertas por patente (en ningún estacionamiento).
-- Las franjas horarias de una autorización recurrente las evalúa el servidor
-- (releasedStayCore) antes de llamar a esta RPC.

do $$
begin
  if to_regclass('public.released_payment_beneficiary_payments') is null then
    raise exception 'Falta la Etapa 1 de Pago liberado (20261016200000).';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parking_stays' and column_name = 'released_payment_authorization_id'
  ) then
    raise exception 'parking_stays ya tiene columnas de Pago liberado (esquema de desarrollo anterior); esta migración solo se aplica sobre una base sin ellas.';
  end if;
end $$;

alter table public.parking_stays
  add column released_payment_authorization_id uuid null references public.released_payment_authorizations(id) on delete restrict,
  add column released_payment_contract_id uuid null references public.released_payment_contracts(id) on delete restrict,
  add column released_payment_payment_id uuid null references public.released_payment_beneficiary_payments(id) on delete restrict,
  add column released_payment_snapshot jsonb null,
  add column released_covered_seconds integer null check (released_covered_seconds is null or released_covered_seconds >= 0),
  add column released_chargeable_seconds integer null check (released_chargeable_seconds is null or released_chargeable_seconds >= 0),
  add constraint parking_stays_released_payment_shape_check check (
    (released_payment_authorization_id is null and released_payment_contract_id is null
      and released_payment_payment_id is null and released_payment_snapshot is null)
    or (released_payment_authorization_id is not null and released_payment_contract_id is not null
      and released_payment_payment_id is not null and jsonb_typeof(released_payment_snapshot) = 'object')
  );

comment on column public.parking_stays.released_payment_snapshot is 'Pago liberado: condiciones congeladas al ingreso (autorizaciones de la patente, contratación, zona horaria). La salida usa solo este snapshot: cambios posteriores no generan cobros retroactivos.';
comment on column public.parking_stays.released_payment_payment_id is 'Pago liberado: pago del beneficiario vigente al ingreso (evidencia de que la autorización estaba pagada).';

create index parking_stays_released_open_idx
  on public.parking_stays(parking_id)
  where status = 'OPEN' and released_payment_authorization_id is not null;

create or replace function public.released_payment_register_entry(
  p_parking_id uuid, p_authorization_id uuid, p_contract_id uuid, p_snapshot jsonb, p_stay jsonb
)
returns public.parking_stays
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_tz text := 'America/Santiago';
  v_module public.released_payment_parking_modules%rowtype;
  v_contract public.released_payment_contracts%rowtype;
  v_auth public.released_payment_authorizations%rowtype;
  v_payment_id uuid;
  v_plate text := upper(btrim(coalesce(p_stay->>'license_plate', '')));
  v_open integer;
  v_stay public.parking_stays%rowtype;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'RELEASED_PAYMENT_SNAPSHOT_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('released_payment:' || p_parking_id::text, 0));

  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  if not found or not v_module.enabled then
    raise exception 'RELEASED_PAYMENT_MODULE_DISABLED' using errcode = '23514';
  end if;
  if v_module.current_contract_id is distinct from p_contract_id then
    raise exception 'RELEASED_PAYMENT_CONTRACT_CHANGED' using errcode = '23514';
  end if;
  select * into v_contract from public.released_payment_contracts where id = p_contract_id;
  if v_now < v_contract.starts_at or v_now >= v_contract.ends_at then
    raise exception 'RELEASED_PAYMENT_CONTRACT_NOT_CURRENT' using errcode = '23514';
  end if;

  select * into v_auth from public.released_payment_authorizations where id = p_authorization_id;
  if not found or v_auth.status <> 'ACTIVE' or v_auth.parking_id <> p_parking_id or v_auth.license_plate <> v_plate then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_INVALID' using errcode = '23514';
  end if;
  -- Vigente ahora, o comienza más tarde el mismo día calendario (P8c).
  if v_now >= v_auth.valid_to
     or (v_auth.valid_from > v_now and (v_auth.valid_from at time zone v_tz)::date <> (v_now at time zone v_tz)::date) then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_NOT_CURRENT' using errcode = '23514';
  end if;
  -- Pagada: pago vigente por el total acordado (sin parciales).
  select id into v_payment_id from public.released_payment_beneficiary_payments
  where authorization_id = v_auth.id and status = 'REGISTERED' and amount = v_auth.total_amount;
  if v_payment_id is null then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_UNPAID' using errcode = '23514';
  end if;

  if exists (select 1 from public.parking_stays where license_plate = v_plate and status = 'OPEN') then
    raise exception 'RELEASED_PAYMENT_STAY_DUPLICATE' using errcode = '23505';
  end if;
  select count(*) into v_open from public.parking_stays
  where parking_id = p_parking_id and status = 'OPEN' and released_payment_authorization_id is not null;
  if v_open >= coalesce(v_module.operational_spots, 0) then
    raise exception 'RELEASED_PAYMENT_NO_SPOTS' using errcode = '23514';
  end if;

  insert into public.parking_stays (
    code, parking_id, license_plate, entry_operator_id, entry_operator_name, entry_source, entry_shift_id,
    released_payment_authorization_id, released_payment_contract_id, released_payment_payment_id, released_payment_snapshot
  ) values (
    p_stay->>'code', p_parking_id, v_plate, nullif(p_stay->>'entry_operator_id', '')::uuid, coalesce(p_stay->>'entry_operator_name', ''),
    coalesce(p_stay->>'entry_source', 'POS'), nullif(p_stay->>'entry_shift_id', '')::uuid,
    v_auth.id, p_contract_id, v_payment_id, p_snapshot
  ) returning * into v_stay;
  return v_stay;
end;
$$;

-- Cupos: vuelve la comprobación contra la ocupación liberada vigente, con el
-- mismo bloqueo que el ingreso (reemplaza la versión de la Etapa 1).
create or replace function public.released_payment_set_operational_spots(p_actor_id uuid, p_parking_id uuid, p_spots integer, p_reason text)
returns public.released_payment_parking_modules
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_module public.released_payment_parking_modules%rowtype;
  v_open integer;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_spots is null or p_spots < 0 or p_spots > 1000 then
    raise exception 'RELEASED_PAYMENT_SPOTS_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('released_payment:' || p_parking_id::text, 0));
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id for update;
  if not found or v_module.current_contract_id is null then
    raise exception 'RELEASED_PAYMENT_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if not v_module.enabled then
    raise exception 'RELEASED_PAYMENT_MODULE_DISABLED' using errcode = '22023';
  end if;
  select count(*) into v_open from public.parking_stays
  where parking_id = p_parking_id and status = 'OPEN' and released_payment_authorization_id is not null;
  if p_spots < v_open then
    raise exception 'RELEASED_PAYMENT_SPOTS_BELOW_OCCUPANCY' using errcode = '23514';
  end if;
  if v_module.operational_spots is not distinct from p_spots then
    raise exception 'RELEASED_PAYMENT_SPOTS_UNCHANGED' using errcode = '22023';
  end if;

  update public.released_payment_parking_modules
  set operational_spots = p_spots, updated_at = clock_timestamp()
  where parking_id = p_parking_id;

  insert into public.released_payment_module_events (parking_id, company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (
    p_parking_id, v_module.company_id, 'SPOTS_CHANGED', v_module.current_contract_id,
    jsonb_build_object('operational_spots', v_module.operational_spots, 'open_released_stays', v_open),
    jsonb_build_object('operational_spots', p_spots),
    btrim(p_reason), p_actor_id, v_email, 'company_admin'
  );
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  return v_module;
end;
$$;

revoke all on function public.released_payment_register_entry(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.released_payment_register_entry(uuid, uuid, uuid, jsonb, jsonb) to service_role;
revoke all on function public.released_payment_set_operational_spots(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.released_payment_set_operational_spots(uuid, uuid, integer, text) to service_role;
