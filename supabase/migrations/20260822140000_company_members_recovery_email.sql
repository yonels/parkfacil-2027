-- Separa la identidad de acceso (auth.users.email) del correo real usado
-- para recuperación y comunicaciones de seguridad.
--
-- Deliberadamente nullable y sin backfill: los identificadores internos
-- @usuarios.parkfacil.cl y las cuentas QA no representan buzones reales.
alter table public.company_members
  add column if not exists recovery_email text null;

comment on column public.company_members.recovery_email is
  'Correo real para recuperación de contraseña y comunicaciones de seguridad; no modifica auth.users.email.';
