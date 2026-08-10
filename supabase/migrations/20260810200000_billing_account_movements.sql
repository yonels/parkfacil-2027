-- Etapa 5 local: Cuenta Corriente reconstruible por movimientos.
create table if not exists public.billing_account_movements (
  id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id) on update cascade on delete restrict,
  document_id uuid null references public.billing_documents(id) on delete restrict, movement_type text not null check(movement_type in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE','PAYMENT','ADJUSTMENT')),
  movement_date date not null, due_date date null, currency text not null check(currency in ('CLP','USD')),
  debit_amount numeric(18,2) not null default 0 check(debit_amount>=0), credit_amount numeric(18,2) not null default 0 check(credit_amount>=0),
  reference text not null, description text not null, status text not null default 'POSTED' check(status in ('POSTED','REVERSED')),
  reversal_of uuid null references public.billing_account_movements(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  check((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0))
);
create unique index if not exists billing_movement_document_type_uidx on public.billing_account_movements(document_id,movement_type) where document_id is not null and reversal_of is null;
create index if not exists billing_account_movements_scope_idx on public.billing_account_movements(company_id,currency,movement_date,id);
create index if not exists billing_account_movements_due_idx on public.billing_account_movements(company_id,due_date) where status='POSTED';
alter table public.billing_account_movements enable row level security;
revoke all on public.billing_account_movements from public,anon,authenticated;
grant select,insert on public.billing_account_movements to service_role;

create or replace function public.billing_account_movement_guard() returns trigger language plpgsql as $$ begin
  if tg_op<>'INSERT' then raise exception 'BILLING_MOVEMENT_IMMUTABLE' using errcode='23514'; end if;
  if new.document_id is not null and not exists(select 1 from public.billing_documents d where d.id=new.document_id and d.company_id=new.company_id) then raise exception 'BILLING_MOVEMENT_COMPANY_MISMATCH' using errcode='23514'; end if; return new; end $$;
create trigger billing_account_movement_guard before insert or update or delete on public.billing_account_movements for each row execute function public.billing_account_movement_guard();

create or replace function public.billing_post_issued_document() returns trigger language plpgsql as $$
declare movement_kind text; debit numeric(18,2):=0; credit numeric(18,2):=0; final_amount numeric(18,2);
begin
  if new.status<>'ISSUED' or (tg_op='UPDATE' and old.status='ISSUED') then return new; end if;
  final_amount:=case when new.currency='UF' then new.converted_amount_clp else new.total_amount end;
  if new.currency='UF' and final_amount is null then raise exception 'FINAL_CLP_AMOUNT_REQUIRED' using errcode='23514'; end if;
  movement_kind:=new.document_type;
  if movement_kind in ('INVOICE','DEBIT_NOTE') then debit:=final_amount; elsif movement_kind='CREDIT_NOTE' then credit:=final_amount; else return new; end if;
  insert into public.billing_account_movements(company_id,document_id,movement_type,movement_date,due_date,currency,debit_amount,credit_amount,reference,description,created_by)
  values(new.company_id,new.id,movement_kind,new.invoice_date,new.due_date,case when new.currency='UF' then 'CLP' else new.currency end,debit,credit,coalesce(new.folio,new.provider_document_id,new.id::text),'Documento comercial emitido',new.created_by)
  on conflict do nothing;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value)
  values(new.company_id,new.preinvoice_id,'ACCOUNT_MOVEMENT_CREATED',new.created_by,jsonb_build_object('documentId',new.id,'movementType',movement_kind,'amount',final_amount));
  return new;
end $$;
create trigger billing_document_posts_account after insert or update of status on public.billing_documents for each row execute function public.billing_post_issued_document();
