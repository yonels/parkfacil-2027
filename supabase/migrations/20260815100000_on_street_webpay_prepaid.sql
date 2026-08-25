-- On-Street Webpay prepago. La permanencia nace/crece solo tras commit autorizado.
create extension if not exists pgcrypto;

create table public.on_street_payment_intents (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  qr_location_id uuid not null references public.on_street_qr_locations(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  phone_normalized text not null check (phone_normalized ~ '^\+569[0-9]{8}$'),
  operation_type text not null check (operation_type in ('INITIAL','EXTENSION')),
  target_session_id uuid null references public.on_street_pilot_sessions(id) on delete restrict,
  purchased_minutes integer not null check (purchased_minutes between 1 and 720),
  rate_id uuid not null references public.parking_rates(id) on delete restrict,
  rate_per_minute numeric(14,4) not null check (rate_per_minute > 0),
  amount integer not null check (amount > 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  location_snapshot jsonb not null,
  rate_snapshot jsonb not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT','PAYMENT_PROCESSING','PAID','PAYMENT_FAILED','CANCELLED','EXPIRED')),
  expires_at timestamptz not null,
  paid_at timestamptz null,
  resulting_session_id uuid null references public.on_street_pilot_sessions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((operation_type='INITIAL' and target_session_id is null) or (operation_type='EXTENSION' and target_session_id is not null)),
  check ((status='PAID' and paid_at is not null and resulting_session_id is not null) or status<>'PAID'),
  unique (qr_location_id,idempotency_key)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'TRANSBANK_WEBPAY' check (provider='TRANSBANK_WEBPAY'),
  source_type text not null check (source_type in ('ON_STREET_INITIAL','ON_STREET_EXTENSION')),
  source_id uuid not null references public.on_street_payment_intents(id) on delete restrict,
  amount integer not null check (amount > 0),
  currency text not null default 'CLP' check (currency='CLP'),
  buy_order text not null unique check (buy_order ~ '^[A-Za-z0-9_-]{1,26}$'),
  provider_session_id text not null check (length(provider_session_id) between 1 and 61),
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  token_ws_hash text null unique check (token_ws_hash is null or token_ws_hash ~ '^[a-f0-9]{64}$'),
  token_ws_encrypted text null,
  gateway_url text null,
  status text not null default 'CREATED' check (status in ('CREATED','REDIRECTED','COMMITTING','COMMITTED','REJECTED','ABORTED','FAILED')),
  provider_status text null,
  payment_method text null check (payment_method is null or payment_method in ('CARD')),
  payment_type text null check (payment_type is null or payment_type in ('DEBIT','CREDIT')),
  provider_payment_type_code text null,
  authorization_code text null,
  response_code integer null,
  sanitized_provider_response jsonb null,
  created_at timestamptz not null default clock_timestamp(),
  redirected_at timestamptz null,
  committed_at timestamptz null,
  failed_at timestamptz null,
  updated_at timestamptz not null default clock_timestamp(),
  unique (provider,idempotency_key),
  unique (source_id,buy_order),
  check ((status='REDIRECTED' and token_ws_hash is not null and gateway_url is not null) or status<>'REDIRECTED'),
  check ((status='COMMITTED' and committed_at is not null and response_code=0) or status<>'COMMITTED')
);

alter table public.on_street_pilot_sessions
  add column if not exists amount_paid integer null check (amount_paid is null or amount_paid > 0),
  add column if not exists operational_number text null,
  add column if not exists payment_transaction_id uuid null references public.payment_transactions(id) on delete restrict;

create sequence if not exists public.on_street_session_operational_seq;
revoke all on sequence public.on_street_session_operational_seq from public,anon,authenticated;
grant usage,select on sequence public.on_street_session_operational_seq to service_role;
update public.on_street_pilot_sessions
set operational_number='OS-'||to_char(coalesce(started_at,created_at) at time zone 'America/Santiago','YYYYMMDD')||'-'||lpad(nextval('public.on_street_session_operational_seq')::text,6,'0')
where operational_number is null;

alter table public.on_street_pilot_extensions
  add column if not exists payment_transaction_id uuid null references public.payment_transactions(id) on delete restrict;

create unique index on_street_session_payment_uidx on public.on_street_pilot_sessions(payment_transaction_id) where payment_transaction_id is not null;
create unique index on_street_session_operational_number_uidx on public.on_street_pilot_sessions(operational_number) where operational_number is not null;
create unique index on_street_extension_payment_uidx on public.on_street_pilot_extensions(payment_transaction_id) where payment_transaction_id is not null;
create unique index on_street_intent_result_session_uidx on public.on_street_payment_intents(resulting_session_id) where operation_type='INITIAL' and resulting_session_id is not null;
create index on_street_intents_public_status_idx on public.on_street_payment_intents(public_token,status,expires_at);
create index payment_transactions_source_idx on public.payment_transactions(source_id,created_at desc);
create unique index payment_transactions_one_live_source_uidx on public.payment_transactions(source_id) where status in ('CREATED','REDIRECTED','COMMITTING','COMMITTED');

alter table public.on_street_pilot_extensions drop constraint if exists on_street_pilot_extensions_origin_check;
alter table public.on_street_pilot_extensions add constraint on_street_pilot_extensions_origin_check check(origin in ('PILOT','WEBPAY'));

create or replace function public.create_on_street_payment_transaction(
  p_intent_token uuid,p_idempotency_key text,p_buy_order text,p_provider_session_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.on_street_payment_intents%rowtype; t public.payment_transactions%rowtype;
begin
  select * into i from public.on_street_payment_intents where public_token=p_intent_token for update;
  if not found then raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode='P0002'; end if;
  if i.status='PAID' then raise exception 'PAYMENT_INTENT_ALREADY_PAID' using errcode='23505'; end if;
  if i.expires_at<=clock_timestamp() then
    update public.on_street_payment_intents set status='EXPIRED',updated_at=clock_timestamp() where id=i.id;
    raise exception 'PAYMENT_INTENT_EXPIRED' using errcode='23514';
  end if;
  select * into t from public.payment_transactions where provider='TRANSBANK_WEBPAY' and idempotency_key=p_idempotency_key;
  if found then
    if t.source_id<>i.id then raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('transactionId',t.id,'reused',true);
  end if;
  insert into public.payment_transactions(source_type,source_id,amount,currency,buy_order,provider_session_id,idempotency_key)
  values(case when i.operation_type='INITIAL' then 'ON_STREET_INITIAL' else 'ON_STREET_EXTENSION' end,i.id,i.amount,i.currency,p_buy_order,p_provider_session_id,p_idempotency_key)
  returning * into t;
  update public.on_street_payment_intents set status='PAYMENT_PROCESSING',updated_at=clock_timestamp() where id=i.id;
  return jsonb_build_object('transactionId',t.id,'reused',false);
end $$;

create or replace function public.claim_on_street_webpay_commit(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.payment_transactions%rowtype;
begin
  select * into t from public.payment_transactions where token_ws_hash=p_token_hash for update;
  if not found then raise exception 'PAYMENT_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;
  if t.status='COMMITTED' then return jsonb_build_object('transactionId',t.id,'claimed',false,'completed',true); end if;
  if t.status='COMMITTING' and t.updated_at>clock_timestamp()-interval '30 seconds' then return jsonb_build_object('transactionId',t.id,'claimed',false,'busy',true); end if;
  if t.status='COMMITTING' then
    update public.payment_transactions set updated_at=clock_timestamp() where id=t.id;
    return jsonb_build_object('transactionId',t.id,'claimed',false,'recover',true);
  end if;
  if t.status<>'REDIRECTED' then raise exception 'PAYMENT_TRANSACTION_INVALID_STATE' using errcode='23514'; end if;
  update public.payment_transactions set status='COMMITTING',updated_at=clock_timestamp() where id=t.id;
  return jsonb_build_object('transactionId',t.id,'claimed',true);
end $$;

create or replace function public.finalize_authorized_on_street_payment(
  p_transaction_id uuid,p_provider_status text,p_authorization_code text,p_response_code integer,p_provider_response jsonb,
  p_payment_type text,p_provider_payment_type_code text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.payment_transactions%rowtype; i public.on_street_payment_intents%rowtype; s public.on_street_pilot_sessions%rowtype; v_now timestamptz:=clock_timestamp(); v_previous timestamptz; v_new timestamptz;
begin
  select * into t from public.payment_transactions where id=p_transaction_id for update;
  if not found then raise exception 'PAYMENT_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;
  select * into i from public.on_street_payment_intents where id=t.source_id for update;
  if t.status='COMMITTED' then return jsonb_build_object('transactionId',t.id,'sessionId',i.resulting_session_id,'result','ALREADY_COMMITTED'); end if;
  if t.status<>'COMMITTING' or p_response_code<>0 or upper(coalesce(p_provider_status,''))<>'AUTHORIZED' then raise exception 'PAYMENT_NOT_AUTHORIZED' using errcode='23514'; end if;
  if p_payment_type not in ('DEBIT','CREDIT') then raise exception 'PAYMENT_TYPE_INVALID' using errcode='23514'; end if;
  if i.status='PAID' then raise exception 'PAYMENT_INTENT_ALREADY_PAID' using errcode='23505'; end if;
  if i.operation_type='INITIAL' then
    insert into public.on_street_pilot_sessions(qr_location_id,parking_id,phone_normalized,status,started_at,purchased_minutes,rate_id,rate_per_minute,simulated_amount,amount_paid,expires_at,payment_transaction_id,operational_number,created_at,updated_at)
    values(i.qr_location_id,i.parking_id,i.phone_normalized,'ACTIVE',v_now,i.purchased_minutes,i.rate_id,i.rate_per_minute,i.amount,i.amount,v_now+i.purchased_minutes*interval '1 minute',t.id,'OS-'||to_char(v_now at time zone 'America/Santiago','YYYYMMDD')||'-'||lpad(nextval('public.on_street_session_operational_seq')::text,6,'0'),v_now,v_now)
    returning * into s;
  else
    select * into s from public.on_street_pilot_sessions where id=i.target_session_id for update;
    if not found or s.status<>'ACTIVE' then raise exception 'PILOT_SESSION_NOT_ACTIVE' using errcode='23514'; end if;
    v_previous:=s.expires_at; v_new:=greatest(s.expires_at,v_now)+i.purchased_minutes*interval '1 minute';
    insert into public.on_street_pilot_extensions(session_id,additional_minutes,rate_id,rate_per_minute,simulated_amount,previous_expires_at,new_expires_at,origin,payment_transaction_id)
    values(s.id,i.purchased_minutes,i.rate_id,i.rate_per_minute,i.amount,v_previous,v_new,'WEBPAY',t.id);
    update public.on_street_pilot_sessions set purchased_minutes=purchased_minutes+i.purchased_minutes,simulated_amount=simulated_amount+i.amount,amount_paid=coalesce(amount_paid,simulated_amount)+i.amount,expires_at=v_new,updated_at=v_now where id=s.id returning * into s;
  end if;
  update public.payment_transactions set status='COMMITTED',provider_status=left(p_provider_status,40),authorization_code=left(p_authorization_code,64),response_code=p_response_code,payment_method='CARD',payment_type=p_payment_type,provider_payment_type_code=left(p_provider_payment_type_code,8),sanitized_provider_response=p_provider_response,committed_at=v_now,updated_at=v_now where id=t.id;
  update public.on_street_payment_intents set status='PAID',paid_at=v_now,resulting_session_id=s.id,updated_at=v_now where id=i.id;
  return jsonb_build_object('transactionId',t.id,'sessionId',s.id,'sessionToken',s.public_token,'result','COMMITTED');
end $$;

alter table public.on_street_payment_intents enable row level security;
alter table public.payment_transactions enable row level security;
revoke all on public.on_street_payment_intents,public.payment_transactions from public,anon,authenticated;
grant select,insert,update on public.on_street_payment_intents,public.payment_transactions to service_role;
revoke all on function public.create_on_street_payment_transaction(uuid,text,text,text),public.claim_on_street_webpay_commit(text),public.finalize_authorized_on_street_payment(uuid,text,text,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_on_street_payment_transaction(uuid,text,text,text),public.claim_on_street_webpay_commit(text),public.finalize_authorized_on_street_payment(uuid,text,text,integer,jsonb,text,text) to service_role;
