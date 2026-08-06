# Etapa 3 - Lote C: abonados y credenciales

## Resultado

El modulo de abonados, vehiculos y credenciales queda protegido con Supabase Auth como unica fuente de autenticacion y con alcance calculado exclusivamente en el servidor.

- Root (`platform_admin`) conserva acceso global desde el Portal Root.
- `company_admin` consulta y administra solo abonados cuyo `empresa_id` coincide con su membresia activa.
- `operator` tiene solo lectura sobre abonados asociados a estacionamientos expresamente asignados mediante `company_member_parkings`.
- Escrituras, importaciones y envios de credenciales por un operador responden `403`.
- Recursos inexistentes, cruzados o fuera de una asignacion responden `404` sin revelar su existencia.
- Los listados, exportaciones y busquedas de importacion se filtran directamente en Supabase.

El `empresa_id` enviado por un cliente no autoriza. Para usuarios Cliente se reemplaza por `context.companyId`; para Root se valida una empresa cliente activa. Todo estacionamiento se valida contra la empresa antes de persistirlo. Las credenciales y vehiculos se resuelven a traves de su abonado padre.

## Endpoints

- `GET|POST /api/abonados`
- `GET|PATCH|PUT /api/abonados/[id]`
- `POST /api/abonados/[id]/credenciales/[credencialId]/enviar`
- `GET /api/abonados/exportar`
- `GET /api/abonados/plantilla`
- `POST /api/abonados/importar/validar`
- `POST /api/abonados/importar/confirmar`
- `POST /api/abonados/importar/errores`

Las vistas `/abonados` y `/abonados/[id]` dejaron de usar el catalogo demostrativo y cargan datos reales con el mismo alcance de servidor. La interfaz oculta la creacion al operador; esto es complementario y no sustituye el `403` de las APIs.

## Verificacion

- `npm run test:lot-c`: 36 pruebas aprobadas.
- ESLint dirigido: correcto.
- `npm run build`: correcto.
- Sin cambios de esquema, RLS ni migraciones en este lote.

## Archivos principales

Nuevos:

- `src/lib/auth/subscriberAuthorization.js`
- `src/lib/auth/subscriberAuthorizationCore.mjs`
- `src/lib/auth/subscriberAuthorizationCore.test.mjs`

Modificados:

- matriz central de permisos;
- repositorio de abonados;
- ocho rutas API de abonados, credenciales e importacion/exportacion;
- vistas principal y detalle de abonados;
- script de pruebas de `package.json`.
