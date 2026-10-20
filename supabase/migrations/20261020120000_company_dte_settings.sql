-- Boleta electrónica (DTE) por empresa cliente: configuración Haulmer
-- (SOL-2026-10-20-001).
--
-- Decisión del usuario: la API Key la ingresa el administrador de la empresa en
-- Tarifas → Módulos adicionales → Boleta electrónica; Root solo ve el estado.
-- Esta etapa solo guarda la configuración: la emisión de boletas queda para
-- cuando exista la documentación de Haulmer.
--
-- La API Key se guarda CIFRADA por la aplicación (AES-256-GCM, clave en la
-- variable DTE_API_KEY_ENCRYPTION_KEY); la base nunca recibe el texto plano.
-- Solo service_role accede a las tablas (las API validan rol y empresa).

create table if not exists public.company_dte_settings (
  company_id text primary key references public.companies(id) on delete cascade,
  provider text not null default 'HAULMER',
  environment text not null default 'TEST',
  api_key_ciphertext text null,
  api_key_last4 text null,
  enabled_parking_ids uuid[] not null default '{}'::uuid[],
  updated_by uuid null,
  updated_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_dte_settings_provider_check check (provider in ('HAULMER')),
  constraint company_dte_settings_environment_check check (environment in ('TEST', 'PRODUCTION')),
  constraint company_dte_settings_last4_check check (api_key_last4 is null or api_key_last4 ~ '^[A-Za-z0-9_-]{1,4}$'),
  constraint company_dte_settings_key_pair_check check ((api_key_ciphertext is null) = (api_key_last4 is null))
);

comment on table public.company_dte_settings is 'Boleta electrónica (DTE) por empresa: proveedor, ambiente, API Key cifrada y estacionamientos habilitados. Sin emisión todavía.';
comment on column public.company_dte_settings.api_key_ciphertext is 'API Key del proveedor cifrada por la aplicación (AES-256-GCM). Nunca texto plano.';
comment on column public.company_dte_settings.api_key_last4 is 'Últimos 4 caracteres de la API Key, solo para mostrarla enmascarada.';

-- Auditoría: qué cambió y quién, SIN la API Key (solo si se cargó o quitó).
create table if not exists public.company_dte_settings_audit (
  id bigint generated always as identity primary key,
  company_id text not null references public.companies(id) on delete cascade,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  actor_id uuid null,
  actor_email text null,
  created_at timestamptz not null default now(),
  constraint company_dte_settings_audit_action_check check (action in ('SETTINGS_SAVED', 'API_KEY_SET', 'API_KEY_REPLACED', 'API_KEY_REMOVED'))
);

create index if not exists company_dte_settings_audit_company_idx on public.company_dte_settings_audit (company_id, created_at desc);

alter table public.company_dte_settings enable row level security;
alter table public.company_dte_settings_audit enable row level security;

revoke all on table public.company_dte_settings from public, anon, authenticated;
revoke all on table public.company_dte_settings_audit from public, anon, authenticated;
grant select, insert, update, delete on table public.company_dte_settings to service_role;
grant select, insert on table public.company_dte_settings_audit to service_role;
