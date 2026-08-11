-- Etapa 7A: movimientos externos y conciliación manual many-to-many.
create table public.billing_external_movements (
  id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id) on update cascade on delete restrict,
  source_type text not null check(source_type in ('BANK_TRANSFER','WEBPAY_SETTLEMENT','MANUAL','OTHER')), source_name text not null,
  external_reference text not null, external_date date not null, amount numeric(18,2) not null check(amount>0), currency text not null check(currency in ('CLP','USD')),
  description text not null default '', payer_name text null, payer_identifier text null, raw_reference text null,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','IGNORED')), created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  unique(company_id,source_type,external_reference,external_date,amount,currency)
);
create index billing_external_movements_scope_idx on public.billing_external_movements(company_id,external_date,status,currency,source_type);
alter table public.billing_external_movements enable row level security;
revoke all on public.billing_external_movements from public,anon,authenticated; grant select,insert on public.billing_external_movements to service_role;

create table public.billing_reconciliations (
  id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id) on update cascade on delete restrict,
  external_movement_id uuid not null references public.billing_external_movements(id) on delete restrict,
  internal_movement_id uuid not null references public.billing_account_movements(id) on delete restrict,
  matched_amount numeric(18,2) not null check(matched_amount>0), currency text not null check(currency in ('CLP','USD')),
  match_type text not null check(match_type in ('MANUAL','EXACT','REFERENCE','AMOUNT_DATE')), confidence text not null check(confidence in ('HIGH','MEDIUM','LOW')),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','REVERSED')), idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), confirmed_at timestamptz not null default now(), confirmed_by uuid not null references auth.users(id) on delete restrict,
  reversed_at timestamptz null, reversed_by uuid null references auth.users(id) on delete restrict, reversal_reason text null,
  unique(company_id,idempotency_key),
  check((status='ACTIVE' and reversed_at is null and reversed_by is null and reversal_reason is null) or (status='REVERSED' and reversed_at is not null and reversed_by is not null and length(trim(reversal_reason)) between 1 and 1000))
);
create index billing_reconciliations_external_idx on public.billing_reconciliations(company_id,external_movement_id,status,created_at);
create index billing_reconciliations_internal_idx on public.billing_reconciliations(company_id,internal_movement_id,status,created_at);
alter table public.billing_reconciliations enable row level security;
revoke all on public.billing_reconciliations from public,anon,authenticated; grant select on public.billing_reconciliations to service_role;

alter table public.billing_audit_events drop constraint if exists billing_audit_events_action_check;
alter table public.billing_audit_events add constraint billing_audit_events_action_check check(action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL','REVIEW_STARTED','COMMENT_ADDED','ADJUSTMENT_ADDED','ADJUSTMENT_REMOVED','RECALCULATED','APPROVED','MARKED_READY_TO_ISSUE','CANCELLED','ISSUE_REQUESTED','ISSUE_STARTED','UF_FINALIZED','PROVIDER_REQUEST_SENT','PROVIDER_PENDING','PROVIDER_ACCEPTED','PROVIDER_REJECTED','ISSUE_FAILED','STATUS_REFRESHED','ACCOUNT_MOVEMENT_CREATED','PAYMENT_APPLICATION_CREATED','PAYMENT_APPLICATION_REVERSED','PAYMENT_REVERSAL_CREATED','EXTERNAL_MOVEMENT_CREATED','EXTERNAL_MOVEMENT_IMPORTED','RECONCILIATION_CREATED','RECONCILIATION_REVERSED'));

create or replace function public.billing_reconciliation_immutable_guard() returns trigger language plpgsql as $$ begin
  if tg_op='DELETE' then raise exception 'BILLING_RECONCILIATION_IMMUTABLE' using errcode='23514'; end if;
  if old.status<>'ACTIVE' or new.status<>'REVERSED' or row(new.company_id,new.external_movement_id,new.internal_movement_id,new.matched_amount,new.currency,new.match_type,new.confidence,new.idempotency_key,new.created_by,new.created_at,new.confirmed_at,new.confirmed_by) is distinct from row(old.company_id,old.external_movement_id,old.internal_movement_id,old.matched_amount,old.currency,old.match_type,old.confidence,old.idempotency_key,old.created_by,old.created_at,old.confirmed_at,old.confirmed_by) then raise exception 'BILLING_RECONCILIATION_IMMUTABLE' using errcode='23514'; end if; return new;
end $$;
create trigger billing_reconciliation_immutable_guard before update or delete on public.billing_reconciliations for each row execute function public.billing_reconciliation_immutable_guard();

create or replace function public.billing_confirm_reconciliation(p_company_id text,p_external_movement_id uuid,p_internal_movement_id uuid,p_matched_amount numeric,p_match_type text,p_confidence text,p_idempotency_key text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ext public.billing_external_movements%rowtype; intm public.billing_account_movements%rowtype; existing public.billing_reconciliations%rowtype; rec public.billing_reconciliations%rowtype; ext_used numeric(18,2); int_used numeric(18,2);
begin
  if p_matched_amount is null or p_matched_amount<=0 then raise exception 'RECONCILIATION_AMOUNT_INVALID' using errcode='22023'; end if;
  if p_match_type not in ('MANUAL','EXACT','REFERENCE','AMOUNT_DATE') or p_confidence not in ('HIGH','MEDIUM','LOW') then raise exception 'RECONCILIATION_CLASSIFICATION_INVALID' using errcode='22023'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 120 then raise exception 'RECONCILIATION_IDEMPOTENCY_INVALID' using errcode='22023'; end if;
  select * into existing from public.billing_reconciliations where company_id=p_company_id and idempotency_key=p_idempotency_key; if found then return jsonb_build_object('reconciliationId',existing.id,'reused',true); end if;
  select * into ext from public.billing_external_movements where id=p_external_movement_id for update;
  if not found or ext.company_id<>p_company_id or ext.status<>'ACTIVE' then raise exception 'EXTERNAL_MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  select * into intm from public.billing_account_movements where id=p_internal_movement_id for update;
  if not found or intm.company_id<>p_company_id or intm.status<>'POSTED' or intm.movement_type<>'PAYMENT' then raise exception 'INTERNAL_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if ext.currency<>intm.currency then raise exception 'RECONCILIATION_CURRENCY_MISMATCH' using errcode='23514'; end if;
  select coalesce(sum(matched_amount),0) into ext_used from public.billing_reconciliations where external_movement_id=ext.id and status='ACTIVE';
  select coalesce(sum(matched_amount),0) into int_used from public.billing_reconciliations where internal_movement_id=intm.id and status='ACTIVE';
  if p_matched_amount>ext.amount-ext_used then raise exception 'RECONCILIATION_EXCEEDS_EXTERNAL_AVAILABLE' using errcode='23514'; end if;
  if p_matched_amount>intm.credit_amount-int_used then raise exception 'RECONCILIATION_EXCEEDS_INTERNAL_AVAILABLE' using errcode='23514'; end if;
  select * into existing from public.billing_reconciliations where company_id=p_company_id and idempotency_key=p_idempotency_key; if found then return jsonb_build_object('reconciliationId',existing.id,'reused',true); end if;
  insert into public.billing_reconciliations(company_id,external_movement_id,internal_movement_id,matched_amount,currency,match_type,confidence,idempotency_key,created_by,confirmed_by) values(p_company_id,ext.id,intm.id,p_matched_amount,ext.currency,p_match_type,p_confidence,p_idempotency_key,p_actor_id,p_actor_id) returning * into rec;
  insert into public.billing_audit_events(company_id,action,actor_id,new_value) values(p_company_id,'RECONCILIATION_CREATED',p_actor_id,jsonb_build_object('reconciliationId',rec.id,'externalMovementId',ext.id,'internalMovementId',intm.id,'amount',p_matched_amount,'currency',ext.currency,'matchType',p_match_type,'confidence',p_confidence));
  return jsonb_build_object('reconciliationId',rec.id,'reused',false,'externalAvailable',ext.amount-ext_used-p_matched_amount,'internalAvailable',intm.credit_amount-int_used-p_matched_amount);
end $$;

create or replace function public.billing_reverse_reconciliation(p_company_id text,p_reconciliation_id uuid,p_reason text,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.billing_reconciliations%rowtype;
begin
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'RECONCILIATION_REVERSAL_REASON_REQUIRED' using errcode='22023'; end if;
  select * into rec from public.billing_reconciliations where id=p_reconciliation_id for update;
  if not found or rec.company_id<>p_company_id then raise exception 'RECONCILIATION_NOT_FOUND' using errcode='P0002'; end if;
  if rec.status='REVERSED' then return jsonb_build_object('reconciliationId',rec.id,'reused',true); end if;
  perform 1 from public.billing_external_movements where id=rec.external_movement_id for update; perform 1 from public.billing_account_movements where id=rec.internal_movement_id for update;
  update public.billing_reconciliations set status='REVERSED',reversed_at=now(),reversed_by=p_actor_id,reversal_reason=trim(p_reason) where id=rec.id;
  insert into public.billing_audit_events(company_id,action,actor_id,reason,new_value) values(p_company_id,'RECONCILIATION_REVERSED',p_actor_id,trim(p_reason),jsonb_build_object('reconciliationId',rec.id,'externalMovementId',rec.external_movement_id,'internalMovementId',rec.internal_movement_id,'amount',rec.matched_amount));
  return jsonb_build_object('reconciliationId',rec.id,'reused',false,'status','REVERSED');
end $$;
revoke all on function public.billing_confirm_reconciliation(text,uuid,uuid,numeric,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.billing_reverse_reconciliation(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.billing_confirm_reconciliation(text,uuid,uuid,numeric,text,text,text,uuid) to service_role;
grant execute on function public.billing_reverse_reconciliation(text,uuid,text,uuid) to service_role;

create or replace function public.billing_create_external_movement(p_company_id text,p_source_type text,p_source_name text,p_external_reference text,p_external_date date,p_amount numeric,p_currency text,p_description text,p_payer_name text,p_payer_identifier text,p_raw_reference text,p_actor_id uuid,p_imported boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ext public.billing_external_movements%rowtype;
begin
  if p_source_type not in ('BANK_TRANSFER','WEBPAY_SETTLEMENT','MANUAL','OTHER') or p_external_date is null or p_amount is null or p_amount<=0 or p_currency not in ('CLP','USD') or length(trim(coalesce(p_external_reference,'')))<1 or length(trim(coalesce(p_source_name,'')))<1 then raise exception 'EXTERNAL_MOVEMENT_INPUT_INVALID' using errcode='22023'; end if;
  select * into ext from public.billing_external_movements where company_id=p_company_id and source_type=p_source_type and external_reference=trim(p_external_reference) and external_date=p_external_date and amount=p_amount and currency=p_currency;
  if found then return jsonb_build_object('externalMovementId',ext.id,'reused',true); end if;
  insert into public.billing_external_movements(company_id,source_type,source_name,external_reference,external_date,amount,currency,description,payer_name,payer_identifier,raw_reference,created_by)
  values(p_company_id,p_source_type,trim(p_source_name),trim(p_external_reference),p_external_date,p_amount,p_currency,trim(coalesce(p_description,'')),nullif(trim(coalesce(p_payer_name,'')),''),nullif(trim(coalesce(p_payer_identifier,'')),''),nullif(trim(coalesce(p_raw_reference,'')),''),p_actor_id) returning * into ext;
  insert into public.billing_audit_events(company_id,action,actor_id,new_value) values(p_company_id,case when p_imported then 'EXTERNAL_MOVEMENT_IMPORTED' else 'EXTERNAL_MOVEMENT_CREATED' end,p_actor_id,jsonb_build_object('externalMovementId',ext.id,'sourceType',ext.source_type,'externalReference',ext.external_reference,'date',ext.external_date,'amount',ext.amount,'currency',ext.currency));
  return jsonb_build_object('externalMovementId',ext.id,'reused',false);
exception when unique_violation then select * into ext from public.billing_external_movements where company_id=p_company_id and source_type=p_source_type and external_reference=trim(p_external_reference) and external_date=p_external_date and amount=p_amount and currency=p_currency; return jsonb_build_object('externalMovementId',ext.id,'reused',true);
end $$;
revoke all on function public.billing_create_external_movement(text,text,text,text,date,numeric,text,text,text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_create_external_movement(text,text,text,text,date,numeric,text,text,text,text,text,uuid,boolean) to service_role;
