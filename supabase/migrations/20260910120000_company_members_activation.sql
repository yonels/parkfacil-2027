-- Modelo de activación de usuarios por empresa, controlado desde Root.
--
-- Contexto: hasta ahora company_members.status ya soportaba
-- invited/active/suspended/inactive, pero no existía forma de saber QUIÉN
-- activó/suspendió a un usuario, NI CUÁNDO, ni de darle acceso temporal con
-- vencimiento. Tampoco existía ningún campo que distinguiera, dentro de una
-- misma empresa con ambos productos habilitados, qué usuarios operan Off
-- Street y cuáles operan On Street (companies.enabled_products es a nivel
-- EMPRESA, no por usuario).
--
-- Esta migración es puramente aditiva (columnas nullable, sin backfill
-- destructivo) -- no rompe ningún company_members existente. Todos los
-- registros históricos verificados antes de escribir esta migración (10
-- filas reales) pertenecen a empresas con un solo producto habilitado
-- (OFF_STREET), por lo que dejarlos con product_scope=NULL es seguro: la
-- interpretación en código (ver src/lib/auth/memberActivationCore.mjs,
-- applyProductScope) trata NULL como "sin restricción adicional -- hereda
-- los productos de la empresa", que es exactamente el comportamiento que
-- ya tenían hoy. No se infiere ni se adivina ningún product_scope por
-- backfill.

alter table public.company_members
  add column if not exists product_scope text null
    check (product_scope in ('OFF_STREET', 'ON_STREET', 'BOTH')),
  add column if not exists access_expires_at timestamptz null,
  add column if not exists activated_at timestamptz null,
  add column if not exists activated_by uuid null references auth.users(id),
  add column if not exists suspended_at timestamptz null,
  add column if not exists suspended_by uuid null references auth.users(id);

comment on column public.company_members.product_scope is
  'Alcance operativo del usuario DENTRO de su empresa: OFF_STREET, ON_STREET o BOTH. Distinto de companies.enabled_products (lo que la empresa contrató) -- este campo solo puede RESTRINGIR más, nunca ampliar, lo que la empresa ya tiene habilitado. NULL en registros históricos = sin restricción adicional (hereda los productos de la empresa, mismo comportamiento previo a esta migración). Ver applyProductScope en src/lib/auth/memberActivationCore.mjs.';

comment on column public.company_members.access_expires_at is
  'Vencimiento de acceso temporal. NULL = acceso indefinido (mientras status=active). Fecha pasada con status=active = acceso vencido (rechazado server-side, ver isMembershipWithinAccessWindow) -- no existe un status "expired" propio, es un estado calculado.';

comment on column public.company_members.activated_at is
  'Cuándo se activó por última vez el acceso (indefinido o temporal). Se establece exclusivamente por el endpoint de activación de Root (POST /api/usuarios/[id]/activacion), nunca por el usuario ni por su company_admin.';

comment on column public.company_members.activated_by is
  'platform_admin (auth.users.id) que activó el acceso. FK simple a auth.users -- mismo patrón que el resto del esquema para referenciar personas (no existe tabla separada de administradores; un platform_admin es una fila de auth.users con app_metadata.role=platform_admin). Columna nueva y nullable: sin datos históricos que puedan violar la FK.';

comment on column public.company_members.suspended_at is
  'Cuándo se suspendió el acceso. Igual patrón que activated_at.';

comment on column public.company_members.suspended_by is
  'platform_admin (auth.users.id) que suspendió el acceso. Igual patrón que activated_by.';

create index if not exists company_members_access_expires_idx
  on public.company_members(access_expires_at)
  where access_expires_at is not null;
