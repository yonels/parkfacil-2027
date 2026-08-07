# Etapa 4 - cierre de produccion

## Implementacion

La migracion `20260806120000_definitive_tenant_rls.sql` reemplaza las politicas historicas permisivas mediante una capa RLS definitiva para 33 tablas. No modifica migraciones historicas ni elimina datos.

La politica deriva la empresa desde `company_members`, exige membresia y empresa cliente activas, y limita operadores mediante `company_member_parkings`. Root se identifica mediante el claim firmado de Supabase Auth y mantiene alcance global. Se incorporan funciones `security definer` con `search_path` fijo y permisos de ejecucion restringidos.

Cobertura:

- empresas, contratos, miembros y asignaciones;
- estacionamientos y toda su estructura;
- turnos, cierres, incidencias, movimientos y estadias;
- abonados, vehiculos, credenciales, responsables y envios;
- notificaciones e intentos;
- comercios y cupones;
- planes y tarifario comercial.

Las tablas quedan con RLS habilitado y forzado. Las operaciones de lectura/escritura aplican empresa, estacionamiento, rol y entidad padre. Se agregan indices GIN y compuestos para los filtros de pertenencia usados con mayor frecuencia.

## Decision arquitectonica: catalogo comercial compartido (commercial_plans, module_pricing)

`commercial_plans` y `module_pricing` no pertenecen a una empresa cliente especifica: son catalogos corporativos administrados por ParkFacil y compartidos entre todas las empresas (planes comerciales y tarifario de modulos). Se verifico el esquema de ambas tablas (`20260802170000_commercial_plans.sql`, `20260729113000_module_pricing_security.sql`) y ninguna contiene `company_id` ni columna que identifique un tenant.

Por esa razon, sus politicas de lectura (`commercial_plans_read`, `module_pricing_read`) usan `using (true)`, habilitando lectura a cualquier usuario autenticado del Portal Cliente. La escritura, creacion, modificacion y eliminacion (`commercial_plans_root_write`, `module_pricing_root_write`) permanece restringida exclusivamente a `platform_admin`. Ninguna empresa cliente puede modificar estos catalogos.

Nota tecnica: las migraciones originales de ambas tablas revocan explicitamente todos los privilegios de `public`/`anon`/`authenticated` y solo otorgan `select`/`insert`/`update` a `service_role`. Esta migracion no agrega un `grant select ... to authenticated`, por lo que el acceso directo (PostgREST o cliente Supabase desde el navegador) sigue bloqueado a nivel de privilegios; la lectura continua sirviendose a traves de las rutas de API existentes (`/api/planes`, `/api/tarifario-modulos`), que usan el cliente `service_role`. La policy `using(true)` queda preparada para el dia en que se decida habilitar lectura directa, sin representar una exposicion adicional hoy.

Si en el futuro estos catalogos evolucionan para soportar planes personalizados por empresa, deberan migrarse a un modelo multi-tenant independiente (con `company_id` y politica acotada por tenant), y no reutilizar esta tabla compartida.

## Limpieza y seguridad

- Se elimino `supabaseAuthServer.js`, autenticador temporal ya sin consumidores.
- Las APIs de negocio usan el contexto central y Supabase Auth permanece como unica fuente de autenticacion.
- Los logs de denegaciones conservan solo campos estructurados y no incluyen tokens, cookies, claves ni bodies completos.
- La navegacion por rol sigue siendo una ayuda visual y no reemplaza APIs ni RLS.

## Estado de aplicacion remota

La migracion esta lista para aplicarse al proyecto Supabase enlazado. El `db push --dry-run` remoto fue bloqueado por falta de una contraseña PostgreSQL valida (`SUPABASE_DB_PASSWORD`). La Etapa 4 no puede declararse desplegada ni lista para produccion hasta aplicar la migracion y ejecutar las comprobaciones RLS remotas.
