-- SOL-2026-11-12-004, etapa 3 (segunda mitad): boleta electrónica en
-- pagos On Street (Webpay). `on_street_payment_intents` es un esquema
-- totalmente aparte de `parking_stays` (sin stay_id), así que
-- `parking_stay_dte_documents` no se puede reutilizar -- su `stay_id` es
-- FK dura a `parking_stays`. Misma estructura, pero con su propia tabla.

create table if not exists public.on_street_payment_intent_dte_documents (
  intent_id uuid primary key references public.on_street_payment_intents(id) on delete restrict,
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
  constraint on_street_dte_status_check check (status in ('ISSUED', 'FAILED')),
  constraint on_street_dte_environment_check check (environment in ('TEST', 'PRODUCTION')),
  constraint on_street_dte_issued_check check (status <> 'ISSUED' or (folio is not null or provider_token is not null)),
  constraint on_street_dte_idempotency_unique unique (idempotency_key)
);

comment on table public.on_street_payment_intent_dte_documents is
  'Boleta electrónica (Haulmer OpenFactura) de un pago Webpay On Street. FAILED: el pago quedó registrado sin boleta.';

create index if not exists on_street_dte_company_idx on public.on_street_payment_intent_dte_documents (company_id, created_at desc);
create index if not exists on_street_dte_failed_idx on public.on_street_payment_intent_dte_documents (status) where status = 'FAILED';

alter table public.on_street_payment_intent_dte_documents enable row level security;
revoke all on table public.on_street_payment_intent_dte_documents from public, anon, authenticated;
grant select, insert, update on table public.on_street_payment_intent_dte_documents to service_role;
