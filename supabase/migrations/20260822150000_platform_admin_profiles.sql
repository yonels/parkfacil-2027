-- Perfil de seguridad 1:1 para cuentas Root. No duplica identidad, nombre,
-- rol ni empresa: auth.users continúa siendo la fuente de autenticación.
create table if not exists public.platform_admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_admin_profiles is
  'Perfil de seguridad para platform_admin; acceso exclusivo mediante endpoints server-side.';

comment on column public.platform_admin_profiles.recovery_email is
  'Destinatario de recuperación y comunicaciones de seguridad; no es una identidad de login.';

alter table public.platform_admin_profiles enable row level security;

revoke all on public.platform_admin_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admin_profiles to service_role;
