-- Trazabilidad del correo de enrolamiento (resumen de cuentas iniciales)
-- enviado al CORREO DE CONTACTO DE LA EMPRESA tras crear una empresa y sus
-- 3 cuentas. Mismo patrón que abonado_credencial_envios (ver
-- supabase/migrations/20260727131500_abonado_credencial_envios.sql):
-- pending -> sent | failed, para poder reintentar sin volver a crear nada.
-- NUNCA guarda claves ni contraseñas -- solo el resultado del envío.
create table if not exists public.company_enrollment_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on update cascade on delete cascade,
  destinatario text not null,
  asunto text not null,
  proveedor text not null default 'microsoft_graph',
  estado text not null default 'pending' check (estado in ('pending','sent','failed')),
  error_mensaje text null,
  enviado_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_enrollment_notifications_company_idx
  on public.company_enrollment_notifications(company_id, created_at desc);

create or replace function public.set_company_enrollment_notifications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists company_enrollment_notifications_set_updated_at on public.company_enrollment_notifications;
create trigger company_enrollment_notifications_set_updated_at before update on public.company_enrollment_notifications
for each row execute function public.set_company_enrollment_notifications_updated_at();

alter table public.company_enrollment_notifications enable row level security;
revoke all on public.company_enrollment_notifications from public, anon, authenticated;
grant select, insert, update on public.company_enrollment_notifications to service_role;
