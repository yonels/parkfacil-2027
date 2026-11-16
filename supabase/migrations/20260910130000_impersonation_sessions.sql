-- Auditoría de impersonación Root -> Cliente ("Entrar como cliente").
--
-- No existía ninguna tabla de auditoría general reutilizable en el
-- proyecto (confirmado por diagnóstico: sin audit_log/security_event en
-- ninguna migración). Se crea esta tabla estrictamente para el caso de
-- impersonación -- no es una infraestructura de auditoría genérica para
-- todo el sistema (eso queda fuera de alcance, ver reporte).
--
-- root_user_id: SIEMPRE el platform_admin real que inició la sesión --
-- nunca el company_admin impersonado. Es la fuente de verdad para "quién
-- realizó esto realmente" (§5 del encargo: "no falsear auditoría diciendo
-- que Yonel/company_admin hizo una modificación si realmente la realizó
-- Root").
create table if not exists public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  root_user_id uuid not null references auth.users(id),
  company_id text not null references public.companies(id) on update cascade on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  ended_reason text null check (ended_reason in ('manual', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);

comment on table public.impersonation_sessions is
  'Auditoría de sesiones de impersonación Root -> Cliente ("Entrar como cliente"). root_user_id es siempre el platform_admin real, nunca el company_admin impersonado -- ver src/lib/auth/impersonationCore.mjs.';

create index if not exists impersonation_sessions_root_idx on public.impersonation_sessions(root_user_id, started_at desc);
create index if not exists impersonation_sessions_company_idx on public.impersonation_sessions(company_id, started_at desc);

-- Como máximo una sesión de impersonación ABIERTA (ended_at is null) por
-- platform_admin a la vez -- evita que Root acumule sesiones huérfanas sin
-- cerrar si navega directamente a otra empresa sin pasar por "Salir".
create unique index if not exists impersonation_sessions_one_open_per_root_idx
  on public.impersonation_sessions(root_user_id)
  where ended_at is null;

alter table public.impersonation_sessions enable row level security;
revoke all on public.impersonation_sessions from public, anon, authenticated;
grant select, insert, update on public.impersonation_sessions to service_role;
