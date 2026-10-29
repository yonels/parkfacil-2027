# Centro de Control SMS — referencia técnica

Solicitud SOL-2026-10-29-007 (registro, manual de administración, prueba real controlada e informe de auditoría en el repositorio de registro `docs/solicitudes/SOL-2026-10-29-007/`).

## Piezas

| Capa | Archivos |
|---|---|
| Proveedor (existente, sin cambios) | `src/lib/sms/sentralandCore.mjs`, `sentralandClient.mjs`, `src/lib/onStreetSmsProvider*.{js,mjs}` |
| Núcleo del centro (puro, testeable) | `src/lib/sms/smsCenterCore.mjs` (estados, teléfonos CL, clasificación Sentraland, reintentos, saneamiento), `smsHistoryCore.mjs` (filtros, vista, CSV), `smsAdminCore.mjs` (configuración, tarifas, reenvío, exportación, estado del proveedor), `smsCenterServiceCore.mjs` (envío central, cola, DLR, reenvío, cancelación), `smsDiagnosticsCore.mjs` (diagnóstico y prueba) |
| Servidor (`server-only`) | `smsCenterService.js` (API para otros módulos: `sendSms`, `queueSms`, `processDueCentralSms`, `checkCentralSmsDeliveries`, `resendSms`, `cancelSms`), `smsCenterRepository.js`, `smsAdminRepository.js`, `smsApiAuth.js` |
| API (Root + `sms:*`) | `src/app/api/centro-sms/**` |
| Procesador interno | `src/app/api/internal/sms-center/process` (CRON_SECRET; **no programado**) |
| UI | `src/app/centro-sms/**`, `src/components/centro-sms/**`; menú en `src/config/navigation.js` + `Sidebar.js` |
| Base de datos | `supabase/migrations/20261029212053_sms_control_center.sql`; reversión `supabase/rollback/20261029212053_sms_control_center.down.sql`; prueba `supabase/tests/sms_control_center.test.sql` |

## Modelo de datos

- `sms_messages`: registro central (un mensaje lógico por fila; `idempotency_key` único; `root_message_id`/`parent_message_id` para reenvíos).
- `sms_message_events`: historial inmutable de estados (deduplicado por `message_id + dedupe_key`).
- `sms_settings` (fila única), `sms_tariffs` (solo `INTERNAL`), `sms_provider_checks`, `sms_admin_audit`, `sms_inbound_messages` (preparada).
- `sms_history_v`: une el registro central con `on_street_pilot_notifications` y `on_street_inspections` (SMS al conductor y copia al inspector) **sin modificarlas**. Clave única `(source, source_id)`.
- Funciones atómicas (solo `service_role`): `sms_enqueue_message`, `sms_transition`, `sms_claim_due` (SKIP LOCKED), `sms_apply_retention`, `sms_dashboard_summary`, `sms_failure_summary`, `sms_consumption`, `sms_history_filtered`, `sms_user_labels`.

## Garantías

- Nunca dos SMS por la misma `idempotency_key` (verificado en SQL y en pruebas).
- Timeout durante el envío ⇒ `UNKNOWN`, sin reintento automático.
- Reintento automático solo cuando el SMS seguro no salió (fase TOKEN o contingencia Sentraland), con máximo y esperas progresivas.
- «Aceptado» (`accepted_at`) y «Entregado» (`DELIVERED`, solo vía `smsstatus`) se cuentan por separado; simulados excluidos por defecto.
- Credenciales solo en el servidor; respuestas técnicas saneadas (`sanitizeProviderDetail`); teléfono enmascarado en listados y exportaciones.

## Pruebas

```bash
node --test --experimental-test-isolation=none src/lib/sms/*.test.mjs
```

Prueba SQL (solo base local, dentro de una transacción revertida):

```bash
(echo "begin;"; cat supabase/tests/sms_control_center.test.sql; echo "rollback;") | docker exec -i supabase_db_parkfacil-2027 psql -U postgres -v ON_ERROR_STOP=1
```
