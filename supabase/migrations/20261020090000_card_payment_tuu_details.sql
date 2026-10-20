-- Pago con tarjeta: tipo de venta y últimos 4 dígitos informados por TUU
-- (QA PRO2 2026-10-20, SOL-2026-10-11-001).
--
-- Decisión del usuario: si el tipo de venta que informa TUU (transactionMethod)
-- difiere del botón elegido en el POS, prevalece TUU. Se guardan ambos:
-- - payment_card_type   = tipo efectivo (TUU si viene, si no el elegido);
-- - card_type_selected  = tipo elegido en el POS (el del intento reservado);
-- - card_last4          = últimos 4 dígitos de la tarjeta según TUU.
-- No cambia montos ni estados: solo amplía register_pos_card_payment.

alter table public.parking_stays
  add column if not exists card_last4 text null,
  add column if not exists card_type_selected text null;

alter table public.parking_stays drop constraint if exists parking_stays_card_last4_check;
alter table public.parking_stays add constraint parking_stays_card_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
alter table public.parking_stays drop constraint if exists parking_stays_card_type_selected_check;
alter table public.parking_stays add constraint parking_stays_card_type_selected_check check (card_type_selected is null or card_type_selected in ('CREDIT', 'DEBIT'));

comment on column public.parking_stays.card_last4 is 'Pago con tarjeta: últimos 4 dígitos informados por TUU (last4).';
comment on column public.parking_stays.card_type_selected is 'Pago con tarjeta: tipo elegido en el POS. payment_card_type guarda el que informó TUU cuando difiere.';

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
  v_card_type text;
  v_last4 text;
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

  -- Tipo de venta: el que informa TUU prevalece sobre el elegido (si es válido).
  v_card_type := case when p_payment->>'payment_card_type' in ('CREDIT', 'DEBIT') then p_payment->>'payment_card_type' else v_attempt.card_type end;
  v_last4 := case when coalesce(p_payment->>'card_last4', '') ~ '^[0-9]{4}$' then p_payment->>'card_last4' else null end;

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
    payment_card_type = v_card_type,
    card_type_selected = v_attempt.card_type,
    card_last4 = v_last4,
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

revoke all on function public.register_pos_card_payment(uuid, text, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_pos_card_payment(uuid, text, uuid, text, uuid, jsonb) to service_role;
