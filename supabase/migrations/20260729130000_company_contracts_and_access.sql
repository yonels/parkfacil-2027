-- Contratos por empresa y cuentas operativas segregadas.
create table if not exists public.company_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  contract_number text not null unique,
  status text not null default 'active'
    check (status in ('draft','pending_signature','active','suspended','expired','terminated','cancelled')),
  signed_on date null,
  starts_on date not null,
  ends_on date not null,
  duration_months integer not null check (duration_months > 0),
  automatic_renewal boolean not null default false,
  non_renewal_notice_days integer not null default 30 check (non_renewal_notice_days >= 0),
  currency text not null check (currency in ('CLP','UF','USD')),
  tax_label text not null default '',
  monthly_value numeric(14,4) null check (monthly_value is null or monthly_value >= 0),
  monthly_value_source text not null default 'contract',
  annual_discount_percent numeric(5,2) null check (annual_discount_percent between 0 and 100),
  payment_due_days integer null check (payment_due_days >= 0),
  reactivation_value numeric(14,4) null check (reactivation_value is null or reactivation_value >= 0),
  equipment_penalty_value numeric(14,4) null check (equipment_penalty_value is null or equipment_penalty_value >= 0),
  source_document text not null default '',
  commercial_terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_one_current_contract_idx
  on public.company_contracts(company_id)
  where status in ('pending_signature','active','suspended');

create table if not exists public.company_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  full_name text not null,
  role text not null check (role in ('company_admin','operator')),
  status text not null default 'active' check (status in ('invited','active','suspended','inactive')),
  pos_only boolean not null default false,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_members_company_role_idx
  on public.company_members(company_id, role, status);

create or replace function public.set_company_contract_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_contracts_set_updated_at on public.company_contracts;
create trigger company_contracts_set_updated_at before update on public.company_contracts
for each row execute function public.set_company_contract_updated_at();

drop trigger if exists company_members_set_updated_at on public.company_members;
create trigger company_members_set_updated_at before update on public.company_members
for each row execute function public.set_company_contract_updated_at();

alter table public.company_contracts enable row level security;
alter table public.company_members enable row level security;
revoke all on public.company_contracts, public.company_members from public, anon, authenticated;
grant select, insert, update on public.company_contracts, public.company_members to service_role;
grant delete on public.company_members to service_role;
grant delete on public.companies to service_role;

insert into public.companies (
  id, rut_number, rut_dv, business_name, trade_name, business_activity,
  address, district, city, region, country, primary_contact, email, phone,
  legal_representative, status, relationship_type, incorporated_on, notes
) values (
  'emp-5q','76540968','3','Inmobiliaria 5Q SpA','Inmobiliaria 5Q',
  'Servicios inmobiliarios y administración de estacionamientos',
  'Las Encinas 140','Cerrillos','Santiago','Metropolitana','Chile',
  'Guillermo Quintanilla Hernández','sin-correo@inmobiliaria5q.cl','Sin teléfono informado',
  'Guillermo Quintanilla Hernández','active','client','2026-07-09',
  'Empresa incorporada desde contrato de adhesión ParkFacil de fecha 09-07-2026. Correo y teléfono no constan en el documento.'
) on conflict (rut_number, rut_dv) do update set
  business_name=excluded.business_name,
  trade_name=excluded.trade_name,
  address=excluded.address,
  district=excluded.district,
  city=excluded.city,
  region=excluded.region,
  country=excluded.country,
  primary_contact=excluded.primary_contact,
  legal_representative=excluded.legal_representative,
  notes=excluded.notes,
  updated_at=now();

insert into public.company_contracts (
  company_id, contract_number, status, signed_on, starts_on, ends_on, duration_months,
  automatic_renewal, non_renewal_notice_days, currency, tax_label, monthly_value,
  monthly_value_source, annual_discount_percent, payment_due_days, reactivation_value,
  equipment_penalty_value, source_document, commercial_terms
) values (
  (select id from public.companies where rut_number='76540968' and rut_dv='3'),
  'ADH-5Q-2026-07-09','active','2026-07-09','2026-07-09','2027-07-09',12,
  true,30,'UF','+ IVA',null,'Tarifario web vigente al contratar',15,7,1,2,
  'CONTRATO DE ADHESIÓN Inmobiliaria 5Q Spa.pdf',
  jsonb_build_object(
    'billing_options', jsonb_build_array('12 cuotas mensuales anticipadas','1 cuota anual anticipada'),
    'late_suspension_days', 7,
    'termination_collection_days', 10,
    'equipment_return_business_days', 5,
    'service_availability_percent', 99.5,
    'source_clauses', jsonb_build_object(
      'currency', 'QUINTO',
      'payment', 'SEXTO',
      'equipment', 'SÉPTIMO',
      'service', 'ANEXO A'
    )
  )
) on conflict (contract_number) do update set
  company_id=excluded.company_id,
  status=excluded.status,
  signed_on=excluded.signed_on,
  starts_on=excluded.starts_on,
  ends_on=excluded.ends_on,
  duration_months=excluded.duration_months,
  automatic_renewal=excluded.automatic_renewal,
  non_renewal_notice_days=excluded.non_renewal_notice_days,
  currency=excluded.currency,
  tax_label=excluded.tax_label,
  monthly_value=excluded.monthly_value,
  monthly_value_source=excluded.monthly_value_source,
  annual_discount_percent=excluded.annual_discount_percent,
  payment_due_days=excluded.payment_due_days,
  reactivation_value=excluded.reactivation_value,
  equipment_penalty_value=excluded.equipment_penalty_value,
  source_document=excluded.source_document,
  commercial_terms=excluded.commercial_terms,
  updated_at=now();
