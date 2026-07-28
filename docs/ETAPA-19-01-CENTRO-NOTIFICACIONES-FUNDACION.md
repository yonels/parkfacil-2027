# Etapa 19.1 - Centro de Notificaciones Multicanal

## Objetivo

Construir la fundacion del Centro de Notificaciones de ParkFacil 2027 para consultar historial, estados, canales, proveedores e intentos asociados a comunicaciones generadas por la plataforma.

## Alcance

Esta subetapa implementa arquitectura base, modelo de datos, API de consulta, interfaz administrativa, proveedores registrados, pruebas y documentacion. No implementa envio manual desde interfaz, campanas masivas ni integracion real de WhatsApp Business Cloud API.

## Arquitectura

El modulo queda ubicado en `src/lib/notifications` y se separa en:

- `constants.js`: catalogos de canales, estados y tipos.
- `normalizers.js`: normalizacion de filtros, paginacion, etiquetas y payloads seguros.
- `notificationValidators.js`: validacion de tipo, canal y estado.
- `notificationRepository.js`: persistencia en Supabase.
- `notificationService.js`: servicio central en modo preparacion/historial.
- `providers/emailProvider.js`: adaptador de estado para Microsoft Graph existente.
- `providers/whatsappProvider.js`: proveedor WhatsApp deshabilitado.
- `providers/internalProvider.js`: base para notificaciones internas.
- `templates/registry.js`: registro inicial de plantillas.
- `index.js`: interfaz publica del modulo.

## Canales

- `email`: Correo electronico mediante Microsoft Graph / Office 365.
- `whatsapp`: WhatsApp Business Platform, preparado pero deshabilitado.
- `internal`: Notificacion interna almacenada en plataforma.

## Estados

- `draft`: Borrador.
- `pending`: Pendiente.
- `processing`: Procesando.
- `sent`: Enviada.
- `delivered`: Entregada.
- `failed`: Fallida.
- `cancelled`: Cancelada.

Microsoft Graph confirma aceptacion del envio, no entrega final; por eso el estado inicial posterior a aceptacion debe ser `sent`, no `delivered`.

## Tipos Iniciales

El catalogo contempla credenciales, abonados, pagos, cierres de caja, contratos, cotizaciones, alertas operacionales y alertas del sistema. La etapa no implementa todos los flujos emisores; solamente permite representarlos en historial.

## Modelo de Datos

La migracion `supabase/migrations/20260728100000_notifications_foundation.sql` propone:

- `notifications`: tabla principal de historial.
- `notification_attempts`: intentos asociados con `ON DELETE CASCADE`.

Los campos de organizacion, estacionamiento, abonado y usuario quedan nullable para no inventar relaciones incompatibles con el modelo actual.

## Indices

Se agregan indices por estado, canal, tipo, fecha de creacion, abonado, estacionamiento y combinaciones canal/estado/fecha y tipo/estado/fecha. Tambien se incluye indice de busqueda simple por destinatario, nombre y asunto.

## Seguridad

- RLS habilitado en ambas tablas.
- Politicas para rol `authenticated` coherentes con el modelo actual.
- Permisos SQL para `service_role`.
- No se almacenan tokens, secretos ni cabeceras OAuth.
- Los payloads se sanitizan para evitar claves sensibles conocidas.
- `.env.local` permanece fuera de versionamiento.

## Proveedores

### Microsoft Graph

El proveedor de correo reutiliza la configuracion y validacion existente de Microsoft Graph. No duplica OAuth ni obtencion de token y no envia correos reales en esta subetapa.

### WhatsApp

WhatsApp queda registrado como `whatsapp_cloud_api`, con `configured: false` y `enabled: false`. No existen todavia Phone Number ID, token de Cloud API ni plantillas aprobadas en ParkFacil 2027. Cualquier intento de uso devuelve error controlado.

### Interno

El canal interno puede almacenarse como historial y quedar preparado para futuras campanas, campana visual y lectura por usuario.

## Endpoints

- `GET /api/notificaciones`: listado con filtros, resumen y paginacion.
- `GET /api/notificaciones/[id]`: detalle con intentos asociados.

No se implementa `POST` publico en esta subetapa.

## Rutas Web

- `/notificaciones`: Centro de Notificaciones con resumen, filtros, tabla, paginacion y estados vacios.
- `/notificaciones/[id]`: detalle con breadcrumb, fechas, proveedor, relaciones e historial de intentos.

## Limitaciones Actuales

- La migracion no fue aplicada al remoto en esta etapa.
- La interfaz funciona con estado vacio si la tabla aun no existe.
- No hay envio manual, reenvio ni campanas.
- WhatsApp real queda pendiente.
- El envio actual de credenciales no se reescribe todavia.

## Relacion Futura con Credenciales

En la Etapa 19.2, el flujo actual `abonadosCredentialEmailCore.js` podra registrar cada envio en `notifications` y cada intento en `notification_attempts`, manteniendo la trazabilidad especializada existente durante una transicion controlada. La integracion debera mapear `abonado_credencial_envios` hacia el historial central sin duplicar secretos ni payloads sensibles.

## Validacion

Comandos de validacion previstos:

- `npm run lint`
- `npm run build`
- `node --test`
- `git diff --check`
- `git status --short`

## Pendientes Etapa 19.2

- Aplicar migracion con autorizacion y proyecto Supabase confirmado.
- Integrar envio de credenciales con `notifications`.
- Definir POST interno protegido para preparar notificaciones.
- Configurar Meta Cloud API cuando existan credenciales reales.
- Agregar lectura y campana de notificaciones internas.
- Revisar visualmente listado y detalle con datos reales.
