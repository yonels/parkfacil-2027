-- Etapa 7B: documentos comerciales relacionados, snapshots e inmutabilidad.
alter table public.billing_documents drop constraint if exists billing_documents_preinvoice_id_document_type_key;
create unique index if not exists billing_invoice_preinvoice_uidx on public.billing_documents(preinvoice_id) where document_type='INVOICE';

alter table public.billing_documents
  add column if not exists document_reference_id uuid null references public.billing_documents(id) on delete restrict,
  add column if not exists reason text null,
  add column if not exists correction_mode text null check(correction_mode in ('TOTAL','PARTIAL')),
  add column if not exists customer_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists provider_request jsonb null;
alter table public.billing_documents add constraint billing_document_reference_shape_check check (
  (document_type in ('INVOICE','RECEIPT') and document_reference_id is null and reason is null and correction_mode is null) or
  (document_type='CREDIT_NOTE' and document_reference_id is not null and length(trim(reason)) between 1 and 1000 and correction_mode is not null) or
  (document_type='DEBIT_NOTE' and document_reference_id is not null and length(trim(reason)) between 1 and 1000 and correction_mode is null)
) not valid;
alter table public.billing_documents validate constraint billing_document_reference_shape_check;
create index if not exists billing_documents_reference_idx on public.billing_documents(company_id,document_reference_id,document_type,status);

create table public.billing_document_lines (
  id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id) on update cascade on delete restrict,
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  source_preinvoice_line_id uuid null references public.billing_preinvoice_lines(id) on delete restrict,
  description text not null check(length(trim(description)) between 1 and 1000), quantity numeric(18,6) not null check(quantity>0),
  unit_price numeric(18,4) not null check(unit_price>=0), subtotal numeric(18,4) not null check(subtotal>=0),
  currency text not null check(currency in ('CLP','UF','USD')), tax_category text not null,
  source_reference jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index billing_document_lines_document_idx on public.billing_document_lines(company_id,document_id,id);
alter table public.billing_document_lines enable row level security;
revoke all on public.billing_document_lines from public,anon,authenticated;
grant select,insert on public.billing_document_lines to service_role;

create or replace function public.billing_document_line_guard() returns trigger language plpgsql as $$
begin
  if tg_op<>'INSERT' then raise exception 'BILLING_DOCUMENT_LINE_IMMUTABLE' using errcode='23514'; end if;
  if not exists(select 1 from public.billing_documents d where d.id=new.document_id and d.company_id=new.company_id) then raise exception 'BILLING_DOCUMENT_LINE_COMPANY_MISMATCH' using errcode='23514'; end if;
  return new;
end $$;
create trigger billing_document_line_guard before insert or update or delete on public.billing_document_lines for each row execute function public.billing_document_line_guard();

create or replace function public.billing_issued_document_immutable_guard() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'BILLING_DOCUMENT_DELETE_FORBIDDEN' using errcode='23514'; end if;
  if old.status='ISSUED' and row(new.company_id,new.contract_id,new.preinvoice_id,new.document_type,new.document_reference_id,new.folio,new.invoice_date,new.due_date,new.currency,new.net_amount,new.tax_amount,new.total_amount,new.amount_uf,new.uf_reference_date,new.uf_value,new.converted_amount_clp,new.reason,new.correction_mode,new.customer_snapshot,new.created_by,new.created_at)
    is distinct from row(old.company_id,old.contract_id,old.preinvoice_id,old.document_type,old.document_reference_id,old.folio,old.invoice_date,old.due_date,old.currency,old.net_amount,old.tax_amount,old.total_amount,old.amount_uf,old.uf_reference_date,old.uf_value,old.converted_amount_clp,old.reason,old.correction_mode,old.customer_snapshot,old.created_by,old.created_at)
  then raise exception 'BILLING_ISSUED_DOCUMENT_IMMUTABLE' using errcode='23514'; end if;
  return new;
end $$;
create trigger billing_issued_document_immutable_guard before update or delete on public.billing_documents for each row execute function public.billing_issued_document_immutable_guard();

alter table public.billing_audit_events drop constraint if exists billing_audit_events_action_check;
alter table public.billing_audit_events add constraint billing_audit_events_action_check check(action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL','REVIEW_STARTED','COMMENT_ADDED','ADJUSTMENT_ADDED','ADJUSTMENT_REMOVED','RECALCULATED','APPROVED','MARKED_READY_TO_ISSUE','CANCELLED','ISSUE_REQUESTED','ISSUE_STARTED','UF_FINALIZED','PROVIDER_REQUEST_SENT','PROVIDER_PENDING','PROVIDER_ACCEPTED','PROVIDER_REJECTED','ISSUE_FAILED','STATUS_REFRESHED','ACCOUNT_MOVEMENT_CREATED','PAYMENT_APPLICATION_CREATED','PAYMENT_APPLICATION_REVERSED','PAYMENT_REVERSAL_CREATED','EXTERNAL_MOVEMENT_CREATED','EXTERNAL_MOVEMENT_IMPORTED','RECONCILIATION_CREATED','RECONCILIATION_REVERSED','INVOICE_ISSUED','CREDIT_NOTE_REQUESTED','CREDIT_NOTE_ISSUED','DEBIT_NOTE_REQUESTED','DEBIT_NOTE_ISSUED','DOCUMENT_PROVIDER_REJECTED','DOCUMENT_STATUS_REFRESHED'));

create or replace function public.billing_begin_related_document(p_company_id text,p_origin_id uuid,p_document_type text,p_reason text,p_mode text,p_amount numeric,p_issue_date date,p_idempotency_key text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare origin public.billing_documents%rowtype; prior public.billing_documents%rowtype; created public.billing_documents%rowtype; used numeric(18,4); amount numeric(18,4); ratio numeric; action text;
begin
  if p_document_type not in ('CREDIT_NOTE','DEBIT_NOTE') then raise exception 'DOCUMENT_TYPE_INVALID' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'DOCUMENT_REASON_REQUIRED' using errcode='22023'; end if;
  if p_issue_date is null or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 120 then raise exception 'DOCUMENT_REQUEST_INVALID' using errcode='22023'; end if;
  select * into prior from public.billing_documents where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('documentId',prior.id,'status',prior.status,'reused',true); end if;
  select * into origin from public.billing_documents where id=p_origin_id for update;
  if not found or origin.company_id<>p_company_id then raise exception 'ORIGIN_DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
  if origin.document_type<>'INVOICE' or origin.status<>'ISSUED' then raise exception 'ORIGIN_INVOICE_INVALID' using errcode='23514'; end if;
  if p_document_type='CREDIT_NOTE' then
    if p_mode not in ('TOTAL','PARTIAL') then raise exception 'CREDIT_NOTE_MODE_INVALID' using errcode='22023'; end if;
    select coalesce(sum(case when currency='UF' then amount_uf else total_amount end),0) into used from public.billing_documents where document_reference_id=origin.id and document_type='CREDIT_NOTE' and status in ('ISSUING','ISSUED','PROVIDER_PENDING');
    amount:=case when p_mode='TOTAL' then (case when origin.currency='UF' then origin.amount_uf else origin.total_amount end)-used else p_amount end;
    if amount is null or amount<=0 or amount>(case when origin.currency='UF' then origin.amount_uf else origin.total_amount end)-used then raise exception 'CREDIT_NOTE_EXCEEDS_AVAILABLE' using errcode='23514'; end if;
    action:='CREDIT_NOTE_REQUESTED';
  else
    if p_amount is null or p_amount<=0 then raise exception 'DEBIT_NOTE_AMOUNT_INVALID' using errcode='22023'; end if; amount:=p_amount; action:='DEBIT_NOTE_REQUESTED';
  end if;
  ratio:=amount/(case when origin.currency='UF' then origin.amount_uf else origin.total_amount end);
  insert into public.billing_documents(company_id,contract_id,preinvoice_id,provider,document_type,document_reference_id,invoice_date,due_date,currency,net_amount,tax_amount,total_amount,amount_uf,uf_reference_date,uf_value,uf_source,converted_amount_clp,status,idempotency_key,reason,correction_mode,customer_snapshot,created_by)
  values(origin.company_id,origin.contract_id,origin.preinvoice_id,'mock',p_document_type,origin.id,p_issue_date,p_issue_date,origin.currency,round(origin.net_amount*ratio,4),round(origin.tax_amount*ratio,4),case when origin.currency='UF' then round(origin.total_amount*ratio,4) else amount end,case when origin.currency='UF' then amount else null end,origin.uf_reference_date,origin.uf_value,origin.uf_source,case when origin.currency='UF' then round(amount*origin.uf_value,2) else null end,'ISSUING',p_idempotency_key,trim(p_reason),case when p_document_type='CREDIT_NOTE' then p_mode else null end,origin.customer_snapshot,p_actor_id) returning * into created;
  insert into public.billing_document_lines(company_id,document_id,source_preinvoice_line_id,description,quantity,unit_price,subtotal,currency,tax_category,source_reference)
  select company_id,created.id,source_preinvoice_line_id,description,quantity,round(unit_price*ratio,4),round(subtotal*ratio,4),currency,tax_category,source_reference from public.billing_document_lines where document_id=origin.id;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,reason,new_value) values(origin.company_id,origin.preinvoice_id,action,p_actor_id,trim(p_reason),jsonb_build_object('originDocumentId',origin.id,'documentId',created.id,'amount',amount,'currency',origin.currency,'mode',p_mode));
  return jsonb_build_object('documentId',created.id,'status',created.status,'reused',false);
end $$;

create or replace function public.billing_finalize_related_document(p_company_id text,p_document_id uuid,p_status text,p_provider_document_id text,p_provider_status text,p_folio text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare doc public.billing_documents%rowtype; action text;
begin
  select * into doc from public.billing_documents where id=p_document_id for update;
  if not found or doc.company_id<>p_company_id then raise exception 'DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
  if doc.status<>'ISSUING' then return jsonb_build_object('documentId',doc.id,'status',doc.status,'reused',true); end if;
  if p_status not in ('ISSUED','PROVIDER_PENDING','PROVIDER_REJECTED','ISSUE_ERROR') then raise exception 'DOCUMENT_STATUS_INVALID' using errcode='22023'; end if;
  update public.billing_documents set status=p_status,provider_document_id=p_provider_document_id,provider_status=p_provider_status,folio=p_folio,updated_at=now() where id=doc.id;
  action:=case when p_status='ISSUED' and doc.document_type='CREDIT_NOTE' then 'CREDIT_NOTE_ISSUED' when p_status='ISSUED' then 'DEBIT_NOTE_ISSUED' when p_status='PROVIDER_REJECTED' then 'DOCUMENT_PROVIDER_REJECTED' else 'STATUS_REFRESHED' end;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value) values(doc.company_id,doc.preinvoice_id,action,p_actor_id,jsonb_build_object('originDocumentId',doc.document_reference_id,'documentId',doc.id,'providerStatus',p_provider_status));
  return jsonb_build_object('documentId',doc.id,'status',p_status,'reused',false);
end $$;

revoke all on function public.billing_begin_related_document(text,uuid,text,text,text,numeric,date,text,uuid) from public,anon,authenticated;
revoke all on function public.billing_finalize_related_document(text,uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.billing_begin_related_document(text,uuid,text,text,text,numeric,date,text,uuid) to service_role;
grant execute on function public.billing_finalize_related_document(text,uuid,text,text,text,text,uuid) to service_role;

create or replace function public.billing_audit_issued_invoice() returns trigger language plpgsql as $$
begin
  if new.document_type='INVOICE' and new.status='ISSUED' and (tg_op='INSERT' or old.status<>'ISSUED') then
    insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value) values(new.company_id,new.preinvoice_id,'INVOICE_ISSUED',new.created_by,jsonb_build_object('documentId',new.id,'folio',new.folio,'provider',new.provider));
  end if; return new;
end $$;
create trigger billing_audit_issued_invoice after insert or update of status on public.billing_documents for each row execute function public.billing_audit_issued_invoice();
