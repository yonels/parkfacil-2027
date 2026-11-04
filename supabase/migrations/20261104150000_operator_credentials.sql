-- Reporte de claves de operadores (SOL-2026-11-04-004). Supabase Auth no entrega las claves,
-- así que se guarda una copia cifrada (AES-256-GCM en la aplicación) de la última clave que
-- definió un administrador. Solo el servidor accede: sin políticas ni permisos para los clientes.

create table if not exists public.operator_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id text not null references public.companies(id) on delete cascade,
  password_ciphertext text not null,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists operator_credentials_company_idx on public.operator_credentials(company_id);

-- Auditoría de cada clave guardada y de cada vez que alguien la ve. No guarda la clave.
create table if not exists public.operator_credential_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null references public.companies(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  action text not null check (action in ('SAVED', 'VIEWED')),
  created_at timestamptz not null default now()
);

create index if not exists operator_credential_events_user_idx on public.operator_credential_events(user_id, created_at desc);

alter table public.operator_credentials enable row level security;
alter table public.operator_credential_events enable row level security;

revoke all on table public.operator_credentials from public, anon, authenticated;
revoke all on table public.operator_credential_events from public, anon, authenticated;
grant select, insert, update, delete on table public.operator_credentials to service_role;
grant select, insert on table public.operator_credential_events to service_role;
