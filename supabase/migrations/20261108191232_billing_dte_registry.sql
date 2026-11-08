-- SOL-2026-11-05-005, F2b: registro de DTE emitidos (como «Documentos Emitidos» de EasyDoc).
-- Decisión D10 (usuario, 2026-11-08): se cargan desde la planilla de EasyDoc o del Registro de Ventas del SII
-- (histórico) y se sincronizan a diario con Haulmer (/v2/dte/document/issued). Un documento por emisor + tipo + folio:
-- volver a importar actualiza estados, nunca duplica. No reemplaza billing_documents (lo emitido por ParkFacil):
-- el listado une ambos. Los importados no se vuelven a emitir.

create table if not exists public.billing_dte_registry (
  id uuid primary key default gen_random_uuid(),
  issuer_rut text not null,
  dte_type integer not null check (dte_type in (33, 34, 39, 41, 46, 52, 56, 61, 110, 111, 112)),
  folio bigint not null check (folio > 0),
  issue_date date not null,
  receiver_rut text not null,
  receiver_name text not null default '',
  company_id text null references public.companies(id) on delete set null,
  net_amount bigint not null default 0,
  exempt_amount bigint not null default 0,
  tax_amount bigint not null default 0,
  total_amount bigint not null default 0,
  voided boolean not null default false,
  sii_status text null,
  customer_response text null,
  sii_action text null,
  reference_dte_type integer null,
  reference_folio bigint null,
  track_id text null,
  provider_token text null,
  billing_document_id uuid null references public.billing_documents(id) on delete set null,
  source text not null check (source in ('EASYDOC', 'SII_RCV', 'HAULMER')),
  last_source text not null check (last_source in ('EASYDOC', 'SII_RCV', 'HAULMER')),
  import_batch_id uuid null,
  raw jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issuer_rut, dte_type, folio)
);

create index if not exists billing_dte_registry_issue_idx on public.billing_dte_registry(issue_date desc, dte_type, folio desc);
create index if not exists billing_dte_registry_receiver_idx on public.billing_dte_registry(receiver_rut);
create index if not exists billing_dte_registry_company_idx on public.billing_dte_registry(company_id);

-- Cada importación o sincronización deja constancia: quién, origen, cuántos nuevos/actualizados/omitidos.
create table if not exists public.billing_dte_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('EASYDOC', 'SII_RCV', 'HAULMER')),
  file_name text null,
  period_from date null,
  period_to date null,
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'FAILED')),
  total_rows integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  message text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists billing_dte_imports_created_idx on public.billing_dte_imports(created_at desc);

alter table public.billing_dte_registry enable row level security;
alter table public.billing_dte_imports enable row level security;
revoke all on public.billing_dte_registry, public.billing_dte_imports from public, anon, authenticated;
grant select, insert, update, delete on public.billing_dte_registry, public.billing_dte_imports to service_role;
