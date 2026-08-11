# Etapa 7A — Conciliación manual

## Modelo

`billing_external_movements` representa evidencia externa manual o importada. Admite `BANK_TRANSFER`, `WEBPAY_SETTLEMENT`, `MANUAL` y `OTHER` sin conectar proveedores. La clave empresa + origen + referencia + fecha + monto + moneda evita reimportaciones.

`billing_reconciliations` es una relación many-to-many independiente de `billing_payment_applications`: una aplicación indica qué documento paga el dinero; una conciliación indica qué evidencia externa demuestra el ingreso. El saldo externo e interno se reconstruye sumando conciliaciones `ACTIVE`.

## Propuestas y operación

El motor determinístico filtra misma empresa, moneda y monto disponible. Confianza `HIGH` significa monto y referencia exactos; `MEDIUM`, monto exacto y fecha dentro de una ventana configurable (3 días por defecto); `LOW`, solo monto exacto. Nunca confirma automáticamente.

Las RPC bloquean movimiento externo y pago con `FOR UPDATE`, validan saldos y crean o reversan la conciliación y auditoría atómicamente. Los retries usan `(company_id,idempotency_key)`. El reverso conserva la relación en `REVERSED`, actor, fecha y motivo, restaurando ambos disponibles.

## API y UI

- `GET/POST /api/billing/reconciliation/external-movements`
- `POST /api/billing/reconciliation/external-movements/import` (preview y confirmación)
- `GET /api/billing/reconciliation/proposals`
- `POST /api/billing/reconciliation`
- `POST /api/billing/reconciliation/[id]/reverse`

La superficie `Facturación → Conciliación` reutiliza `ParkFacilDataGrid`, muestra externos, pagos internos, propuestas explícitas, conciliaciones, resumen, registro manual e importación CSV genérica.

## Seguridad y Etapa 7B

Se conservan `billing:read`/`billing:manage`, exclusivos de `platform_admin`. Las tablas tienen RLS sin políticas permisivas y `anon`/`authenticated` sin acceso. Etapa 7B deberá implementar adapters de ingesta para bancos/PSP/Transbank, credenciales externas, cursor de importación y cuarentena de payloads, sin alterar el modelo financiero confirmado aquí.
