# Etapa 3 - Lote E: modulos restantes

## Resultado

Las APIs restantes usan el contexto central autenticado por Supabase Auth. Ya no existen importaciones de `authenticateRequest` en `src/app/api`; las rutas de negocio resuelven rol, portal y empresa mediante la arquitectura central.

### Notificaciones

- Root puede consultar globalmente.
- `company_admin` ve notificaciones relacionadas con parkings o abonados de su empresa, ademas de las dirigidas a su propio usuario.
- `operator` ve solo las relacionadas con sus estacionamientos asignados, abonados alcanzables o su propio usuario.
- El detalle se resuelve con el mismo alcance antes de consultar intentos; un ID cruzado responde `404`.

### Cupones

- Root conserva alcance global.
- `company_admin` administra comercios, cupones, lotes y entregas solo dentro de su empresa.
- `operator` tiene lectura del catalogo de su empresa y no puede crear, modificar, generar lotes ni enviar cupones (`403`).
- Los IDs de comercios y cupones se validan dentro de la empresa antes de usarlos.

### APIs auxiliares

- Planes y tarifario permiten lectura autenticada; sus escrituras siguen siendo exclusivas de Root.
- La comprobacion de base externa queda exclusiva de Root para no exponer informacion de infraestructura a tenants.
- La revision de estacionamientos reutiliza el endpoint de configuracion ya protegido.

Convenios no posee tabla, repositorio ni API persistente en el alcance existente; sus pantallas son exclusivamente informativas. No se agrego una funcionalidad nueva ni un esquema artificial.

## Endpoints intervenidos

- `GET /api/notificaciones`
- `GET /api/notificaciones/[id]`
- `GET|POST|PATCH /api/cupones`
- `GET|POST /api/cupones/comercios`
- `POST /api/cupones/lote`
- `POST /api/cupones/enviar`
- `GET|POST /api/planes`
- `GET|PATCH /api/tarifario-modulos`
- `GET /api/integrations/external-db/health`

## Verificacion

- `npm run test:lot-e`: 35 pruebas aprobadas.
- ESLint dirigido: correcto.
- `npm run build`: correcto.
- Barrido de APIs: ninguna ruta de negocio importa el autenticador legado.
- Sin migraciones ni cambios RLS en este lote.
