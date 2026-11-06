-- SOL-2026-11-05-005, F1.1: catálogo de servicios y productos de ParkFacil.
-- Reutiliza public.billable_concepts (creada en 20260810120000) y le agrega lo necesario para
-- mantenerlo desde Facturación → Configuración: tipo (servicio/producto), precio de referencia
-- (UF neto por defecto, decisión D2), periodicidad y quién lo modificó. Los 16 conceptos existentes
-- se conservan y se editan desde la pantalla (decisión del usuario 2026-11-05).
-- El precio de referencia solo propone un valor: lo que se factura sigue en contract_billable_items.

alter table public.billable_concepts
  add column if not exists item_kind text not null default 'SERVICE',
  add column if not exists reference_price numeric(18,4) null,
  add column if not exists reference_currency text not null default 'UF',
  add column if not exists periodicity text not null default 'MONTHLY',
  add column if not exists updated_by uuid null references auth.users(id) on delete set null;

alter table public.billable_concepts drop constraint if exists billable_concepts_item_kind_check;
alter table public.billable_concepts add constraint billable_concepts_item_kind_check
  check (item_kind in ('SERVICE','PRODUCT'));
alter table public.billable_concepts drop constraint if exists billable_concepts_reference_price_check;
alter table public.billable_concepts add constraint billable_concepts_reference_price_check
  check (reference_price is null or reference_price >= 0);
alter table public.billable_concepts drop constraint if exists billable_concepts_reference_currency_check;
alter table public.billable_concepts add constraint billable_concepts_reference_currency_check
  check (reference_currency in ('UF','CLP'));
alter table public.billable_concepts drop constraint if exists billable_concepts_periodicity_check;
alter table public.billable_concepts add constraint billable_concepts_periodicity_check
  check (periodicity in ('MONTHLY','ANNUAL','ONE_TIME'));

-- Los conceptos de dispositivos y equipos existentes se marcan como producto; los de pago único, como única vez.
update public.billable_concepts set item_kind = 'PRODUCT' where category = 'DEVICE' and item_kind = 'SERVICE';
update public.billable_concepts set periodicity = 'ONE_TIME'
  where code in ('IMPLEMENTATION','INTEGRATION','SPECIAL_SERVICE') and periodicity = 'MONTHLY';

create table if not exists public.billable_concepts_audit (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.billable_concepts(id) on delete cascade,
  action text not null check (action in ('CREATED','UPDATED','ACTIVATED','DEACTIVATED')),
  actor_id uuid null references auth.users(id) on delete set null,
  previous_value jsonb null,
  new_value jsonb null,
  created_at timestamptz not null default now()
);
create index if not exists billable_concepts_audit_concept_idx on public.billable_concepts_audit(concept_id, created_at desc);

alter table public.billable_concepts_audit enable row level security;
revoke all on public.billable_concepts_audit from public, anon, authenticated;
grant select, insert on public.billable_concepts_audit to service_role;
