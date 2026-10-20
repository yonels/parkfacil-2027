-- Boleta electrónica en el pago en efectivo del POS (SOL-2026-10-20-001).
--
-- 1) Datos del emisor en la configuración de la empresa (el RUT se toma de la
--    empresa): razón social, giro, dirección/comuna/ciudad de origen y código de
--    sucursal SII por estacionamiento ({ "<parking_id>": "81303347" }).
-- 2) Boleta emitida por cada pago (folio, token, TED para el PDF417 impreso por
--    la APK y timbre PNG para la vista web). Una fila por estadía pagada; la
--    llave de idempotencia (código PAG) evita emitir dos veces.
-- Solo service_role accede (las API validan rol y empresa).

alter table public.company_dte_settings
  add column if not exists emitter_business_name text null,
  add column if not exists emitter_activity text null,
  add column if not exists emitter_address text null,
  add column if not exists emitter_commune text null,
  add column if not exists emitter_city text null,
  add column if not exists parking_branch_codes jsonb not null default '{}'::jsonb;

alter table public.company_dte_settings drop constraint if exists company_dte_settings_branch_codes_check;
alter table public.company_dte_settings add constraint company_dte_settings_branch_codes_check check (jsonb_typeof(parking_branch_codes) = 'object');

create table if not exists public.parking_stay_dte_documents (
  stay_id uuid primary key references public.parking_stays(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  provider text not null default 'HAULMER',
  environment text not null,
  document_type integer not null default 39,
  status text not null,
  idempotency_key text not null,
  payment_code text not null,
  total_amount integer not null,
  net_amount integer null,
  tax_amount integer null,
  folio bigint null,
  provider_token text null,
  ted text null,
  stamp_png_base64 text null,
  resolution_date date null,
  resolution_number integer null,
  warning jsonb null,
  error_code text null,
  error_message text null,
  attempts integer not null default 1,
  issued_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parking_stay_dte_documents_status_check check (status in ('ISSUED', 'FAILED')),
  constraint parking_stay_dte_documents_environment_check check (environment in ('TEST', 'PRODUCTION')),
  constraint parking_stay_dte_documents_issued_check check (status <> 'ISSUED' or (folio is not null or provider_token is not null)),
  constraint parking_stay_dte_documents_idempotency_unique unique (idempotency_key)
);

comment on table public.parking_stay_dte_documents is 'Boleta electrónica (Haulmer OpenFactura) emitida por el pago en efectivo de una estadía. FAILED: el pago quedó registrado sin boleta.';

create index if not exists parking_stay_dte_documents_company_idx on public.parking_stay_dte_documents (company_id, created_at desc);
create index if not exists parking_stay_dte_documents_failed_idx on public.parking_stay_dte_documents (status) where status = 'FAILED';

alter table public.parking_stay_dte_documents enable row level security;
revoke all on table public.parking_stay_dte_documents from public, anon, authenticated;
grant select, insert, update on table public.parking_stay_dte_documents to service_role;
