-- Etapa 6: aplicación atómica y reversible de créditos a documentos.
create table public.billing_payment_applications (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  source_movement_id uuid not null references public.billing_account_movements(id) on delete restrict,
  source_type text not null check (source_type in ('PAYMENT','CREDIT_NOTE')),
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency in ('CLP','USD')),
  application_date date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVERSED')),
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz null,
  reversed_by uuid null references auth.users(id) on delete restrict,
  reversal_reason text null,
  unique (company_id,idempotency_key),
  check ((status='ACTIVE' and reversed_at is null and reversed_by is null and reversal_reason is null) or
         (status='REVERSED' and reversed_at is not null and reversed_by is not null and length(trim(reversal_reason)) between 1 and 1000))
);
create index billing_payment_applications_source_idx on public.billing_payment_applications(company_id,source_movement_id,status,created_at);
create index billing_payment_applications_document_idx on public.billing_payment_applications(company_id,document_id,status,created_at);
alter table public.billing_payment_applications enable row level security;
revoke all on public.billing_payment_applications from public,anon,authenticated;
grant select on public.billing_payment_applications to service_role;

alter table public.billing_audit_events drop constraint if exists billing_audit_events_action_check;
alter table public.billing_audit_events add constraint billing_audit_events_action_check check(action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL','REVIEW_STARTED','COMMENT_ADDED','ADJUSTMENT_ADDED','ADJUSTMENT_REMOVED','RECALCULATED','APPROVED','MARKED_READY_TO_ISSUE','CANCELLED','ISSUE_REQUESTED','ISSUE_STARTED','UF_FINALIZED','PROVIDER_REQUEST_SENT','PROVIDER_PENDING','PROVIDER_ACCEPTED','PROVIDER_REJECTED','ISSUE_FAILED','STATUS_REFRESHED','ACCOUNT_MOVEMENT_CREATED','PAYMENT_APPLICATION_CREATED','PAYMENT_APPLICATION_REVERSED','PAYMENT_REVERSAL_CREATED'));

create or replace function public.billing_application_immutable_guard() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'BILLING_APPLICATION_IMMUTABLE' using errcode='23514'; end if;
  if tg_op='UPDATE' and (old.status<>'ACTIVE' or new.status<>'REVERSED' or
    row(new.company_id,new.source_movement_id,new.source_type,new.document_id,new.amount,new.currency,new.application_date,new.idempotency_key,new.created_by,new.created_at)
    is distinct from row(old.company_id,old.source_movement_id,old.source_type,old.document_id,old.amount,old.currency,old.application_date,old.idempotency_key,old.created_by,old.created_at))
  then raise exception 'BILLING_APPLICATION_IMMUTABLE' using errcode='23514'; end if;
  return new;
end $$;
create trigger billing_application_immutable_guard before update or delete on public.billing_payment_applications for each row execute function public.billing_application_immutable_guard();

create or replace function public.billing_apply_credit(
  p_company_id text,p_source_movement_id uuid,p_document_id uuid,p_amount numeric,p_application_date date,p_idempotency_key text,p_actor_id uuid,p_source_type text default 'PAYMENT'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare src public.billing_account_movements%rowtype; doc public.billing_documents%rowtype; existing public.billing_payment_applications%rowtype; app public.billing_payment_applications%rowtype; used numeric(18,2); applied numeric(18,2); source_total numeric(18,2); document_total numeric(18,2); effective_currency text;
begin
  if p_amount is null or p_amount<=0 then raise exception 'APPLICATION_AMOUNT_INVALID' using errcode='22023'; end if;
  if p_application_date is null then raise exception 'APPLICATION_DATE_INVALID' using errcode='22023'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 120 then raise exception 'APPLICATION_IDEMPOTENCY_INVALID' using errcode='22023'; end if;
  if p_source_type not in ('PAYMENT','CREDIT_NOTE') then raise exception 'APPLICATION_SOURCE_INVALID' using errcode='22023'; end if;
  select * into existing from public.billing_payment_applications where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('applicationId',existing.id,'reused',true); end if;
  select * into src from public.billing_account_movements where id=p_source_movement_id for update;
  if not found or src.company_id<>p_company_id or src.status<>'POSTED' or src.movement_type<>p_source_type or src.credit_amount<=0 then raise exception 'APPLICATION_SOURCE_NOT_FOUND' using errcode='P0002'; end if;
  select * into doc from public.billing_documents where id=p_document_id for update;
  if not found or doc.company_id<>p_company_id then raise exception 'APPLICATION_DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
  if doc.status<>'ISSUED' or doc.document_type not in ('INVOICE','DEBIT_NOTE') then raise exception 'APPLICATION_DOCUMENT_INVALID' using errcode='23514'; end if;
  effective_currency:=case when doc.currency='UF' then 'CLP' else doc.currency end;
  document_total:=case when doc.currency='UF' then doc.converted_amount_clp else doc.total_amount end;
  if src.currency<>effective_currency then raise exception 'APPLICATION_CURRENCY_MISMATCH' using errcode='23514'; end if;
  select coalesce(sum(amount),0) into used from public.billing_payment_applications where source_movement_id=src.id and status='ACTIVE';
  select coalesce(sum(amount),0) into applied from public.billing_payment_applications where document_id=doc.id and status='ACTIVE';
  source_total:=src.credit_amount;
  if p_amount>source_total-used then raise exception 'APPLICATION_EXCEEDS_SOURCE_AVAILABLE' using errcode='23514'; end if;
  if p_amount>document_total-applied then raise exception 'APPLICATION_EXCEEDS_DOCUMENT_BALANCE' using errcode='23514'; end if;
  select * into existing from public.billing_payment_applications where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('applicationId',existing.id,'reused',true); end if;
  insert into public.billing_payment_applications(company_id,source_movement_id,source_type,document_id,amount,currency,application_date,idempotency_key,created_by)
  values(p_company_id,src.id,p_source_type,doc.id,p_amount,src.currency,p_application_date,p_idempotency_key,p_actor_id) returning * into app;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value)
  values(p_company_id,doc.preinvoice_id,'PAYMENT_APPLICATION_CREATED',p_actor_id,jsonb_build_object('applicationId',app.id,'sourceMovementId',src.id,'documentId',doc.id,'amount',p_amount,'currency',src.currency));
  return jsonb_build_object('applicationId',app.id,'reused',false,'sourceAvailable',source_total-used-p_amount,'documentBalance',document_total-applied-p_amount);
end $$;

create or replace function public.billing_reverse_credit_application(p_company_id text,p_application_id uuid,p_reason text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare app public.billing_payment_applications%rowtype; doc public.billing_documents%rowtype;
begin
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'APPLICATION_REVERSAL_REASON_REQUIRED' using errcode='22023'; end if;
  select * into app from public.billing_payment_applications where id=p_application_id for update;
  if not found or app.company_id<>p_company_id then raise exception 'APPLICATION_NOT_FOUND' using errcode='P0002'; end if;
  if app.status='REVERSED' then return jsonb_build_object('applicationId',app.id,'reused',true); end if;
  perform 1 from public.billing_account_movements where id=app.source_movement_id for update;
  select * into doc from public.billing_documents where id=app.document_id for update;
  update public.billing_payment_applications set status='REVERSED',reversed_at=now(),reversed_by=p_actor_id,reversal_reason=trim(p_reason) where id=app.id;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,reason,new_value)
  values(p_company_id,doc.preinvoice_id,'PAYMENT_APPLICATION_REVERSED',p_actor_id,trim(p_reason),jsonb_build_object('applicationId',app.id,'sourceMovementId',app.source_movement_id,'documentId',app.document_id,'amount',app.amount,'currency',app.currency));
  return jsonb_build_object('applicationId',app.id,'reused',false,'status','REVERSED');
end $$;

revoke all on function public.billing_apply_credit(text,uuid,uuid,numeric,date,text,uuid,text) from public,anon,authenticated;
revoke all on function public.billing_reverse_credit_application(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.billing_apply_credit(text,uuid,uuid,numeric,date,text,uuid,text) to service_role;
grant execute on function public.billing_reverse_credit_application(text,uuid,text,uuid) to service_role;
