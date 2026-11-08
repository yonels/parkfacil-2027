-- SOL-2026-11-05-005: «Ciclo de facturación» por etapas (prototipo aprobado por el usuario el 2026-11-08: «Lo apruebo»).
-- Cada empresa avanza por 8 etapas en orden fijo. Casi todas se deducen de datos existentes (empresa, servicios,
-- prefactura, factura y correo); aquí solo se guardan:
--   1) la configuración de cada etapa (obligatoria / opcional / omitida, a mano / automática, responsable) y
--   2) las confirmaciones manuales por empresa y período (Datos, Servicios, Revisión, Envío).

alter table public.billing_settings add column if not exists cycle_config jsonb not null default '{}'::jsonb;

create table if not exists public.billing_cycle_confirmations (
  company_id text not null references public.companies(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  step text not null check (step in ('datos', 'servicios', 'revision', 'envio')),
  confirmed_by uuid null references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  primary key (company_id, period, step)
);

alter table public.billing_cycle_confirmations enable row level security;
revoke all on public.billing_cycle_confirmations from public, anon, authenticated;
grant select, insert, update, delete on public.billing_cycle_confirmations to service_role;
