-- Facturacion Etapa 3: revision, aprobacion y cierre previo a emision.

alter table public.billing_preinvoices add column if not exists version integer not null default 1 check (version > 0);
alter table public.billing_preinvoices add column if not exists uf_is_provisional boolean not null default false;
comment on column public.billing_preinvoices.uf_is_provisional is 'La UF de prefactura es provisional. La UF definitiva corresponde al dia efectivo de emision.';

alter table public.billing_preinvoice_lines alter column contract_item_id drop not null;
alter table public.billing_preinvoice_lines add column if not exists line_status text not null default 'ACTIVE' check (line_status in ('ACTIVE','REQUIRES_REVIEW','REMOVED'));

create table if not exists public.billing_preinvoice_comments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  preinvoice_id uuid not null references public.billing_preinvoices(id) on delete cascade,
  text text not null check (length(trim(text)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_preinvoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  preinvoice_id uuid not null references public.billing_preinvoices(id) on delete cascade,
  original_line_id uuid null references public.billing_preinvoice_lines(id) on delete restrict,
  concept_id uuid not null references public.billable_concepts(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('DISCOUNT','EXTRA_CHARGE','QUANTITY_CORRECTION','AUTHORIZED_CORRECTION')),
  description text not null,
  quantity numeric(14,4) not null,
  unit text not null default 'unit',
  unit_price numeric(18,6) not null,
  currency text not null check (currency in ('CLP','UF','USD')),
  amount numeric(18,4) not null,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED','REQUIRES_REVIEW')),
  created_by uuid not null references auth.users(id) on delete restrict,
  removed_by uuid null references auth.users(id) on delete restrict,
  removed_at timestamptz null,
  removal_reason text null,
  created_at timestamptz not null default now()
);

alter table public.billing_preinvoice_lines add column if not exists adjustment_id uuid null references public.billing_preinvoice_adjustments(id) on delete restrict;
create unique index if not exists billing_preinvoice_lines_adjustment_uidx on public.billing_preinvoice_lines(adjustment_id) where adjustment_id is not null;
create index if not exists billing_comments_idx on public.billing_preinvoice_comments(company_id,preinvoice_id,created_at);
create index if not exists billing_adjustments_idx on public.billing_preinvoice_adjustments(company_id,preinvoice_id,status,created_at);

alter table public.billing_audit_events drop constraint if exists billing_audit_events_action_check;
alter table public.billing_audit_events add constraint billing_audit_events_action_check check (action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL','REVIEW_STARTED','COMMENT_ADDED','ADJUSTMENT_ADDED','ADJUSTMENT_REMOVED','RECALCULATED','APPROVED','MARKED_READY_TO_ISSUE','CANCELLED'));

create or replace function public.billing_guard_review_company()
returns trigger language plpgsql as $$
begin
  if not exists(select 1 from public.billing_preinvoices where id=new.preinvoice_id and company_id=new.company_id) then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
  if exists(select 1 from public.billing_preinvoices where id=new.preinvoice_id and status in ('APPROVED','READY_TO_ISSUE','CANCELLED')) then raise exception 'PREINVOICE_LOCKED' using errcode='23514'; end if;
  return new;
end; $$;
create trigger billing_comments_company_guard before insert or update on public.billing_preinvoice_comments for each row execute function public.billing_guard_review_company();
create trigger billing_adjustments_company_guard before insert or update on public.billing_preinvoice_adjustments for each row execute function public.billing_guard_review_company();

alter table public.billing_preinvoice_comments enable row level security;
alter table public.billing_preinvoice_adjustments enable row level security;
revoke all on public.billing_preinvoice_comments,public.billing_preinvoice_adjustments from public,anon,authenticated;
grant select,insert on public.billing_preinvoice_comments to service_role;
grant select,insert,update on public.billing_preinvoice_adjustments to service_role;
