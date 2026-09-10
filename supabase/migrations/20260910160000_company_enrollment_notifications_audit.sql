-- Auditoría del envío/reenvío de enrolamiento (encargo "cierre de reenvío
-- de enrolamiento" 2026-09-10, §6): reutiliza la tabla ya existente
-- company_enrollment_notifications (creada en 20260910150000) en vez de un
-- sistema paralelo -- solo agrega lo que faltaba: quién lo solicitó y
-- cuántas cuentas se vieron afectadas. NUNCA guarda claves/secretos/tokens.
alter table public.company_enrollment_notifications
  add column if not exists requested_by uuid null references auth.users(id) on delete set null,
  add column if not exists accounts_count integer not null default 0;

comment on column public.company_enrollment_notifications.requested_by is
  'platform_admin (Root) que originó el envío/reenvío. Null si el registro es anterior a esta columna.';
comment on column public.company_enrollment_notifications.accounts_count is
  'Cantidad de cuentas iniciales incluidas en este envío (administrador + operadores).';

create index if not exists company_enrollment_notifications_requested_by_idx
  on public.company_enrollment_notifications(requested_by);
