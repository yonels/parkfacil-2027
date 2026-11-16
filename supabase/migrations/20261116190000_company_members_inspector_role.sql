-- SOL-2026-11-16-003: inspectores On Street propios de cada cliente.
--
-- El inspector pasa a ser un miembro de empresa más (company_members), igual
-- que administradores y operadores, para que el Catálogo de usuarios lo liste
-- y el administrador de la empresa pueda crearlo, editarlo, desactivarlo y
-- eliminarlo. app_metadata.role = 'inspector' se mantiene: es lo que encierra
-- la cuenta en el portal /inspector.
--
-- Cambio aditivo: solo amplía el CHECK de role y crea la membresía de los
-- inspectores que hoy no tienen empresa. No borra ni modifica filas
-- existentes de company_members.

alter table public.company_members drop constraint if exists company_members_role_check;
alter table public.company_members
  add constraint company_members_role_check
  check (role in ('company_admin', 'operator', 'inspector'));

-- Decisión P5 del usuario (2026-11-16): los inspectores existentes sin
-- empresa quedan en ParkFacil Operaciones Spa (emp-001), donde están sus
-- fiscalizaciones. Si emp-001 no existe (base local o de QA sin esa empresa)
-- no se inserta nada: el inspector queda sin membresía y no puede iniciar
-- sesión hasta asignarle una empresa desde el Catálogo de usuarios.
insert into public.company_members (user_id, company_id, full_name, role, status, pos_only, must_change_password)
select
  u.id,
  'emp-001',
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), u.email, 'Inspector'),
  'inspector',
  case when u.banned_until is not null and u.banned_until > now() then 'inactive' else 'active' end,
  false,
  coalesce((u.raw_user_meta_data->>'must_change_password')::boolean, false)
from auth.users u
where u.raw_app_meta_data->>'role' = 'inspector'
  and not exists (select 1 from public.company_members m where m.user_id = u.id)
  and exists (select 1 from public.companies c where c.id = 'emp-001');
