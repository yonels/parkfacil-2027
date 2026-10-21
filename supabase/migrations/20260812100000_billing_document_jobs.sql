-- Etapa 8B: outbox persistente para procesamiento documental.
create table public.billing_document_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  operation text not null check (operation in ('ISSUE')),
  provider text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','RETRY','FAILED')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  idempotency_key text not null,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz null,
  locked_at timestamptz null,
  lock_token uuid null,
  completed_at timestamptz null,
  error_code text null,
  error_message text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, operation),
  unique (company_id, idempotency_key)
);
create index billing_document_jobs_ready_idx on public.billing_document_jobs(status,next_attempt_at,created_at) where status in ('PENDING','RETRY');
alter table public.billing_document_jobs enable row level security;
revoke all on public.billing_document_jobs from public,anon,authenticated;
grant select on public.billing_document_jobs to service_role;

-- Las NC/ND siguen reservándose con billing_begin_related_document. Este trigger
-- agrega su outbox en la misma transacción sin reescribir esa RPC ya probada.
create or replace function public.billing_related_document_job_outbox() returns trigger language plpgsql as $$
begin
  if new.document_type in ('CREDIT_NOTE','DEBIT_NOTE') then
    insert into public.billing_document_jobs(company_id,document_id,operation,provider,idempotency_key,created_by)
    values(new.company_id,new.id,'ISSUE',new.provider,new.idempotency_key,new.created_by)
    on conflict(document_id,operation) do nothing;
  end if;
  return new;
end $$;
create trigger billing_related_document_job_outbox after insert on public.billing_documents for each row execute function public.billing_related_document_job_outbox();

alter table public.billing_audit_events drop constraint if exists billing_audit_events_action_check;
alter table public.billing_audit_events add constraint billing_audit_events_action_check check(action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL','REVIEW_STARTED','COMMENT_ADDED','ADJUSTMENT_ADDED','ADJUSTMENT_REMOVED','RECALCULATED','APPROVED','MARKED_READY_TO_ISSUE','CANCELLED','ISSUE_REQUESTED','ISSUE_STARTED','UF_FINALIZED','PROVIDER_REQUEST_SENT','PROVIDER_PENDING','PROVIDER_ACCEPTED','PROVIDER_REJECTED','ISSUE_FAILED','STATUS_REFRESHED','ACCOUNT_MOVEMENT_CREATED','PAYMENT_APPLICATION_CREATED','PAYMENT_APPLICATION_REVERSED','PAYMENT_REVERSAL_CREATED','EXTERNAL_MOVEMENT_CREATED','EXTERNAL_MOVEMENT_IMPORTED','RECONCILIATION_CREATED','RECONCILIATION_REVERSED','INVOICE_ISSUED','CREDIT_NOTE_REQUESTED','CREDIT_NOTE_ISSUED','DEBIT_NOTE_REQUESTED','DEBIT_NOTE_ISSUED','DOCUMENT_PROVIDER_REJECTED','DOCUMENT_STATUS_REFRESHED','DOCUMENT_JOB_CREATED','DOCUMENT_JOB_STARTED','DOCUMENT_JOB_RETRY','DOCUMENT_JOB_FAILED','DOCUMENT_JOB_COMPLETED'));

create or replace function public.billing_enqueue_invoice(
  p_preinvoice_id uuid,p_invoice_date date,p_idempotency_key text,p_actor_id uuid,
  p_currency text,p_net numeric,p_tax numeric,p_total numeric,p_amount_uf numeric,
  p_uf_reference_date date,p_uf_value numeric,p_uf_source text,p_converted_amount_clp numeric,
  p_customer_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.billing_preinvoices%rowtype; d public.billing_documents%rowtype; j public.billing_document_jobs%rowtype;
begin
  select * into d from public.billing_documents where idempotency_key=p_idempotency_key;
  if found then select * into j from public.billing_document_jobs where document_id=d.id and operation='ISSUE'; return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',true); end if;
  select * into p from public.billing_preinvoices where id=p_preinvoice_id for update;
  if not found or p.status<>'READY_TO_ISSUE' then raise exception 'PREINVOICE_NOT_READY' using errcode='23514'; end if;
  update public.billing_preinvoices set status='ISSUING',updated_at=now() where id=p.id;
  insert into public.billing_documents(company_id,contract_id,preinvoice_id,provider,document_type,invoice_date,due_date,currency,net_amount,tax_amount,total_amount,amount_uf,uf_reference_date,uf_value,uf_source,converted_amount_clp,status,idempotency_key,customer_snapshot,created_by)
  values(p.company_id,p.contract_id,p.id,'mock','INVOICE',p_invoice_date,p.due_date,p_currency,p_net,p_tax,p_total,p_amount_uf,p_uf_reference_date,p_uf_value,p_uf_source,p_converted_amount_clp,'ISSUING',p_idempotency_key,coalesce(p_customer_snapshot,'{}'),p_actor_id) returning * into d;
  insert into public.billing_document_lines(company_id,document_id,source_preinvoice_line_id,description,quantity,unit_price,subtotal,currency,tax_category,source_reference)
  select l.company_id,d.id,l.id,l.description,l.quantity,l.unit_price,l.total_amount,d.currency,coalesce(c.tax_category,'UNDEFINED'),jsonb_build_object('preinvoiceId',p.id)
  from public.billing_preinvoice_lines l join public.billable_concepts c on c.id=l.concept_id where l.preinvoice_id=p.id and l.line_status='ACTIVE';
  insert into public.billing_document_jobs(company_id,document_id,operation,provider,idempotency_key,created_by)
  values(d.company_id,d.id,'ISSUE','mock',p_idempotency_key,p_actor_id) returning * into j;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value) values(d.company_id,p.id,'DOCUMENT_JOB_CREATED',p_actor_id,jsonb_build_object('documentId',d.id,'jobId',j.id));
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',false);
exception when unique_violation then
  select * into d from public.billing_documents where idempotency_key=p_idempotency_key;
  select * into j from public.billing_document_jobs where document_id=d.id and operation='ISSUE';
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',true);
end $$;

create or replace function public.billing_enqueue_existing_document(p_company_id text,p_document_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.billing_documents%rowtype; j public.billing_document_jobs%rowtype;
begin
  select * into d from public.billing_documents where id=p_document_id for update;
  if not found or d.company_id<>p_company_id then raise exception 'DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
  if d.status='ISSUED' then raise exception 'DOCUMENT_ALREADY_ISSUED' using errcode='23514'; end if;
  if d.status not in ('ISSUING','PROVIDER_PENDING','ISSUE_ERROR') then raise exception 'DOCUMENT_RETRY_INVALID' using errcode='23514'; end if;
  insert into public.billing_document_jobs(company_id,document_id,operation,provider,idempotency_key,created_by)
  values(d.company_id,d.id,'ISSUE',d.provider,d.idempotency_key,p_actor_id)
  on conflict(document_id,operation) do update set status='RETRY',next_attempt_at=now(),locked_at=null,lock_token=null,error_code=null,error_message=null,updated_at=now()
  where billing_document_jobs.status in ('RETRY','FAILED') returning * into j;
  if not found then select * into j from public.billing_document_jobs where document_id=d.id and operation='ISSUE'; end if;
  if j.attempts>=j.max_attempts then raise exception 'DOCUMENT_JOB_ATTEMPTS_EXHAUSTED' using errcode='23514'; end if;
  update public.billing_documents set status='ISSUING',updated_at=now() where id=d.id and status='ISSUE_ERROR';
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',j.status not in ('RETRY','PENDING'));
end $$;

create or replace function public.billing_claim_document_job(p_job_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.billing_document_jobs%rowtype; token uuid:=gen_random_uuid();
begin
  select * into j from public.billing_document_jobs where id=p_job_id for update;
  if not found then raise exception 'DOCUMENT_JOB_NOT_FOUND' using errcode='P0002'; end if;
  if j.status not in ('PENDING','RETRY') or j.next_attempt_at>now() then return jsonb_build_object('claimed',false,'status',j.status); end if;
  if j.attempts>=j.max_attempts then
    update public.billing_document_jobs set status='FAILED',locked_at=null,lock_token=null,error_code=coalesce(error_code,'MAX_ATTEMPTS_EXHAUSTED'),error_message=coalesce(error_message,'Se agotó la política de intentos.'),updated_at=now() where id=j.id;
    return jsonb_build_object('claimed',false,'status','FAILED','reason','MAX_ATTEMPTS_EXHAUSTED');
  end if;
  update public.billing_document_jobs set status='PROCESSING',attempts=attempts+1,last_attempt_at=now(),locked_at=now(),lock_token=token,updated_at=now() where id=j.id returning * into j;
  insert into public.billing_audit_events(company_id,action,actor_id,new_value) values(j.company_id,'DOCUMENT_JOB_STARTED',p_actor_id,jsonb_build_object('documentId',j.document_id,'jobId',j.id,'attempt',j.attempts));
  return jsonb_build_object('claimed',true,'jobId',j.id,'documentId',j.document_id,'companyId',j.company_id,'attempt',j.attempts,'maxAttempts',j.max_attempts,'lockToken',token);
end $$;

create or replace function public.billing_finish_document_job(p_job_id uuid,p_lock_token uuid,p_actor_id uuid,p_result text,p_provider_document_id text,p_provider_status text,p_folio text,p_pdf_reference text,p_xml_reference text,p_error_code text,p_error_message text,p_retryable boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.billing_document_jobs%rowtype; d public.billing_documents%rowtype; final_job text; final_doc text; action text;
begin
  select * into j from public.billing_document_jobs where id=p_job_id for update;
  if not found or j.status<>'PROCESSING' or j.lock_token is distinct from p_lock_token then raise exception 'DOCUMENT_JOB_LOCK_LOST' using errcode='55000'; end if;
  select * into d from public.billing_documents where id=j.document_id for update;
  if d.status='ISSUED' then final_job:='COMPLETED'; final_doc:='ISSUED'; action:='DOCUMENT_JOB_COMPLETED';
  elsif p_result in ('ISSUED','DUPLICATE') then final_job:='COMPLETED'; final_doc:='ISSUED'; action:='DOCUMENT_JOB_COMPLETED';
  elsif p_result='PENDING' and j.attempts<j.max_attempts then final_job:='RETRY'; final_doc:='PROVIDER_PENDING'; action:='DOCUMENT_JOB_RETRY';
  elsif p_result='PENDING' then final_job:='FAILED'; final_doc:='PROVIDER_PENDING'; action:='DOCUMENT_JOB_FAILED';
  elsif p_retryable and j.attempts<j.max_attempts then final_job:='RETRY'; final_doc:='ISSUE_ERROR'; action:='DOCUMENT_JOB_RETRY';
  else final_job:='FAILED'; final_doc:=case when p_result='REJECTED' then 'PROVIDER_REJECTED' else 'ISSUE_ERROR' end; action:='DOCUMENT_JOB_FAILED'; end if;
  update public.billing_documents set status=final_doc,provider_document_id=coalesce(p_provider_document_id,provider_document_id),provider_status=coalesce(p_provider_status,p_error_code),folio=coalesce(p_folio,folio),pdf_reference=coalesce(p_pdf_reference,pdf_reference),xml_reference=coalesce(p_xml_reference,xml_reference),updated_at=now() where id=d.id;
  update public.billing_preinvoices set status=final_doc,updated_at=now() where id=d.preinvoice_id and d.document_type='INVOICE';
  update public.billing_document_jobs set status=final_job,next_attempt_at=case when final_job='RETRY' then now()+make_interval(mins=>least(60,power(2,j.attempts)::int)) else next_attempt_at end,completed_at=case when final_job='COMPLETED' then now() else null end,locked_at=null,lock_token=null,error_code=left(nullif(p_error_code,''),120),error_message=left(nullif(p_error_message,''),500),updated_at=now() where id=j.id;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value) values(j.company_id,d.preinvoice_id,action,p_actor_id,jsonb_build_object('documentId',d.id,'jobId',j.id,'attempt',j.attempts,'result',p_result,'errorCode',p_error_code));
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'jobStatus',final_job,'documentStatus',final_doc);
end $$;

do $permissions$
declare
  rpc record;
  rpc_identity regprocedure;
begin
  for rpc in
    select * from (values
      ('billing_enqueue_invoice',14),
      ('billing_enqueue_existing_document',3),
      ('billing_claim_document_job',2),
      ('billing_finish_document_job',12)
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
