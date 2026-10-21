-- Off Street — Pago liberado, Etapa 3 (Fase E), paso 3.2: regularización por
-- el administrador del estacionamiento. SOL-2026-10-16-003.
--
-- Requiere las Etapas 1 y 2 (20261016200000, 20261018130000).
--
-- Decisión del usuario (2026-10-18): regularización SIN TOCAR DINERO, con
-- motivo obligatorio y auditoría:
-- - CLOSE_OPEN: cierra una estadía liberada que quedó abierta (el vehículo
--   salió sin registrar la salida). Queda PAID con $0, código REG-…, la hora
--   de salida que indica el administrador y SIN turno de pago: no entra en el
--   cierre de caja de ningún turno ni cambia montos cobrados. Libera el cupo.
-- - VOID_BENEFIT: anula el beneficio de una estadía mal aplicada.
--   * Abierta: deja de ser liberada (se quitan las columnas de Pago liberado,
--     que quedan en la auditoría); a la salida el POS la cobra como estadía
--     normal desde su ingreso. Libera el cupo.
--   * Cerrada: NO cambia la estadía (montos, medio, turno); solo queda la
--     anulación registrada para reportes y auditoría.
-- La auditoría es inmutable y guarda la estadía antes y después.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parking_stays' and column_name = 'released_payment_authorization_id'
  ) then
    raise exception 'Falta la Etapa 2 de Pago liberado (20261018130000).';
  end if;
end $$;

create table public.released_payment_stay_regularizations (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.parking_stays(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  authorization_id uuid not null references public.released_payment_authorizations(id) on delete restrict,
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

comment on table public.released_payment_stay_regularizations is 'Pago liberado (Etapa 3): regularizaciones del administrador sobre estadías liberadas (cerrar abierta, anular beneficio). Sin cambios de dinero ni de turno. Inmutable.';

create unique index released_payment_stay_regularizations_action_idx
  on public.released_payment_stay_regularizations(stay_id, action);
create index released_payment_stay_regularizations_parking_idx
  on public.released_payment_stay_regularizations(parking_id, created_at desc);

create trigger released_payment_stay_regularizations_immutable
  before update or delete on public.released_payment_stay_regularizations
  for each row execute function public.released_payment_block_mutation();

alter table public.released_payment_stay_regularizations enable row level security;
alter table public.released_payment_stay_regularizations force row level security;
revoke all on public.released_payment_stay_regularizations from anon, authenticated, service_role;
grant select on public.released_payment_stay_regularizations to service_role;

create or replace function public.released_payment_regularize_stay(
  p_actor_id uuid,
  p_parking_id uuid,
  p_stay_id uuid,
  p_action text,
  p_exit_at timestamptz,
  p_reason text
)
returns public.released_payment_stay_regularizations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_stay public.parking_stays%rowtype;
  v_after public.parking_stays%rowtype;
  v_parking public.parkings%rowtype;
  v_row public.released_payment_stay_regularizations%rowtype;
  v_now timestamptz := clock_timestamp();
  v_code text;
  v_fields text[] := array['status', 'entry_at', 'exit_at', 'payment_code', 'payment_method', 'payment_shift_id', 'total_amount',
    'elapsed_minutes', 'exit_operator_name', 'released_payment_authorization_id', 'released_payment_contract_id',
    'released_payment_payment_id', 'released_payment_snapshot', 'released_covered_seconds', 'released_chargeable_seconds'];
begin
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
  if v_stay.released_payment_authorization_id is null then
    raise exception 'RELEASED_PAYMENT_STAY_NOT_RELEASED' using errcode = '22023';
  end if;
  if exists (select 1 from public.released_payment_stay_regularizations where stay_id = p_stay_id and action = 'VOID_BENEFIT') then
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
      payment_method = null, payment_code = v_code,
      released_covered_seconds = null, released_chargeable_seconds = null, updated_at = v_now
    where id = p_stay_id
    returning * into v_after;
  else
    if v_stay.status = 'OPEN' then
      update public.parking_stays set
        released_payment_authorization_id = null, released_payment_contract_id = null,
        released_payment_payment_id = null, released_payment_snapshot = null,
        released_covered_seconds = null, released_chargeable_seconds = null, updated_at = v_now
      where id = p_stay_id
      returning * into v_after;
    else
      v_after := v_stay;
    end if;
  end if;

  insert into public.released_payment_stay_regularizations (
    stay_id, parking_id, company_id, authorization_id, license_plate, action, stay_status_before, exit_at,
    previous_values, new_values, reason, actor_id, actor_email, actor_role
  ) values (
    p_stay_id, p_parking_id, v_parking.company_id, v_stay.released_payment_authorization_id, v_stay.license_plate, p_action, v_stay.status,
    case when p_action = 'CLOSE_OPEN' then p_exit_at end,
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(v_stay)) where key = any (v_fields)),
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(v_after)) where key = any (v_fields)),
    left(btrim(p_reason), 500), p_actor_id, v_email, 'company_admin'
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.released_payment_regularize_stay(uuid, uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.released_payment_regularize_stay(uuid, uuid, uuid, text, timestamptz, text) to service_role;
