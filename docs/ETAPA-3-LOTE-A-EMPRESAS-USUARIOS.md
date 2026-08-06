# Etapa 3 — Lote A: empresas y usuarios

## Alcance

El Lote A protege las APIs y consultas de empresas y usuarios con el contexto central creado en la Etapa 2. Supabase Auth continúa autenticando la identidad y la sesión; ParkFacil obtiene desde `company_members` el rol y la empresa autorizados para decidir el acceso.

No se modificaron migraciones ni políticas RLS. Las APIs de los lotes B–E permanecen fuera de este cierre.

## Rutas protegidas

| Ruta | platform_admin / Root | company_admin / Cliente | operator / Cliente |
| --- | --- | --- | --- |
| `GET /api/empresas` | Listado global | Solo su empresa | Solo su empresa |
| `POST /api/empresas` | Permitido | 403 | 403 |
| `PATCH /api/empresas/[id]` | Permitido; 404 si no existe | 403 | 403 |
| `GET /api/usuarios` | Listado global | Solo miembros de su empresa | 403 |
| `POST /api/usuarios/[id]/credencial` | Usuarios Cliente globales | Solo usuarios de su empresa | 403 |

Todas las rutas responden 401 cuando Supabase Auth no valida la sesión. La consulta o modificación de un usuario perteneciente a otra empresa responde 404 y no revela su existencia.

## Aislamiento aplicado

- `companyId` y rol Cliente proceden exclusivamente del contexto construido desde `company_members`.
- Los listados Cliente agregan `.eq("company_id", context.companyId)` o su equivalente antes de ejecutar la consulta.
- El repositorio de usuarios obtiene primero los UUID de miembros autorizados. Solo después consulta Supabase Auth para esos UUID.
- La regeneración de credenciales valida primero la fila de `company_members` y su pertenencia; solo entonces consulta o actualiza el usuario en Supabase Auth.
- El identificador opcional de empresa enviado al crear una empresa dejó de utilizarse: el servidor genera el ID.
- El cliente service-role permanece limitado a operaciones que ya pasaron autorización y filtros explícitos.

## Registro de accesos denegados

Las denegaciones producen un evento JSON estructurado en el log del servidor con:

- `userId`;
- `companyId`;
- `portal`;
- IP obtenida de `x-forwarded-for` o `x-real-ip`;
- ruta;
- fecha UTC;
- motivo estable;
- código HTTP.

No se copian headers completos, cookies, tokens, contraseñas ni cuerpos de solicitudes. La persistencia en tabla se pospone porque este lote no autoriza migraciones.

## Demostración de permisos

Las pruebas automatizadas demuestran que:

- Root acepta un recurso de cualquier empresa y no recibe filtro empresarial.
- `company_admin` acepta recursos de su empresa.
- Cambiar el ID por uno de otra empresa produce `RESOURCE_NOT_FOUND` con HTTP 404.
- `operator` recibe HTTP 403 al intentar administrar usuarios o credenciales.
- El mapeo de usuarios Cliente no incorpora miembros, estacionamientos ni cuentas Auth de otra empresa.
- El evento de denegación contiene los campos requeridos y no incluye el token de la solicitud.

## Verificación

- `npm run test:lot-a`: 16 pruebas aprobadas.
- ESLint dirigido a los archivos del lote: sin errores ni advertencias.
- `npm run build`: compilación correcta.
- Advertencia preexistente: trazado amplio de `src/lib/documentos.js` durante el build.

## Pendientes

- Lote B: estacionamientos y estructura, incluyendo `company_member_parkings` para operadores.
- Lote C: abonados y credenciales.
- Lote D: turnos, cierres y operación.
- Lote E: notificaciones, cupones y rutas restantes.
- Etapa 4: políticas RLS definitivas y persistencia de auditoría si se aprueba una tabla dedicada.
