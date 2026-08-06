# Etapa 3 - Lote B: estacionamientos y estructura

## Alcance cerrado

Este lote protege estacionamientos, configuracion, niveles, zonas, sectores, calles, tramos, tarifas y asignaciones de operadores. No incluye turnos, cierres, incidencias, dispositivos asociados a turnos, abonados, notificaciones ni cupones.

Supabase Auth sigue siendo la fuente unica de autenticacion. La aplicacion obtiene la identidad autenticada desde Supabase en el servidor; ningun `user_id`, rol, membresia, `company_id` o `parking_id` recibido desde el navegador se considera una autorizacion.

No se modificaron migraciones historicas ni se implemento RLS definitivo. Esa labor permanece reservada para la Etapa 4.

## Contexto y reglas de acceso

- `platform_admin`: acceso global solamente desde Portal Root. No se limita por empresa.
- `company_admin`: acceso desde Portal Cliente y exclusivamente a filas con `parkings.company_id = context.companyId`.
- `operator`: acceso desde Portal Cliente, solo lectura y exclusivamente a estacionamientos de su empresa que tengan una asignacion explicita en `company_member_parkings` para `context.userId`.
- Un operador no obtiene acceso al resto de los estacionamientos por pertenecer a la misma empresa.
- Una escritura solicitada por un operador responde `403` antes de ejecutar la operacion.

Los listados se restringen en las consultas a Supabase. No se hacen lecturas globales para filtrar tenants posteriormente en memoria.

## Cadenas de pertenencia

Cada identificador se resuelve en el servidor y se comprueba contra el estacionamiento previamente autorizado:

- nivel -> estacionamiento;
- zona -> nivel -> estacionamiento;
- sector -> estacionamiento;
- calle -> sector -> estacionamiento;
- tramo -> calle -> sector -> estacionamiento;
- tarifa -> estacionamiento;
- bloque tarifario -> tarifa -> estacionamiento;
- asignacion -> calle/sector -> estacionamiento.

En inserciones y modificaciones, el `parking_id` efectivo proviene del estacionamiento resuelto, no del body. Los identificadores de operadores y supervisores se validan contra membresia activa, empresa, rol y asignacion al estacionamiento cuando corresponde.

## Politica HTTP y auditoria

- `401`: no existe autenticacion valida.
- `403`: existe autenticacion, pero falta permiso funcional.
- `404`: el recurso no existe, pertenece a otra empresa o el estacionamiento no esta asignado al operador.

La respuesta `404` no distingue entre inexistencia y pertenencia a otro tenant. Las denegaciones usan el logger central con usuario, empresa, portal, IP, ruta, fecha, motivo y codigo HTTP. No se registran tokens, cookies, contrasenas, claves ni cuerpos completos.

## Endpoints protegidos

- `GET|POST /api/estacionamientos`
- `PATCH /api/estacionamientos/[id]`
- `GET /api/estacionamientos/[id]/configuracion`
- `POST /api/estacionamientos/[id]/activar`
- `PATCH /api/estacionamientos/[id]/tipo`
- `GET|POST /api/estacionamientos/[id]/niveles`
- `PATCH /api/estacionamientos/[id]/niveles/[nivelId]`
- `GET|POST /api/estacionamientos/[id]/niveles/[nivelId]/zonas`
- `PATCH /api/estacionamientos/[id]/niveles/[nivelId]/zonas/[zonaId]`
- `GET|POST /api/estacionamientos/[id]/sectores`
- `GET|PATCH /api/estacionamientos/[id]/sectores/[sectorId]`
- `GET|POST /api/estacionamientos/[id]/sectores/[sectorId]/calles`
- `PATCH /api/estacionamientos/[id]/sectores/[sectorId]/calles/[calleId]`
- `GET|POST /api/estacionamientos/[id]/sectores/[sectorId]/calles/[calleId]/tramos`
- `PATCH /api/estacionamientos/[id]/sectores/[sectorId]/calles/[calleId]/tramos/[tramoId]`
- `POST /api/estacionamientos/[id]/sectores/[sectorId]/calles/[calleId]/operadores`
- `DELETE /api/estacionamientos/[id]/asignaciones/[asignacionId]`
- `GET|POST /api/estacionamientos/[id]/tarifas`

## Verificacion

- Pruebas dirigidas: `npm run test:lot-b` - 22/22 aprobadas.
- ESLint dirigido sobre helpers, repositorios, pagina y rutas del lote - correcto.
- Compilacion: `npm run build` - correcta.
- Casos cubiertos: Root global, company admin limitado por empresa, operator limitado por asignaciones, `404` cruzado y `403` de escritura para operator.

La navegacion puede ocultar modulos segun el rol, pero esto no reemplaza la proteccion aplicada en el servidor y en las APIs.

## Archivos

Nuevos:

- `src/lib/auth/currentServerContext.js`
- `src/lib/auth/parkingAuthorization.js`
- `src/lib/auth/parkingAuthorizationCore.mjs`
- `src/lib/auth/parkingAuthorizationCore.test.mjs`
- `docs/ETAPA-3-LOTE-B-ESTACIONAMIENTOS-ESTRUCTURA.md`

Modificados:

- `package.json`
- las 19 rutas enumeradas en la seccion de endpoints;
- `src/app/estacionamientos/page.js`
- `src/lib/estacionamientosRepository.js`
- `src/lib/estacionamientosServer.js`
- `src/lib/parkingApi.js`
- `src/lib/parkingConfiguratorRepository.js`
- `src/lib/parkingRatesRepository.js`
- `src/lib/parkingStructureRepository.js`

No se iniciaron los lotes C, D o E ni la Etapa 4.
