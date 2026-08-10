-- Etapa 4 local: persistencia neutral para documentos de proveedor externo.
alter table public.billing_preinvoices drop constraint if exists billing_preinvoices_status_check;
alter table public.billing_preinvoices add constraint billing_preinvoices_status_check check (status in ('DRAFT','CALCULATED','UNDER_REVIEW','APPROVED','READY_TO_ISSUE','ISSUING','ISSUED','PROVIDER_PENDING','PROVIDER_REJECTED','ISSUE_ERROR','CANCELLED'));

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id) on update cascade on delete restrict,
  contract_id uuid not null references public.company_contracts(id) on delete restrict, preinvoice_id uuid not null references public.billing_preinvoices(id) on delete restrict,
  provider text not null, provider_document_id text null, document_type text not null check(document_type in ('INVOICE','RECEIPT','CREDIT_NOTE','DEBIT_NOTE')),
  folio text null, invoice_date date not null, due_date date not null, currency text not null check(currency in ('CLP','UF','USD')),
  net_amount numeric(18,4) not null, tax_amount numeric(18,4) not null, total_amount numeric(18,4) not null,
  amount_uf numeric(18,6) null, uf_reference_date date null, uf_value numeric(18,6) null, uf_source text null, converted_amount_clp numeric(18,2) null,
  provider_status text null, status text not null check(status in ('ISSUING','ISSUED','PROVIDER_PENDING','PROVIDER_REJECTED','ISSUE_ERROR')),
  idempotency_key text not null unique, pdf_reference text null, xml_reference text null,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(preinvoice_id,document_type)
);
create index if not exists billing_documents_scope_idx on public.billing_documents(company_id,invoice_date,status);
alter table public.billing_documents enable row level security;
revoke all on public.billing_documents from public,anon,authenticated;
grant select,insert,update on public.billing_documents to service_role;

alter table public.billing_audit_events drop constraint if exists billing_audit_events_action_check;
alter table public.billing_audit_events add constraint billing_audit_events_action_check check(action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL','REVIEW_STARTED','COMMENT_ADDED','ADJUSTMENT_ADDED','ADJUSTMENT_REMOVED','RECALCULATED','APPROVED','MARKED_READY_TO_ISSUE','CANCELLED','ISSUE_REQUESTED','ISSUE_STARTED','UF_FINALIZED','PROVIDER_REQUEST_SENT','PROVIDER_PENDING','PROVIDER_ACCEPTED','PROVIDER_REJECTED','ISSUE_FAILED','STATUS_REFRESHED','ACCOUNT_MOVEMENT_CREATED'));

create or replace function public.billing_document_company_guard() returns trigger language plpgsql as $$ begin
  if not exists(select 1 from public.billing_preinvoices p where p.id=new.preinvoice_id and p.company_id=new.company_id and p.contract_id=new.contract_id) then raise exception 'BILLING_DOCUMENT_COMPANY_MISMATCH' using errcode='23514'; end if; return new; end $$;
create trigger billing_document_company_guard before insert or update on public.billing_documents for each row execute function public.billing_document_company_guard();
