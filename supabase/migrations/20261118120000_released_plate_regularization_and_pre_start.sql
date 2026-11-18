-- Pago liberado gestionado por el cliente: cierre de E3 (SOL-2026-11-04-001).
--
-- 1. Ingreso antes del inicio (decisión D1 del usuario, 2026-11-04: «Solo
--    minutos previos»; regla P8c ya aprobada el 2026-10-18): una patente
--    liberada que entra ANTES del inicio de su período, el MISMO día calendario
--    (hora de Chile), se registra con su beneficio. La salida cobra solo el
--    tiempo no cubierto (releasedStayCoverage): los minutos previos al inicio y
--    los posteriores al término. Otro día: cobro normal. El ingreso consume un
--    uso, igual que un ingreso dentro del período.
-- 2. Regularización de estadías del modelo cliente (decisión D2: «Sí, las
--    mismas dos»): cerrar una estadía liberada abierta (CLOSE_OPEN) y anular un
--    beneficio mal aplicado (VOID_BENEFIT), sin movimiento de dinero, con motivo
--    obligatorio y auditoría inmutable. Misma semántica que
--    released_payment_regularize_stay del modelo anterior (20261018150000).
--
-- Aditiva: reemplaza una función, crea una tabla y una función nuevas. No
-- modifica datos existentes.

do $$
begin
  if to_regprocedure('public.released_plate_register_entry(uuid, uuid, jsonb, jsonb)') is null then
    raise exception 'Falta el modelo cliente de Pago liberado (20261029012245).';
  end if;
  if to_regprocedure('public.released_payment_admin_actor(uuid, uuid)') is null then
    raise exception 'Falta released_payment_admin_actor (20261016200000).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Ingreso: vigente, o antes del inicio el mismo día calendario
-- ---------------------------------------------------------------------------

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
  -- Vigente, o antes del inicio pero el mismo día calendario de Chile (D1).
  if v_now >= v_auth.valid_to
     or (v_now < v_auth.valid_from and (v_now at time zone v_tz)::date <> (v_auth.valid_from at time zone v_tz)::date) then
    raise exception 'RELEASED_PLATE_NOT_CURRENT' using errcode = '23514';
  end if;
  if v_auth.weekdays_only and extract(isodow from (v_now at time zone v_tz)) in (6, 7) then
    raise exception 'RELEASED_PLATE_WEEKEND' using errcode = '23514';
  end if;
  if v_auth.max_uses is not null and v_auth.uses_count >= v_auth.max_uses then
    raise exception 'RELEASED_PLATE_NO_USES' using errcode = '23514';
  end if;
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
    jsonb_build_object('uses_count', v_auth.uses_count + 1, 'max_uses', v_auth.max_uses, 'stay_code', v_stay.code,
      'before_start', v_now < v_auth.valid_from),
    nullif(p_stay->>'entry_operator_id', '')::uuid, coalesce(p_stay->>'entry_operator_name', ''));
  return v_stay;
end;
$$;

revoke all on function public.released_plate_register_entry(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.released_plate_register_entry(uuid, uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Regularización de estadías del modelo cliente
-- ---------------------------------------------------------------------------

create table public.released_plate_stay_regularizations (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.parking_stays(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  authorization_id uuid not null references public.released_plate_authorizations(id) on delete restrict,
  license_plate text not null,
  action text not null check (action in ('CLOSE_OPEN', 'VOID_BENEFIT')),
  stay_status_before text not null,
  exit_at timestamptz null,
  previous_values jsonb not null,
  new_values jsonb not null,
  reason text not null check (length(btrim(reason)) >= 3),
  actor_id uuid null references auth.users(id) on delete set null,
  actor_email text not null default '',
  actor_role text not null default 'company_admin',
  created_at timestamptz not null default clock_timestamp(),
  check ((action = 'CLOSE_OPEN') = (exit_at is not null))
);

comment on table public.released_plate_stay_regularizations is 'Pago liberado (modelo cliente): regularizaciones del administrador sobre estadías liberadas (cerrar abierta, anular beneficio). Sin cambios de dinero ni de turno. Inmutable.';

create unique index released_plate_stay_regularizations_action_idx
  on public.released_plate_stay_regularizations(stay_id, action);
create index released_plate_stay_regularizations_company_idx
  on public.released_plate_stay_regularizations(company_id, created_at desc);

create trigger released_plate_stay_regularizations_immutable
  before update or delete on public.released_plate_stay_regularizations
  for each row execute function public.released_payment_block_mutation();

alter table public.released_plate_stay_regularizations enable row level security;
alter table public.released_plate_stay_regularizations force row level security;
revoke all on public.released_plate_stay_regularizations from anon, authenticated, service_role;
grant select on public.released_plate_stay_regularizations to service_role;

create or replace function public.released_plate_regularize_stay(
  p_actor_id uuid,
  p_parking_id uuid,
  p_stay_id uuid,
  p_action text,
  p_exit_at timestamptz,
  p_reason text
)
returns public.released_plate_stay_regularizations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_stay public.parking_stays%rowtype;
  v_after public.parking_stays%rowtype;
  v_parking public.parkings%rowtype;
  v_row public.released_plate_stay_regularizations%rowtype;
  v_now timestamptz := clock_timestamp();
  v_code text;
  v_fields text[] := array['status', 'entry_at', 'exit_at', 'payment_code', 'payment_method', 'payment_shift_id', 'total_amount',
    'elapsed_minutes', 'exit_operator_name', 'released_plate_authorization_id', 'released_plate_snapshot'];
begin
  -- company_admin activo de la empresa dueña del estacionamiento.
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_action not in ('CLOSE_OPEN', 'VOID_BENEFIT') then
    raise exception 'RELEASED_PAYMENT_REGULARIZATION_ACTION_INVALID' using errcode = '22023';
  end if;

  select * into v_stay from public.parking_stays where id = p_stay_id and parking_id = p_parking_id for update;
  if not found then
    raise exception 'RELEASED_PAYMENT_STAY_NOT_FOUND' using errcode = '22023';
  end if;
  if v_stay.released_plate_authorization_id is null then
    raise exception 'RELEASED_PAYMENT_STAY_NOT_RELEASED' using errcode = '22023';
  end if;
  if exists (select 1 from public.released_plate_stay_regularizations where stay_id = p_stay_id and action = 'VOID_BENEFIT') then
    raise exception 'RELEASED_PAYMENT_BENEFIT_ALREADY_VOIDED' using errcode = '22023';
  end if;
  select * into v_parking from public.parkings where id = p_parking_id;

  if p_action = 'CLOSE_OPEN' then
    if v_stay.status <> 'OPEN' then
      raise exception 'RELEASED_PAYMENT_STAY_NOT_OPEN' using errcode = '22023';
    end if;
    if p_exit_at is null or p_exit_at < v_stay.entry_at or p_exit_at > v_now + interval '5 minutes' then
      raise exception 'RELEASED_PAYMENT_EXIT_AT_INVALID' using errcode = '22023';
    end if;
    v_code := 'REG-' || to_char(v_now at time zone 'America/Santiago', 'YYMMDDHH24MISS') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    update public.parking_stays set
      status = 'PAID', exit_at = p_exit_at, exit_operator_id = p_actor_id, exit_operator_name = v_email,
      payment_shift_id = null, elapsed_minutes = floor(extract(epoch from (p_exit_at - v_stay.entry_at)) / 60)::integer,
      subtotal_amount = 0, discount_amount = 0, net_amount = 0, tax_amount = 0, total_amount = 0,
      payment_method = null, payment_code = v_code, updated_at = v_now
    where id = p_stay_id
    returning * into v_after;
  else
    if v_stay.status = 'OPEN' then
      -- Deja de ser liberada: a la salida el POS la cobra como estadía normal.
      update public.parking_stays set
        released_plate_authorization_id = null, released_plate_snapshot = null, updated_at = v_now
      where id = p_stay_id
      returning * into v_after;
    else
      -- Ya salió: no se toca monto, medio de pago ni turno; solo queda registrada.
      v_after := v_stay;
    end if;
  end if;

  insert into public.released_plate_stay_regularizations (
    stay_id, parking_id, company_id, authorization_id, license_plate, action, stay_status_before, exit_at,
    previous_values, new_values, reason, actor_id, actor_email, actor_role
  ) values (
    p_stay_id, p_parking_id, v_parking.company_id, v_stay.released_plate_authorization_id, v_stay.license_plate, p_action, v_stay.status,
    case when p_action = 'CLOSE_OPEN' then p_exit_at end,
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(v_stay)) where key = any (v_fields)),
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(v_after)) where key = any (v_fields)),
    left(btrim(p_reason), 500), p_actor_id, v_email, 'company_admin'
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.released_plate_regularize_stay(uuid, uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.released_plate_regularize_stay(uuid, uuid, uuid, text, timestamptz, text) to service_role;
