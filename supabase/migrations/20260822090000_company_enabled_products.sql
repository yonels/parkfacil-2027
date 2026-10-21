-- Productos ParkFacil habilitados por empresa (Off Street / On Street).
--
-- Contexto (auditoría "ACCESO DIFERENCIADO OFF-STREET / ON-STREET"): antes de
-- esta migración no existía ninguna fuente de verdad inequívoca y ya poblada
-- para "qué producto contrató la empresa" -- commercial_plans.modules existe
-- en schema pero está vacía y sin UI real (solo la referencia un mock de
-- cliente en modelo-gestion-modulos/page.js, desconectado de la BD), y
-- parkings.type es por estacionamiento, no por empresa. Alternativa C
-- autorizada explícitamente por el cliente: columna explícita en companies.
--
-- companies.enabled_products es la fuente de verdad DEFINITIVA a partir de
-- esta migración -- parkings.type se usa aquí exclusivamente como señal de
-- backfill inicial (transición), nunca como fuente contractual permanente
-- (ver autorización "APLICAR MIGRACIÓN LOCAL Y VALIDAR ACCESO POR PRODUCTO",
-- §3). Ver src/lib/auth/permissions.mjs (resolveEnabledProducts,
-- canAccessPath) y apiAuthorizationCore.mjs (requireProduct) para el uso en
-- tiempo de ejecución.
alter table public.companies
  add column if not exists enabled_products text[] not null default '{}'::text[];

alter table public.companies
  drop constraint if exists companies_enabled_products_check;
alter table public.companies
  add constraint companies_enabled_products_check
  check (enabled_products <@ array['OFF_STREET','ON_STREET']::text[]);

-- Backfill de transición: para cada empresa que aún no tiene productos
-- asignados (columna recién creada, siempre '{}' en su primera fila), se
-- clasifica según los tipos de estacionamiento que YA tiene creados
-- (parkings.type distinto por empresa). Esto reproduce fielmente lo que la
-- empresa ya usa hoy -- no inventa productos que no tenga evidencia de usar.
-- Una empresa sin ningún estacionamiento (sin señal) queda en '{}' -- eso NO
-- es un error de esta migración, es el reflejo honesto de que no hay
-- información suficiente para clasificarla: requiere asignación manual de
-- Root (ver ficha de empresa) y queda documentada en la matriz QA de esta
-- ejecución, nunca inferida a ciegas.
update public.companies c
set enabled_products = coalesce((
  select array_agg(distinct p.type order by p.type)
  from public.parkings p
  where p.company_id = c.id and p.type in ('OFF_STREET','ON_STREET')
), '{}'::text[])
where c.enabled_products = '{}'::text[];

comment on column public.companies.enabled_products is
  'Productos ParkFacil habilitados para la empresa: OFF_STREET y/o ON_STREET. Fuente de verdad DEFINITIVA para autorización de acceso por producto -- ver resolveEnabledProducts/canAccessPath en src/lib/auth/permissions.mjs y requireProduct en apiAuthorizationCore.mjs. Backfill inicial (2026-08-22) clasificado desde parkings.type existente por empresa; empresas sin estacionamientos quedaron en {} y requieren asignación manual de Root. parkings.type NO debe volver a usarse como fuente de este campo tras el backfill -- toda asignación posterior es explícita, vía Root.';
