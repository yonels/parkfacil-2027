-- Facturacion Etapa 2: fundacion del motor de prefacturacion.
-- No emite DTE ni integra proveedores externos.

create table if not exists public.billable_concepts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  category text not null check (category in ('FEE','SUBSCRIPTION','PARKING','DEVICE','IMPLEMENTATION','INTEGRATION','SUPPORT','SERVICE','DISCOUNT','OTHER')),
  unit text not null default 'unit',
  tax_category text not null default 'UNDEFINED' check (tax_category in ('UNDEFINED','TAXABLE','EXEMPT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_plan_versions (
  id uuid primary key default gen_random_uuid(),
  commercial_plan_id uuid not null references public.commercial_plans(id) on delete restrict,
  version integer not null check (version > 0),
  currency text not null check (currency in ('CLP','UF','USD')),
  valid_from date not null,
  valid_to date null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','RETIRED')),
  inclusions jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  unique (commercial_plan_id, version)
);

create table if not exists public.billing_devices (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  parking_id uuid null references public.parkings(id) on delete restrict,
  device_type text not null,
  name text not null,
  identifier text not null,
  location text not null default '',
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','INACTIVE','RETIRED')),
  activated_on date not null,
  deactivated_on date null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deactivated_on is null or deactivated_on >= activated_on),
  unique (company_id, identifier)
);

create table if not exists public.contract_billable_items (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  contract_id uuid not null references public.company_contracts(id) on delete cascade,
  concept_id uuid not null references public.billable_concepts(id) on delete restrict,
  plan_version_id uuid null references public.commercial_plan_versions(id) on delete restrict,
  parking_id uuid null references public.parkings(id) on delete restrict,
  device_id uuid null references public.billing_devices(id) on delete restrict,
  item_type text not null check (item_type in ('FEE','SERVICE','PARKING','DEVICE','DISCOUNT','OTHER')),
  description text not null,
  quantity numeric(14,4) not null default 1 check (quantity >= 0),
  included_quantity numeric(14,4) not null default 0 check (included_quantity >= 0),
  unit text not null default 'unit',
  unit_price numeric(18,6) not null check (unit_price >= 0),
  currency text not null check (currency in ('CLP','UF','USD')),
  periodicity text not null default 'MONTHLY' check (periodicity in ('MONTHLY','ANNUAL','ONE_TIME','VARIABLE')),
  commercial_classification text not null default 'ADDITIONAL' check (commercial_classification in ('INCLUDED','ADDITIONAL')),
  valid_from date not null,
  valid_to date null,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','SUSPENDED','ENDED')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check (included_quantity <= quantity or commercial_classification = 'INCLUDED'),
  unique nulls not distinct (contract_id, concept_id, parking_id, device_id, valid_from)
);

create table if not exists public.billing_preinvoices (
  id uuid primary key default gen_random_uuid(),
  internal_number text not null unique,
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  contract_id uuid not null references public.company_contracts(id) on delete restrict,
  period text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  currency text not null check (currency in ('CLP','UF','USD')),
  status text not null default 'DRAFT' check (status in ('DRAFT','CALCULATED','UNDER_REVIEW','APPROVED','READY_TO_ISSUE','CANCELLED')),
  calculated_at timestamptz null,
  due_date date null,
  net_amount numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  total_amount numeric(18,4) not null default 0,
  contract_amount_uf numeric(18,6) null,
  uf_date date null,
  uf_value numeric(18,6) null,
  converted_amount_clp numeric(18,2) null,
  uf_source text null,
  uf_status text not null default 'NOT_APPLICABLE' check (uf_status in ('NOT_APPLICABLE','PENDING','RESOLVED','FAILED')),
  calculation_issue_code text null,
  calculation_version text not null default 'billing-v1',
  idempotency_key text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid null references auth.users(id) on delete restrict,
  approved_at timestamptz null,
  cancelled_by uuid null references auth.users(id) on delete restrict,
  cancelled_at timestamptz null,
  cancellation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (net_amount >= 0 and tax_amount >= 0 and total_amount >= 0),
  check ((currency <> 'UF') or uf_status <> 'RESOLVED' or (uf_date is not null and uf_value is not null and converted_amount_clp is not null and uf_source is not null))
);

create unique index if not exists billing_preinvoice_active_period_uidx
  on public.billing_preinvoices(company_id, contract_id, period)
  where status <> 'CANCELLED';

create table if not exists public.billing_preinvoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  preinvoice_id uuid not null references public.billing_preinvoices(id) on delete cascade,
  concept_id uuid not null references public.billable_concepts(id) on delete restrict,
  contract_item_id uuid not null references public.contract_billable_items(id) on delete restrict,
  parking_id uuid null references public.parkings(id) on delete restrict,
  device_id uuid null references public.billing_devices(id) on delete restrict,
  source_type text not null check (source_type in ('CONTRACT','PARKING','SERVICE','DEVICE','MANUAL')),
  source_key text not null,
  description text not null,
  quantity numeric(14,4) not null,
  unit text not null,
  unit_price numeric(18,6) not null,
  currency text not null check (currency in ('CLP','UF','USD')),
  subtotal numeric(18,4) not null,
  tax_amount numeric(18,4) not null default 0,
  total_amount numeric(18,4) not null,
  valid_from date not null,
  valid_to date not null,
  created_at timestamptz not null default now(),
  unique (preinvoice_id, source_key)
);

create table if not exists public.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  preinvoice_id uuid null references public.billing_preinvoices(id) on delete set null,
  action text not null check (action in ('CALCULATE','RECALCULATE','REVIEW','APPROVE','CANCEL')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  reason text null,
  previous_value jsonb null,
  new_value jsonb null,
  request_id text null,
  created_at timestamptz not null default now()
);

create index if not exists commercial_plan_versions_lookup_idx on public.commercial_plan_versions(commercial_plan_id, status, valid_from, valid_to);
create index if not exists billing_devices_scope_idx on public.billing_devices(company_id, parking_id, device_type, status);
create index if not exists contract_billable_items_scope_idx on public.contract_billable_items(company_id, contract_id, status, valid_from, valid_to);
create index if not exists billing_preinvoices_scope_idx on public.billing_preinvoices(company_id, period, status);
create index if not exists billing_preinvoice_lines_origin_idx on public.billing_preinvoice_lines(company_id, preinvoice_id, contract_item_id, device_id);
create index if not exists billing_audit_events_entity_idx on public.billing_audit_events(company_id, preinvoice_id, created_at desc);

create or replace function public.billing_validate_company_links()
returns trigger language plpgsql as $$
declare linked_company text;
begin
  if tg_table_name = 'billing_devices' and new.parking_id is not null then
    select company_id into linked_company from public.parkings where id = new.parking_id;
    if linked_company is distinct from new.company_id then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
  elsif tg_table_name = 'contract_billable_items' then
    select company_id into linked_company from public.company_contracts where id = new.contract_id;
    if linked_company is distinct from new.company_id then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
    if new.parking_id is not null and not exists(select 1 from public.parkings where id=new.parking_id and company_id=new.company_id) then raise exception 'BILLING_PARKING_MISMATCH' using errcode='23514'; end if;
    if new.device_id is not null and not exists(select 1 from public.billing_devices where id=new.device_id and company_id=new.company_id) then raise exception 'BILLING_DEVICE_MISMATCH' using errcode='23514'; end if;
  elsif tg_table_name = 'billing_preinvoices' then
    select company_id into linked_company from public.company_contracts where id = new.contract_id;
    if linked_company is distinct from new.company_id then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
    if tg_op = 'UPDATE' and old.status in ('APPROVED','READY_TO_ISSUE') and row(new.net_amount,new.tax_amount,new.total_amount,new.uf_date,new.uf_value,new.converted_amount_clp) is distinct from row(old.net_amount,old.tax_amount,old.total_amount,old.uf_date,old.uf_value,old.converted_amount_clp) then raise exception 'APPROVED_PREINVOICE_IMMUTABLE' using errcode='23514'; end if;
  elsif tg_table_name = 'billing_preinvoice_lines' then
    if not exists(select 1 from public.billing_preinvoices where id=new.preinvoice_id and company_id=new.company_id) then raise exception 'BILLING_PREINVOICE_MISMATCH' using errcode='23514'; end if;
    if not exists(select 1 from public.contract_billable_items where id=new.contract_item_id and company_id=new.company_id) then raise exception 'BILLING_ITEM_MISMATCH' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;

create trigger billing_devices_company_guard before insert or update on public.billing_devices for each row execute function public.billing_validate_company_links();
create trigger contract_billable_items_company_guard before insert or update on public.contract_billable_items for each row execute function public.billing_validate_company_links();
create trigger billing_preinvoices_company_guard before insert or update on public.billing_preinvoices for each row execute function public.billing_validate_company_links();
create trigger billing_preinvoice_lines_company_guard before insert or update on public.billing_preinvoice_lines for each row execute function public.billing_validate_company_links();

create or replace function public.billing_guard_preinvoice_line_mutation()
returns trigger language plpgsql as $$
declare parent_status text;
begin
  select status into parent_status from public.billing_preinvoices where id = case when tg_op = 'DELETE' then old.preinvoice_id else new.preinvoice_id end;
  if parent_status in ('APPROVED','READY_TO_ISSUE') then
    raise exception 'APPROVED_PREINVOICE_IMMUTABLE' using errcode='23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger billing_preinvoice_lines_immutable_guard before insert or update or delete on public.billing_preinvoice_lines for each row execute function public.billing_guard_preinvoice_line_mutation();

alter table public.billable_concepts enable row level security;
alter table public.commercial_plan_versions enable row level security;
alter table public.billing_devices enable row level security;
alter table public.contract_billable_items enable row level security;
alter table public.billing_preinvoices enable row level security;
alter table public.billing_preinvoice_lines enable row level security;
alter table public.billing_audit_events enable row level security;

revoke all on public.billable_concepts, public.commercial_plan_versions, public.billing_devices,
  public.contract_billable_items, public.billing_preinvoices, public.billing_preinvoice_lines,
  public.billing_audit_events from public, anon, authenticated;
grant select, insert, update, delete on public.billable_concepts, public.commercial_plan_versions,
  public.billing_devices, public.contract_billable_items, public.billing_preinvoices,
  public.billing_preinvoice_lines to service_role;
grant select, insert on public.billing_audit_events to service_role;

-- Catalogo sin precios: los valores se fijan en contract_billable_items.
insert into public.billable_concepts(code,name,category,unit) values
  ('MONTHLY_FEE','Fee mensual ParkFacil','FEE','month'),
  ('SUBSCRIPTION','Suscripcion','SUBSCRIPTION','month'),
  ('ADDITIONAL_PARKING','Estacionamiento adicional','PARKING','parking'),
  ('ADDITIONAL_DEVICE','Device adicional','DEVICE','device'),
  ('ADDITIONAL_POS','POS adicional','DEVICE','device'),
  ('ADDITIONAL_PC','PC adicional','DEVICE','device'),
  ('ADDITIONAL_LPR','LPR adicional','DEVICE','device'),
  ('ADDITIONAL_BARRIER','Barrera adicional','DEVICE','device'),
  ('ADDITIONAL_SENSOR','Sensor adicional','DEVICE','device'),
  ('IMPLEMENTATION','Implementacion','IMPLEMENTATION','service'),
  ('INTEGRATION','Integracion','INTEGRATION','service'),
  ('SUPPORT','Soporte','SUPPORT','month'),
  ('SPECIAL_SERVICE','Servicio especial','SERVICE','service'),
  ('DISCOUNT','Descuento','DISCOUNT','unit'),
  ('OTHER','Otro concepto contractual','OTHER','unit')
on conflict (code) do nothing;
