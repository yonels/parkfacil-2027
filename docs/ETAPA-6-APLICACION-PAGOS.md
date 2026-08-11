# Etapa 6 — Aplicación de pagos

## Arquitectura

`billing_account_movements` conserva el pago original e inmutable. `billing_payment_applications` relaciona un movimiento crédito con una Factura o Nota de Débito, sin editar ninguno de ellos. `source_type` admite `PAYMENT` y deja preparado `CREDIT_NOTE` como fuente diferenciada.

Las RPC `billing_apply_credit` y `billing_reverse_credit_application` ejecutan validación, locks, aplicación/reverso y auditoría en una sola transacción PostgreSQL. Bloquean primero la fuente y luego el documento; así dos solicitudes no pueden consumir simultáneamente el mismo saldo. La unicidad `(company_id,idempotency_key)` protege reintentos.

## Reglas y saldos

- Fuente y documento deben pertenecer a la misma empresa y moneda efectiva.
- Solo documentos `ISSUED` de tipo `INVOICE` o `DEBIT_NOTE` reciben aplicaciones.
- Una aplicación activa no puede superar el crédito disponible ni el saldo documental.
- Saldo documento = total efectivo − aplicaciones activas.
- Disponible pago = Haber original − aplicaciones activas.
- Documento: `PENDING`, `PARTIAL`, `PAID` u `OVERDUE`; un parcial vencido conserva `PARTIAL` más `isOverdue=true`.
- Pago: `UNAPPLIED`, `PARTIALLY_APPLIED` o `APPLIED`.

El reverso no elimina: cambia exclusivamente `ACTIVE → REVERSED`, conserva el registro y exige actor, fecha y motivo. Al excluirse de las sumas activas, restaura simultáneamente ambos saldos.

## API, UI y seguridad

- `GET/POST /api/billing/accounts/payments/[paymentId]/applications`.
- `POST /api/billing/accounts/payments/[paymentId]/applications/[applicationId]/reverse`.

Las APIs usan los permisos existentes `billing:read` y `billing:manage`, actualmente exclusivos de `platform_admin` en Root. `company_id` se resuelve en servidor. La tabla tiene RLS habilitado, sin políticas permisivas ni acceso de `anon`/`authenticated`; solo `service_role` puede consultar y ejecutar las RPC después de la autorización de aplicación.

Cuenta Corriente abre el detalle de un PAYMENT con doble clic. Muestra monto, aplicado, disponible, documentos candidatos, aplicaciones históricas y reverso controlado.

## Preparación para Etapa 7

El pago ya conserva fecha, monto, moneda, medio y referencia. La conciliación futura deberá agregar un identificador externo bancario y estado de conciliación mediante una migración separada. No se implementan bancos, cartolas, matching automático, Webpay settlement, cobranza ni SII productivo en esta etapa.
