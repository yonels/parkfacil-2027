-- Preparada localmente. No reactiva tarifas ni recalcula tickets existentes.
begin;
alter table public.parking_rates add column closing_debt_enabled boolean not null default false;
alter table public.parking_rates drop constraint parking_rates_overnight_flat_amount_check;
alter table public.parking_rates add constraint parking_rates_overnight_flat_amount_check check (
  (not closing_debt_enabled and (overnight_flat_amount is null or overnight_flat_amount = 0))
  or (closing_debt_enabled and billing_mode = 'EFFECTIVE_MINUTE'
      and regular_start_time is not null and regular_end_time is not null
      and regular_start_time <> regular_end_time
      and overnight_flat_amount is not null and overnight_flat_amount >= 0
      and overnight_flat_amount = trunc(overnight_flat_amount))
);
comment on column public.parking_rates.closing_debt_enabled is
  'Minutos hasta primer cierre + una sola noche. Monto sin nuevos cargos hasta pago.';
comment on column public.parking_rates.overnight_flat_amount is
  'Con closing_debt_enabled: cargo único al primer cierre, nunca se repite.';

-- Preservar importes y horario aun cuando se finalice/reemplace el plan.
create or replace function public.pf_preserve_closing_rate()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.closing_debt_enabled and old.status <> 'DRAFT' and new.status = 'DRAFT' then
    raise exception 'CLOSING_RATE_IMMUTABLE: cannot return to draft' using errcode='23514';
  end if;
  if old.closing_debt_enabled and (old.status <> 'DRAFT' or exists (
    select 1 from public.parking_stays where rate_id = old.id
  )) and (to_jsonb(new) - array['status','valid_until','updated_at','notes'])
    is distinct from (to_jsonb(old) - array['status','valid_until','updated_at','notes']) then
    raise exception 'CLOSING_RATE_IMMUTABLE: create a new version' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.pf_preserve_closing_rate() from public, anon, authenticated;
create trigger preserve_closing_rate before update on public.parking_rates
for each row execute function public.pf_preserve_closing_rate();

-- Todos los canales de ingreso guardan la misma referencia al plan del ticket.
create or replace function public.pf_assign_closing_rate()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare r public.parking_rates%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.rate_id is not null and exists (
      select 1 from public.parking_rates where id=old.rate_id and closing_debt_enabled
    ) and (new.rate_id is distinct from old.rate_id or new.entry_at is distinct from old.entry_at
      or new.parking_id is distinct from old.parking_id) then
      raise exception 'CLOSING_TICKET_IMMUTABLE' using errcode='23514';
    end if;
    return new;
  end if;
  if new.rate_id is null then
    select * into r from public.parking_rates
    where parking_id=new.parking_id and status='ACTIVE' and valid_from<=new.entry_at
      and (valid_until is null or valid_until>new.entry_at)
    order by created_at desc, id limit 1 for share;
    if found and r.closing_debt_enabled then
      new.rate_id := r.id;
      new.rate_name := r.name;
      new.billing_mode := r.billing_mode;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.pf_assign_closing_rate() from public, anon, authenticated;
create trigger assign_closing_rate before insert or update on public.parking_stays
for each row execute function public.pf_assign_closing_rate();

-- Webpay mantiene firma, bloqueo de fila y control de importe. Para la nueva
-- política acepta el plan original aunque su vigencia haya terminado después.
create or replace function public.create_webpay_stay_quote(
  p_stay_id uuid,
  p_stay_updated_at timestamptz,
  p_calculated_at timestamptz,
  p_rate_id uuid,
  p_rate_updated_at timestamptz,
  p_rate_blocks_snapshot jsonb,
  p_elapsed_minutes integer,
  p_rate_name text,
  p_billing_mode text,
  p_subtotal_amount integer,
  p_discount_amount integer,
  p_net_amount integer,
  p_tax_amount integer,
  p_total_amount integer,
  p_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stay public.parking_stays%rowtype;
  v_rate public.parking_rates%rowtype;
  v_blocks jsonb;
  v_blocks_canonical text;
  v_evidence_payload text;
  v_expected_evidence text;
  v_signing_secret text;
  v_quote_id uuid;
begin
  if p_stay_id is null or p_stay_updated_at is null or p_calculated_at is null
     or p_rate_id is null or p_rate_updated_at is null or p_rate_blocks_snapshot is null
     or p_elapsed_minutes is null or p_rate_name is null or p_billing_mode is null
     or p_subtotal_amount is null or p_discount_amount is null or p_net_amount is null
     or p_tax_amount is null or p_total_amount is null or p_evidence is null
  then raise exception 'INVALID_ARGUMENT' using errcode='22023'; end if;

  select decrypted_secret into v_signing_secret
  from vault.decrypted_secrets
  where name='webpay_quote_hmac_secret';
  if v_signing_secret is null or octet_length(v_signing_secret)<32 then raise exception 'QUOTE_SIGNING_SECRET_NOT_CONFIGURED' using errcode='55000'; end if;

  select * into v_stay from public.parking_stays where id=p_stay_id for update;
  if not found then raise exception 'STAY_NOT_FOUND' using errcode='P0002'; end if;
  if v_stay.status<>'OPEN' then raise exception 'INVALID_STATE' using errcode='23514'; end if;
  if v_stay.updated_at is distinct from p_stay_updated_at then raise exception 'STALE_QUOTE' using errcode='40001'; end if;
  if p_calculated_at<v_stay.entry_at or p_calculated_at>clock_timestamp()+interval '1 minute' then raise exception 'INVALID_QUOTE_TIME' using errcode='22023'; end if;

  select * into v_rate from public.parking_rates where id=p_rate_id and parking_id=v_stay.parking_id for share;
  if not found then raise exception 'STALE_QUOTE' using errcode='40001'; end if;
  if v_rate.updated_at is distinct from p_rate_updated_at then
    raise exception 'STALE_QUOTE' using errcode='40001';
  end if;
  if v_rate.closing_debt_enabled then
    if v_stay.rate_id is not null and v_stay.rate_id <> v_rate.id then
      raise exception 'STALE_QUOTE' using errcode='40001';
    end if;
    if v_stay.rate_id is null and (v_rate.status not in ('ACTIVE','ENDED')
      or v_rate.valid_from > v_stay.entry_at
      or (v_rate.valid_until is not null and v_rate.valid_until <= v_stay.entry_at)) then
      raise exception 'STALE_QUOTE' using errcode='40001';
    end if;
  elsif v_rate.status <> 'ACTIVE' or v_rate.valid_from > p_calculated_at
    or (v_rate.valid_until is not null and v_rate.valid_until <= p_calculated_at) then
    raise exception 'STALE_QUOTE' using errcode='40001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'sequence',b.sequence,'durationSeconds',b.duration_seconds,'amount',b.amount,'repeatAfter',b.repeat_after) order by b.sequence),'[]'::jsonb)
  into v_blocks from public.parking_rate_blocks b where b.rate_id=v_rate.id;
  if v_blocks is distinct from coalesce(p_rate_blocks_snapshot,'[]'::jsonb) then raise exception 'STALE_QUOTE' using errcode='40001'; end if;

  select coalesce(string_agg(
    lower(e->>'id')||','||((e->>'sequence')::integer)::text||','||
    ((e->>'durationSeconds')::integer)::text||','||((e->>'amount')::numeric)::text||','||
    lower(((e->>'repeatAfter')::boolean)::text), ';' order by ord
  ),'') into v_blocks_canonical
  from jsonb_array_elements(p_rate_blocks_snapshot) with ordinality as x(e,ord);

  v_evidence_payload := concat_ws('|',
    'WEBPAY_STAY_QUOTE_V1', lower(p_stay_id::text),
    to_char(p_stay_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    to_char(p_calculated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    lower(p_rate_id::text),
    to_char(p_rate_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    encode(convert_to(p_rate_name,'UTF8'),'hex'), encode(convert_to(p_billing_mode,'UTF8'),'hex'),
    v_blocks_canonical, p_elapsed_minutes::text, p_subtotal_amount::text,
    p_discount_amount::text, p_net_amount::text, p_tax_amount::text, p_total_amount::text
  );
  v_expected_evidence := encode(extensions.hmac(v_evidence_payload,v_signing_secret,'sha256'),'hex');
  if lower(p_evidence) is distinct from v_expected_evidence then raise exception 'INVALID_QUOTE_EVIDENCE' using errcode='28000'; end if;

  if p_elapsed_minutes<>greatest(0,floor(extract(epoch from (p_calculated_at-v_stay.entry_at))/60)::integer)
     or p_total_amount<=0 or p_discount_amount<0 or p_discount_amount>p_subtotal_amount
     or p_subtotal_amount-p_discount_amount<>p_total_amount or p_net_amount+p_tax_amount<>p_total_amount
  then raise exception 'INVALID_QUOTE_BREAKDOWN' using errcode='23514'; end if;
  if p_rate_name is distinct from v_rate.name or p_billing_mode is distinct from v_rate.billing_mode then raise exception 'STALE_QUOTE' using errcode='40001'; end if;

  insert into public.webpay_stay_quotes(stay_id,stay_updated_at,calculated_at,rate_id,rate_updated_at,rate_blocks_snapshot,elapsed_minutes,rate_name,billing_mode,subtotal_amount,discount_amount,net_amount,tax_amount,total_amount)
  values(v_stay.id,v_stay.updated_at,p_calculated_at,v_rate.id,v_rate.updated_at,v_blocks,p_elapsed_minutes,v_rate.name,v_rate.billing_mode,p_subtotal_amount,p_discount_amount,p_net_amount,p_tax_amount,p_total_amount)
  returning id into v_quote_id;
  return v_quote_id;
end;
$$;


commit;
