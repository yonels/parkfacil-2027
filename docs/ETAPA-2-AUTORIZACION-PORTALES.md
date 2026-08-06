# Etapa 2: contexto central y protección inicial

## Alcance

Esta etapa agrega autenticación central del servidor, separación Root/Cliente, matriz inicial de permisos, protección de páginas y navegación por rol. No protege todavía el conjunto completo de APIs ni agrega las políticas RLS definitivas; esos controles pertenecen a las etapas 3 y 4.

## Determinación del contexto

1. El portal se determina en el servidor desde `x-forwarded-host` o `host`: `cliente.parkfacilapp.cl` corresponde a Cliente y el resto a Root. En desarrollo, `cliente.localhost` representa Cliente y `localhost` representa Root.
2. El usuario se valida con `supabase.auth.getUser(accessToken)`. El token se guarda en una cookie HttpOnly, `Secure` en producción y `SameSite=Lax`; no se registra en logs.
3. `platform_admin` se toma del usuario autenticado, no consulta membresía y solo se acepta en Root. Su `companyId` siempre es `null`.
4. Para cualquier cuenta Cliente, el rol y `companyId` se obtienen exclusivamente de `company_members` consultando por el UUID autenticado.
5. La membresía debe estar `active`; su rol debe ser `company_admin` u `operator`; la empresa relacionada debe estar `active` y tener `relationship_type = 'client'`.
6. El `company_id` presente en body, query, headers o metadatos del navegador no participa en la decisión de autorización.

## Comportamiento

- Sin cookie o con sesión inválida: redirección a `/login?next=...`.
- Con sesión válida pero portal, rol o ruta incompatibles: respuesta HTTP 403.
- Root: `platform_admin` conserva alcance global y no queda ligado a una empresa.
- Cliente: `company_admin` puede entrar a administración de usuarios de su empresa; `operator` queda limitado a módulos operativos.
- Las páginas Root iniciales son `/empresas`, `/contratos` y `/modelo-gestion-modulos`.

## Matriz inicial

| Permiso | platform_admin | company_admin | operator |
| --- | --- | --- | --- |
| Alcance global | Sí | No | No |
| Consultar empresa propia | Sí | Sí | Sí |
| Administrar empresa propia | Sí | Sí | No |
| Administrar usuarios | Sí | Sí | No |
| Consultar estacionamientos | Sí | Sí | Sí |
| Configurar estacionamientos | Sí | Sí | No |
| Funciones operativas | Sí | Sí | Sí |
| Reportes | Sí | Sí | No, pendiente de definición |

La ocultación de enlaces en Sidebar y navegación móvil es únicamente una ayuda visual. No reemplaza la protección del proxy, la autorización de cada API ni las futuras políticas RLS.

## Límites pendientes

- Las 47 rutas API auditadas no se intervinieron en bloque en esta etapa.
- El matcher del proxy excluye `/api`; cada API deberá adoptar el contexto central durante la Etapa 3.
- No se creó ni modificó ninguna migración.
- Las políticas RLS históricas aún no constituyen aislamiento multiempresa.
