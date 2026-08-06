# Etapa 3 - Lote D: operacion

## Resultado

Turnos, cierres, incidencias y Data Entry usan el contexto central basado en Supabase Auth. Se elimino de estas rutas la autorizacion basada en metadata del token (`company_id`, `parking_id` o rol enviados/almacenados por el cliente).

- Root conserva acceso global desde Portal Root.
- `company_admin` queda limitado a estacionamientos de su empresa.
- `operator` opera solo en estacionamientos asignados mediante `company_member_parkings` y solo puede descubrir sus propios turnos.
- Un parking, turno, cierre o incidencia cruzado responde `404`.
- La identidad de quien reporta una incidencia o cierra un turno proviene del contexto autenticado, no del body.
- Las asignaciones, operadores, supervisores, sectores y calles se validan contra el estacionamiento padre antes de crear un turno.
- Data Entry resuelve el estacionamiento autorizado en servidor; un `parkingId` recibido solo se usa despues de validar el alcance.

Los dispositivos relacionados con turnos permanecen como referencia opcional (`device_id`) porque el esquema actual no contiene una tabla persistente de dispositivos que permita resolver una cadena de pertenencia. No se incorporo funcionalidad nueva ni se acepto ese identificador como autorizacion.

## Endpoints protegidos

- `GET|POST /api/estacionamientos/[id]/turnos`
- `GET|POST /api/estacionamientos/[id]/turnos/[turnoId]/cierre`
- `POST /api/estacionamientos/[id]/turnos/[turnoId]/incidencias`
- `GET|POST /api/turnos/[id]/cerrar`
- `GET /api/cierres-turno/[id]`
- `GET|POST /api/data-entry`

Caja queda representada por el cierre y pago persistente de estadias en Data Entry. Operadores y sus asignaciones reutilizan la proteccion implementada en Lote B.

## Verificacion

- `npm run test:lot-d`: 48 pruebas aprobadas.
- ESLint dirigido: correcto.
- `npm run build`: correcto. El primer intento fallo por conectividad con Google Fonts; el reintento con red finalizo correctamente.
- Sin migraciones ni cambios RLS en este lote.

## Compatibilidad critica

Se corrigio la consulta de validacion de empresas del Lote C para usar `companies.relationship_type`, nombre real y estable del esquema, en lugar del nombre inexistente `company_type`. No se modifico su arquitectura ni alcance.
