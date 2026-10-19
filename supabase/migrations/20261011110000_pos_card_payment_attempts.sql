-- SOL-2026-10-11-001 — Reserva central de intentos de pago con tarjeta (POS / TUU).
--
-- ESTADO DE APLICACIÓN (actualizado el 2026-10-11):
--   LOCAL       APLICADA el 2026-10-11 en Supabase local (Docker, contenedor
--               supabase_db_parkfacil-2027) con psql, en una transacción. NO quedó
--               registrada en supabase_migrations.schema_migrations (ver
--               docs/solicitudes/SOL-2026-10-11-001/reserva-central.md, sección
--               "Registro en schema_migrations").
--   QA          PENDIENTE. No aplicada.
--   PRODUCCIÓN  PENDIENTE. No aplicada.
-- No ejecutar en QA ni en producción (tampoco dentro de una transacción con
-- ROLLBACK) sin autorización expresa.
--
-- Reemplaza la propuesta anterior `20261011100000_tuu_card_payment_idempotency.sql`
-- (índice único global sobre sequenceNumber), que se retira: la unicidad de la
-- referencia TUU entre empresas/terminales/ambientes no está confirmada por Haulmer.
--
-- Problema (H1): el bloqueo de segundo cobro vivía solo en el equipo. Dos equipos
-- podían abrir TUU para el mismo ticket. Solución: el servidor RESERVA el intento
-- antes de abrir TUU; a lo sumo un intento activo por ticket, garantizado por la
-- base de datos (bloqueo de la fila del ticket + índice único parcial).
--
-- Problema (H2): la misma aprobación podía quedar registrada en dos tickets.
-- Solución: el pago se registra POR INTENTO (un intento pertenece a un único
-- ticket y paga a lo sumo una vez), no por referencia TUU.
--
-- Tres identificadores distintos:
--   id                 identificador interno del intento (lo crea el servidor).
--   idempotency_key    clave de idempotencia de ParkFacil (la genera el POS por
--                      intento; repetirla recupera el mismo intento).
--   provider_reference sequenceNumber que entrega TUU. Dato informado; NO se
--                      asume único globalmente.
--
-- Estados (status):
--   RESERVED                       reservado; TUU todavía no se abrió.
--   SENT_TO_TUU                    el POS confirmó que va a abrir TUU (pudo llegar a TUU).
--   APPROVED_PENDING_REGISTRATION  TUU aprobó; falta registrar el pago en el ticket.
--   PAID                           pago registrado en el ticket (final).
--   DECLINED                       rechazo confirmado por TUU, sin cobro (final).
--   CANCELLED                      cancelación confirmada por TUU, sin cobro (final).
--   NOT_SENT                       la reserva nunca abrió TUU (final).
--   UNCERTAIN                      no se sabe si TUU cobró; bloquea hasta regularizar.
--   RELEASED_BY_REGULARIZATION     incierto liberado manualmente por un perfil
--                                  autorizado ("no hubo cobro"); NO es una
--                                  verificación contra TUU (final).
-- Activos (bloquean otro cobro del ticket): RESERVED (vigente), SENT_TO_TUU,
-- APPROVED_PENDING_REGISTRATION, UNCERTAIN.

-- ---------------------------------------------------------------------------
-- 1. Tabla de intentos
-- ---------------------------------------------------------------------------

create table if not exists public.pos_card_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 80),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  stay_id uuid not null references public.parking_stays(id) on delete restrict,
  ticket_code text not null,
  license_plate text not null,
  operator_id text not null,
  operator_name text not null default '',
  shift_id uuid not null references public.operator_shifts(id) on delete restrict,
  device_id text not null check (char_length(device_id) between 8 and 80),
  provider text not null default 'TUU' check (provider = 'TUU'),
  environment text not null check (environment in ('DEV', 'PROD')),
  card_type text not null check (card_type in ('DEBIT', 'CREDIT')),
  amount numeric(14,2) not null check (amount > 0),
  -- Cálculo de cobro firmado por el servidor con el que se inició el pago: fija
  -- el monto. Permite registrar el pago desde otro equipo sin recalcular.
  charge_snapshot jsonb not null,
  status text not null default 'RESERVED' check (status in (
    'RESERVED', 'SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'PAID',
    'DECLINED', 'CANCELLED', 'NOT_SENT', 'UNCERTAIN', 'RELEASED_BY_REGULARIZATION'
  )),
  provider_reference text null check (provider_reference is null or provider_reference ~ '^[0-9]{12}$'),
  provider_error_code text null,
  provider_error_message text null,
  resolution_source text null check (resolution_source is null or resolution_source in ('TUU_RESULT', 'NOT_SENT', 'MANUAL_REGULARIZATION')),
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  sent_at timestamptz null,
  result_at timestamptz null,
  approved_at timestamptz null,
  paid_at timestamptz null,
  payment_code text null,
  regularized_by text null,
  regularized_by_name text null,
  regularized_at timestamptz null,
  regularization_reason text null,
  regularization_evidence text null,
  regularization_previous_status text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_card_payment_attempts_idempotency_key unique (company_id, idempotency_key),
  constraint pos_card_payment_attempts_regularization_complete check (
    regularized_at is null
    or (regularized_by is not null and regularization_reason is not null and regularization_previous_status is not null)
  )
);

-- A lo sumo UN intento activo por ticket (persistente; no depende de la
-- memoria del servidor ni de "consultar y después insertar").
create unique index if not exists pos_card_payment_attempts_one_active_per_stay
  on public.pos_card_payment_attempts (stay_id)
  where status in ('RESERVED', 'SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN');

create index if not exists pos_card_payment_attempts_company_status_idx
  on public.pos_card_payment_attempts (company_id, status, reserved_at desc);
create index if not exists pos_card_payment_attempts_parking_idx
  on public.pos_card_payment_attempts (parking_id, reserved_at desc);
-- Búsqueda de una referencia TUU dentro de su alcance (empresa + ambiente).
-- NO es único: el alcance real de unicidad de sequenceNumber depende de la
-- respuesta de Haulmer.
create index if not exists pos_card_payment_attempts_reference_idx
  on public.pos_card_payment_attempts (company_id, environment, provider, provider_reference)
  where provider_reference is not null;

alter table public.pos_card_payment_attempts enable row level security;
revoke all on public.pos_card_payment_attempts from public, anon, authenticated;
grant select, insert, update on public.pos_card_payment_attempts to service_role;

-- ---------------------------------------------------------------------------
-- 2. Vínculo ticket <-> intento y trazabilidad del registro
-- ---------------------------------------------------------------------------

alter table public.parking_stays
  add column if not exists card_payment_attempt_id uuid null references public.pos_card_payment_attempts(id) on delete restrict,
  add column if not exists card_payment_approved_at timestamptz null,
  add column if not exists card_payment_registered_at timestamptz null,
  add column if not exists card_payment_registration text null;

alter table public.parking_stays drop constraint if exists parking_stays_card_payment_registration_check;
alter table public.parking_stays add constraint parking_stays_card_payment_registration_check check (
  card_payment_registration is null
  or (
    card_payment_registration in ('IMMEDIATE', 'REGULARIZED')
    and payment_method is not null
    and payment_method = 'CARD'
  )
);

-- Unicidad interna justificable: un intento paga a lo sumo un ticket.
create unique index if not exists parking_stays_card_payment_attempt_unique_idx
  on public.parking_stays (card_payment_attempt_id)
  where card_payment_attempt_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Reserva atómica (antes de abrir TUU)
-- ---------------------------------------------------------------------------

create or replace function public.reserve_pos_card_payment(
  p_idempotency_key text,
  p_company_id text,
  p_parking_id uuid,
  p_stay_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_shift_id uuid,
  p_device_id text,
  p_environment text,
  p_card_type text,
  p_amount numeric,
  p_charge_snapshot jsonb,
  p_ttl_seconds integer default 180
) returns public.pos_card_payment_attempts
language plpgsql security definer set search_path = public as $$
declare
  v_stay public.parking_stays%rowtype;
  v_parking public.parkings%rowtype;
  v_shift public.operator_shifts%rowtype;
  v_existing public.pos_card_payment_attempts%rowtype;
  v_attempt public.pos_card_payment_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_constraint text;
begin
  -- Bloquea la fila del ticket: dos reservas simultáneas del mismo ticket se
  -- procesan una después de la otra.
  select * into v_stay from public.parking_stays where id = p_stay_id for update;
  if not found then raise exception 'CARD_ATTEMPT_STAY_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_parking from public.parkings where id = v_stay.parking_id;
  if not found or v_stay.parking_id <> p_parking_id or v_parking.company_id <> p_company_id then
    raise exception 'CARD_ATTEMPT_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  -- Idempotencia: la misma clave recupera el mismo intento; con datos
  -- incompatibles es un conflicto.
  select * into v_existing from public.pos_card_payment_attempts
   where company_id = p_company_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.stay_id = p_stay_id
       and v_existing.amount = p_amount
       and v_existing.card_type = p_card_type
       and v_existing.operator_id = p_operator_id
       and v_existing.device_id = p_device_id
       and v_existing.environment = p_environment then
      return v_existing;
    end if;
    raise exception 'CARD_ATTEMPT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  if v_stay.status <> 'OPEN' then raise exception 'CARD_ATTEMPT_STAY_NOT_OPEN' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'CARD_ATTEMPT_AMOUNT_INVALID' using errcode = 'P0001'; end if;

  select * into v_shift from public.operator_shifts where id = p_shift_id;
  if not found or v_shift.status <> 'OPEN' or v_shift.operator_id <> p_operator_id or v_shift.parking_id <> v_stay.parking_id then
    raise exception 'CARD_ATTEMPT_SHIFT_INVALID' using errcode = 'P0001';
  end if;

  -- Una reserva vencida que nunca pasó a SENT_TO_TUU no llegó a abrir TUU (el
  -- POS solo abre TUU después de que el servidor confirma SENT_TO_TUU): se
  -- cierra como NOT_SENT. Un intento que sí pudo llegar a TUU NUNCA vence.
  update public.pos_card_payment_attempts
     set status = 'NOT_SENT', resolution_source = 'NOT_SENT', provider_error_code = 'RESERVATION_EXPIRED',
         result_at = v_now, updated_at = v_now
   where stay_id = p_stay_id and status = 'RESERVED' and reservation_expires_at <= v_now;

  if exists (
    select 1 from public.pos_card_payment_attempts
     where stay_id = p_stay_id
       and status in ('RESERVED', 'SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN')
  ) then
    raise exception 'CARD_ATTEMPT_ACTIVE' using errcode = 'P0001';
  end if;

  insert into public.pos_card_payment_attempts (
    idempotency_key, company_id, parking_id, stay_id, ticket_code, license_plate,
    operator_id, operator_name, shift_id, device_id, environment, card_type, amount,
    charge_snapshot, status, reserved_at, reservation_expires_at
  ) values (
    p_idempotency_key, p_company_id, v_stay.parking_id, v_stay.id, v_stay.code, v_stay.license_plate,
    p_operator_id, coalesce(p_operator_name, ''), p_shift_id, p_device_id, p_environment, p_card_type, p_amount,
    p_charge_snapshot, 'RESERVED', v_now,
    v_now + make_interval(secs => greatest(30, least(coalesce(p_ttl_seconds, 180), 900)))
  ) returning * into v_attempt;

  return v_attempt;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pos_card_payment_attempts_idempotency_key' then
      raise exception 'CARD_ATTEMPT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    raise exception 'CARD_ATTEMPT_ACTIVE' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. El POS confirma que va a abrir TUU (única vía para pasar de RESERVED a
--    SENT_TO_TUU). Si la reserva venció, devuelve el intento como NOT_SENT y el
--    POS no abre TUU.
-- ---------------------------------------------------------------------------

create or replace function public.mark_pos_card_payment_sent(
  p_attempt_id uuid,
  p_company_id text,
  p_operator_id text,
  p_device_id text
) returns public.pos_card_payment_attempts
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.pos_card_payment_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_attempt from public.pos_card_payment_attempts
   where id = p_attempt_id and company_id = p_company_id for update;
  if not found then raise exception 'CARD_ATTEMPT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_attempt.operator_id <> p_operator_id or v_attempt.device_id <> p_device_id then
    raise exception 'CARD_ATTEMPT_FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_attempt.status = 'SENT_TO_TUU' then return v_attempt; end if;
  if v_attempt.status <> 'RESERVED' then raise exception 'CARD_ATTEMPT_INVALID_STATE' using errcode = 'P0001'; end if;

  if v_attempt.reservation_expires_at <= v_now then
    update public.pos_card_payment_attempts
       set status = 'NOT_SENT', resolution_source = 'NOT_SENT', provider_error_code = 'RESERVATION_EXPIRED',
           result_at = v_now, updated_at = v_now
     where id = v_attempt.id returning * into v_attempt;
    return v_attempt;
  end if;

  update public.pos_card_payment_attempts
     set status = 'SENT_TO_TUU', sent_at = v_now, updated_at = v_now
   where id = v_attempt.id returning * into v_attempt;
  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Resultado entregado por TUU (también tardío). Nunca libera un ticket por
--    falta de respuesta: UNCERTAIN sigue bloqueando.
-- ---------------------------------------------------------------------------

create or replace function public.report_pos_card_payment_result(
  p_attempt_id uuid,
  p_company_id text,
  p_device_id text,
  p_outcome text,
  p_reference text,
  p_error_code text,
  p_error_message text
) returns public.pos_card_payment_attempts
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.pos_card_payment_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_target text;
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if p_outcome not in ('APPROVED', 'DECLINED', 'CANCELLED', 'NOT_STARTED', 'UNCERTAIN') then
    raise exception 'CARD_ATTEMPT_OUTCOME_INVALID' using errcode = 'P0001';
  end if;
  if v_reference is not null and v_reference !~ '^[0-9]{12}$' then
    raise exception 'CARD_ATTEMPT_REFERENCE_INVALID' using errcode = 'P0001';
  end if;

  select * into v_attempt from public.pos_card_payment_attempts
   where id = p_attempt_id and company_id = p_company_id for update;
  if not found then raise exception 'CARD_ATTEMPT_NOT_FOUND' using errcode = 'P0001'; end if;
  -- El resultado lo entrega el equipo que abrió TUU.
  if v_attempt.device_id <> p_device_id then raise exception 'CARD_ATTEMPT_FORBIDDEN' using errcode = 'P0001'; end if;

  v_target := case p_outcome
    when 'APPROVED' then 'APPROVED_PENDING_REGISTRATION'
    when 'DECLINED' then 'DECLINED'
    when 'CANCELLED' then 'CANCELLED'
    when 'NOT_STARTED' then 'NOT_SENT'
    else 'UNCERTAIN'
  end;

  -- Respuesta duplicada: mismo resultado sobre un intento ya resuelto.
  if v_attempt.status = v_target
     and (v_target <> 'APPROVED_PENDING_REGISTRATION' or v_attempt.provider_reference is not distinct from v_reference) then
    return v_attempt;
  end if;
  if v_attempt.status = 'PAID' and p_outcome = 'APPROVED' and v_attempt.provider_reference is not distinct from v_reference then
    return v_attempt;
  end if;

  if v_attempt.status = 'RESERVED' then
    -- TUU no pudo responder si nunca se abrió: solo se acepta "no se inició".
    if p_outcome <> 'NOT_STARTED' then raise exception 'CARD_ATTEMPT_INVALID_STATE' using errcode = 'P0001'; end if;
  elsif v_attempt.status = 'UNCERTAIN' then
    -- Respuesta tardía de TUU sobre un intento incierto. "No se inició" ya no
    -- es demostrable en este punto.
    if p_outcome = 'NOT_STARTED' then raise exception 'CARD_ATTEMPT_INVALID_STATE' using errcode = 'P0001'; end if;
  elsif v_attempt.status <> 'SENT_TO_TUU' then
    -- Intento ya resuelto con otro resultado: incompatible.
    raise exception 'CARD_ATTEMPT_RESULT_CONFLICT' using errcode = 'P0001';
  end if;

  if v_target = 'APPROVED_PENDING_REGISTRATION' and v_reference is not null then
    -- Serializa por (empresa, ambiente, proveedor, referencia): la comprobación
    -- siguiente es atómica también entre dos intentos distintos que informen la
    -- misma referencia al mismo tiempo.
    perform pg_advisory_xact_lock(hashtextextended(
      v_attempt.company_id || ':' || v_attempt.environment || ':' || v_attempt.provider || ':' || v_reference, 0));
  end if;

  if v_target = 'APPROVED_PENDING_REGISTRATION' and v_reference is not null and exists (
    select 1 from public.pos_card_payment_attempts other
     where other.company_id = v_attempt.company_id
       and other.environment = v_attempt.environment
       and other.provider = v_attempt.provider
       and other.provider_reference = v_reference
       and other.id <> v_attempt.id
       and other.status in ('APPROVED_PENDING_REGISTRATION', 'PAID')
  ) then
    -- Referencia TUU ya usada por otro intento de la MISMA empresa y ambiente:
    -- resultado incompatible. No se aprueba ni se rechaza: queda incierto para
    -- regularización. (Alcance acotado a propósito; ver preguntas a Haulmer.)
    update public.pos_card_payment_attempts
       set status = 'UNCERTAIN', provider_reference = v_reference, provider_error_code = 'REFERENCE_REUSED',
           provider_error_message = 'La referencia informada por TUU ya está asociada a otro intento.',
           resolution_source = null, result_at = v_now, updated_at = v_now
     where id = v_attempt.id returning * into v_attempt;
    return v_attempt;
  end if;

  update public.pos_card_payment_attempts
     set status = v_target,
         provider_reference = case when v_target = 'APPROVED_PENDING_REGISTRATION' then v_reference else provider_reference end,
         provider_error_code = case when v_target = 'APPROVED_PENDING_REGISTRATION' then null else nullif(left(btrim(coalesce(p_error_code, '')), 40), '') end,
         provider_error_message = case when v_target = 'APPROVED_PENDING_REGISTRATION' then null else nullif(left(btrim(coalesce(p_error_message, '')), 200), '') end,
         resolution_source = case v_target when 'UNCERTAIN' then null when 'NOT_SENT' then 'NOT_SENT' else 'TUU_RESULT' end,
         approved_at = case when v_target = 'APPROVED_PENDING_REGISTRATION' then v_now else approved_at end,
         result_at = v_now,
         updated_at = v_now
   where id = v_attempt.id returning * into v_attempt;
  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Registro del pago y cierre del intento en UNA transacción. Repetirlo
--    devuelve el pago existente (reintento tras un fallo de registro, sin
--    repetir el cobro).
-- ---------------------------------------------------------------------------

create or replace function public.register_pos_card_payment(
  p_attempt_id uuid,
  p_company_id text,
  p_operator_id uuid,
  p_operator_name text,
  p_shift_id uuid,
  p_payment jsonb
) returns public.parking_stays
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.pos_card_payment_attempts%rowtype;
  v_stay public.parking_stays%rowtype;
  v_now timestamptz := clock_timestamp();
  v_exit_at timestamptz;
begin
  select * into v_attempt from public.pos_card_payment_attempts
   where id = p_attempt_id and company_id = p_company_id for update;
  if not found then raise exception 'CARD_ATTEMPT_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_stay from public.parking_stays where id = v_attempt.stay_id for update;
  if not found then raise exception 'CARD_ATTEMPT_STAY_NOT_FOUND' using errcode = 'P0001'; end if;

  if v_attempt.status = 'PAID' then
    if v_stay.card_payment_attempt_id is distinct from v_attempt.id then
      raise exception 'CARD_ATTEMPT_INCONSISTENT' using errcode = 'P0001';
    end if;
    return v_stay;
  end if;
  if v_attempt.status <> 'APPROVED_PENDING_REGISTRATION' then
    raise exception 'CARD_ATTEMPT_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_stay.status <> 'OPEN' then raise exception 'CARD_ATTEMPT_STAY_NOT_OPEN' using errcode = 'P0001'; end if;
  -- El monto registrado es exactamente el reservado y enviado a TUU.
  if round((p_payment->>'total_amount')::numeric) <> round(v_attempt.amount) then
    raise exception 'CARD_ATTEMPT_AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  -- Hora del pago: la de aprobación (posterior al ingreso); si no, la del registro.
  v_exit_at := coalesce(v_attempt.approved_at, v_now);
  if v_exit_at < v_stay.entry_at or v_exit_at > v_now then v_exit_at := v_now; end if;

  update public.parking_stays set
    status = 'PAID',
    exit_at = v_exit_at,
    exit_operator_id = p_operator_id,
    exit_operator_name = p_operator_name,
    payment_shift_id = p_shift_id,
    elapsed_minutes = (p_payment->>'elapsed_minutes')::integer,
    rate_id = nullif(p_payment->>'rate_id', '')::uuid,
    rate_name = p_payment->>'rate_name',
    billing_mode = p_payment->>'billing_mode',
    subtotal_amount = coalesce(round((p_payment->>'subtotal_amount')::numeric), 0)::integer,
    discount_amount = coalesce(round((p_payment->>'discount_amount')::numeric), 0)::integer,
    coupon_id = nullif(p_payment->>'coupon_id', '')::uuid,
    coupon_code = nullif(p_payment->>'coupon_code', ''),
    net_amount = coalesce(round((p_payment->>'net_amount')::numeric), 0)::integer,
    tax_amount = coalesce(round((p_payment->>'tax_amount')::numeric), 0)::integer,
    total_amount = coalesce(round((p_payment->>'total_amount')::numeric), 0)::integer,
    charge_breakdown = case when p_payment ? 'charge_breakdown' then p_payment->'charge_breakdown' else charge_breakdown end,
    payment_method = 'CARD',
    payment_card_type = v_attempt.card_type,
    payment_code = p_payment->>'payment_code',
    card_payment_provider = case when v_attempt.provider_reference is null then null else v_attempt.provider end,
    card_payment_reference = v_attempt.provider_reference,
    card_payment_attempt_id = v_attempt.id,
    card_payment_approved_at = v_attempt.approved_at,
    card_payment_registered_at = v_now,
    card_payment_registration = case
      when v_attempt.regularized_at is not null or v_now - coalesce(v_attempt.approved_at, v_now) > interval '2 minutes' then 'REGULARIZED'
      else 'IMMEDIATE'
    end,
    updated_at = v_now
  where id = v_stay.id and status = 'OPEN'
  returning * into v_stay;
  if not found then raise exception 'CARD_ATTEMPT_STAY_NOT_OPEN' using errcode = 'P0001'; end if;

  update public.pos_card_payment_attempts
     set status = 'PAID', paid_at = v_now, payment_code = v_stay.payment_code, updated_at = v_now
   where id = v_attempt.id;

  return v_stay;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Regularización manual de un intento incierto por un perfil autorizado
--    (el permiso lo valida la API). Deja actor, fecha, motivo, evidencia y
--    estado anterior. No es una verificación contra TUU.
-- ---------------------------------------------------------------------------

create or replace function public.regularize_pos_card_payment(
  p_attempt_id uuid,
  p_company_id text,
  p_actor_id text,
  p_actor_name text,
  p_resolution text,
  p_reference text,
  p_reason text,
  p_evidence text
) returns public.pos_card_payment_attempts
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.pos_card_payment_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_resolution not in ('APPROVED', 'NOT_CHARGED') then
    raise exception 'CARD_ATTEMPT_RESOLUTION_INVALID' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 10 then raise exception 'CARD_ATTEMPT_REASON_REQUIRED' using errcode = 'P0001'; end if;
  if v_reference is not null and v_reference !~ '^[0-9]{12}$' then
    raise exception 'CARD_ATTEMPT_REFERENCE_INVALID' using errcode = 'P0001';
  end if;

  select * into v_attempt from public.pos_card_payment_attempts
   where id = p_attempt_id and company_id = p_company_id for update;
  if not found then raise exception 'CARD_ATTEMPT_NOT_FOUND' using errcode = 'P0001'; end if;
  -- Solo se regulariza lo que quedó sin resultado conocido.
  if v_attempt.status not in ('UNCERTAIN', 'SENT_TO_TUU') then
    raise exception 'CARD_ATTEMPT_INVALID_STATE' using errcode = 'P0001';
  end if;

  -- Una referencia TUU ya asociada a otro intento aprobado de la misma empresa
  -- y ambiente no puede usarse para declarar aprobado este intento.
  if p_resolution = 'APPROVED' and v_reference is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      v_attempt.company_id || ':' || v_attempt.environment || ':' || v_attempt.provider || ':' || v_reference, 0));
    if exists (
      select 1 from public.pos_card_payment_attempts other
       where other.company_id = v_attempt.company_id
         and other.environment = v_attempt.environment
         and other.provider = v_attempt.provider
         and other.provider_reference = v_reference
         and other.id <> v_attempt.id
         and other.status in ('APPROVED_PENDING_REGISTRATION', 'PAID')
    ) then
      raise exception 'CARD_ATTEMPT_REFERENCE_REUSED' using errcode = 'P0001';
    end if;
  end if;

  update public.pos_card_payment_attempts set
    status = case p_resolution when 'APPROVED' then 'APPROVED_PENDING_REGISTRATION' else 'RELEASED_BY_REGULARIZATION' end,
    provider_reference = case when p_resolution = 'APPROVED' then coalesce(v_reference, provider_reference) else provider_reference end,
    approved_at = case when p_resolution = 'APPROVED' then coalesce(approved_at, sent_at, v_now) else approved_at end,
    resolution_source = 'MANUAL_REGULARIZATION',
    regularized_by = p_actor_id,
    regularized_by_name = coalesce(p_actor_name, ''),
    regularized_at = v_now,
    regularization_reason = left(v_reason, 500),
    regularization_evidence = nullif(left(btrim(coalesce(p_evidence, '')), 500), ''),
    regularization_previous_status = v_attempt.status,
    result_at = v_now,
    updated_at = v_now
  where id = v_attempt.id returning * into v_attempt;
  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Guarda sobre el ticket: ningún otro camino (efectivo, tarjeta sin
--    intento, "se retiró sin pagar", anulación, pago web) puede cambiar el
--    estado de un ticket con un intento activo. Solo el registro del propio
--    intento puede pagarlo.
-- ---------------------------------------------------------------------------

create or replace function public.guard_parking_stay_card_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_attempt_id uuid;
begin
  if new.status is distinct from old.status then
    select id into v_attempt_id from public.pos_card_payment_attempts
     where stay_id = old.id
       and (
         status in ('SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN')
         or (status = 'RESERVED' and reservation_expires_at > clock_timestamp())
       )
     limit 1;
    if found and not (new.status = 'PAID' and new.card_payment_attempt_id is not distinct from v_attempt_id) then
      raise exception 'CARD_PAYMENT_ATTEMPT_ACTIVE' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists parking_stays_guard_card_attempt on public.parking_stays;
create trigger parking_stays_guard_card_attempt
before update of status on public.parking_stays
for each row execute function public.guard_parking_stay_card_attempt();

-- ---------------------------------------------------------------------------
-- 9. Permisos: solo el backend (service_role) ejecuta estas operaciones.
-- ---------------------------------------------------------------------------

revoke all on function public.reserve_pos_card_payment(text, text, uuid, uuid, text, text, uuid, text, text, text, numeric, jsonb, integer) from public, anon, authenticated;
revoke all on function public.mark_pos_card_payment_sent(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.report_pos_card_payment_result(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.register_pos_card_payment(uuid, text, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.regularize_pos_card_payment(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.guard_parking_stay_card_attempt() from public, anon, authenticated;

grant execute on function public.reserve_pos_card_payment(text, text, uuid, uuid, text, text, uuid, text, text, text, numeric, jsonb, integer) to service_role;
grant execute on function public.mark_pos_card_payment_sent(uuid, text, text, text) to service_role;
grant execute on function public.report_pos_card_payment_result(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.register_pos_card_payment(uuid, text, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.regularize_pos_card_payment(uuid, text, text, text, text, text, text, text) to service_role;

comment on table public.pos_card_payment_attempts is
  'Intentos de pago con tarjeta del POS (TUU). Un intento activo por ticket; el pago se registra por intento.';
comment on column public.pos_card_payment_attempts.provider_reference is
  'sequenceNumber informado por TUU. No se asume único fuera de (empresa, ambiente).';
comment on column public.parking_stays.card_payment_attempt_id is
  'Intento de pago con tarjeta que pagó este ticket (único por intento).';
