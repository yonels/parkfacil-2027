create table public.webpay_stay_quotes (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.parking_stays(id) on delete restrict,
  stay_updated_at timestamptz not null,
  calculated_at timestamptz not null,
  rate_id uuid not null references public.parking_rates(id) on delete restrict,
  rate_updated_at timestamptz not null,
  rate_blocks_snapshot jsonb not null default '[]'::jsonb,
  elapsed_minutes integer not null check (elapsed_minutes >= 0),
  rate_name text not null,
  billing_mode text not null,
  subtotal_amount integer not null check (subtotal_amount >= 0),
  discount_amount integer not null check (discount_amount >= 0),
  net_amount integer not null check (net_amount >= 0),
  tax_amount integer not null check (tax_amount >= 0),
  total_amount integer not null check (total_amount > 0),
  consumed_at timestamptz null,
  payment_code text null,
  created_at timestamptz not null default now(),
  check (discount_amount <= subtotal_amount),
  check (subtotal_amount - discount_amount = total_amount),
  check (net_amount + tax_amount = total_amount),
  check ((consumed_at is null and payment_code is null) or (consumed_at is not null and payment_code is not null))
);

create index webpay_stay_quotes_stay_idx on public.webpay_stay_quotes(stay_id,calculated_at desc);
alter table public.webpay_stay_quotes enable row level security;
revoke all on public.webpay_stay_quotes from public,anon,authenticated;

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
  if v_rate.updated_at is distinct from p_rate_updated_at or v_rate.status<>'ACTIVE'
     or v_rate.valid_from>p_calculated_at or (v_rate.valid_until is not null and v_rate.valid_until<=p_calculated_at)
  then raise exception 'STALE_QUOTE' using errcode='40001'; end if;

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

create or replace function public.accredit_webpay_parking_stay(p_stay_id uuid,p_quote_id uuid,p_buy_order text,p_amount integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stay public.parking_stays%rowtype; v_quote public.webpay_stay_quotes%rowtype;
begin
  if p_stay_id is null or p_quote_id is null then raise exception 'INVALID_ARGUMENT' using errcode='22023'; end if;
  if nullif(trim(p_buy_order),'') is null then raise exception 'INVALID_PAYMENT_REFERENCE' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'AMOUNT_MISMATCH' using errcode='22023'; end if;
  select * into v_stay from public.parking_stays where id=p_stay_id for update;
  if not found then raise exception 'STAY_NOT_FOUND' using errcode='P0002'; end if;
  if v_stay.status='PAID' then
    if v_stay.payment_code=p_buy_order and v_stay.total_amount=p_amount then return jsonb_build_object('success',true,'result','ALREADY_PAID','stayId',v_stay.id,'paymentCode',v_stay.payment_code); end if;
    raise exception 'PAYMENT_CONFLICT' using errcode='23505';
  end if;
  if v_stay.status<>'OPEN' then raise exception 'INVALID_STATE' using errcode='23514'; end if;
  select * into v_quote from public.webpay_stay_quotes where id=p_quote_id and stay_id=v_stay.id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND' using errcode='P0002'; end if;
  if v_quote.consumed_at is not null then raise exception 'PAYMENT_CONFLICT' using errcode='23505'; end if;
  if v_stay.updated_at is distinct from v_quote.stay_updated_at then raise exception 'STALE_QUOTE' using errcode='40001'; end if;
  if p_amount<>v_quote.total_amount then raise exception 'AMOUNT_MISMATCH' using errcode='22023'; end if;

  update public.parking_stays set status='PAID',exit_at=v_quote.calculated_at,elapsed_minutes=v_quote.elapsed_minutes,rate_id=v_quote.rate_id,rate_name=v_quote.rate_name,billing_mode=v_quote.billing_mode,subtotal_amount=v_quote.subtotal_amount,discount_amount=v_quote.discount_amount,coupon_id=null,coupon_code=null,net_amount=v_quote.net_amount,tax_amount=v_quote.tax_amount,total_amount=v_quote.total_amount,payment_method='CARD',payment_code=p_buy_order,updated_at=clock_timestamp() where id=v_stay.id;
  update public.webpay_stay_quotes set consumed_at=clock_timestamp(),payment_code=p_buy_order where id=v_quote.id;
  return jsonb_build_object('success',true,'result','PAID','stayId',v_stay.id,'paymentCode',p_buy_order);
end;
$$;

do $permissions$
declare
  rpc record;
  rpc_identity regprocedure;
begin
  for rpc in
    select * from (values
      ('create_webpay_stay_quote',15),
      ('accredit_webpay_parking_stay',4)
    ) as expected(name,nargs)
  loop
    select p.oid::regprocedure into strict rpc_identity
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=rpc.name and p.pronargs=rpc.nargs;

    execute format('revoke all on function %s from public,anon,authenticated',rpc_identity);
    execute format('grant execute on function %s to service_role',rpc_identity);
  end loop;
end
$permissions$;
