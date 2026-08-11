# Etapa 5 — Facturación y Cuenta Corriente

## Objetivo y arquitectura

La etapa completa localmente la emisión simulada y la Cuenta Corriente sobre la arquitectura existente. No integra un emisor tributario productivo. `BillingService` conserva el límite neutral de proveedor y usa exclusivamente `MockBillingProviderAdapter`.

El flujo es `READY_TO_ISSUE → ISSUING → ISSUED`. `POST /api/billing/preinvoices/[id]/issue` valida autorización, fecha e idempotencia; persiste `billing_documents` y el trigger de documento emitido crea el movimiento en `billing_account_movements`. La regla UF es invariable: `uf_reference_date = invoice_date`; si Banco Central no responde, la emisión UF falla explícitamente y no usa un valor aproximado.

## Cuenta Corriente

Factura y nota de débito generan Debe. Nota de crédito y pago generan Haber. El saldo no se edita ni persiste: se reconstruye como `saldo = debe - haber`. Para separar vencido y por vencer, los créditos se imputan primero contra débitos vencidos. Las monedas se calculan por separado y una factura UF ingresa en CLP con su conversión definitiva.

`GET /api/billing/accounts` lista movimientos y resúmenes. `POST /api/billing/accounts/payments` registra un pago manual con empresa, monto, fecha, moneda, medio, referencia, descripción, actor y clave de idempotencia. La UI reutiliza `ParkFacilDataGrid`, con búsqueda, ordenamiento y exportación, y agrega el formulario de pago y los resúmenes superiores.

## Tablas y migraciones

- `20260810120000_billing_preinvoice_foundation.sql`: prefacturas, líneas, conceptos, devices y auditoría.
- `20260810160000_billing_preinvoice_review.sql`: revisión, ajustes y máquina de estados.
- `20260810190000_billing_documents.sql`: documentos y resultado del proveedor.
- `20260810200000_billing_account_movements.sql`: movimientos append-only y trigger de contabilización.
- `20260810210000_billing_payments_integrity.sql`: medio e idempotencia de pagos, y unicidad documental corregida.
- `20260810220000_billing_company_guard_record_safety.sql`: hace segura la guarda multi-tabla al operar con records de formas distintas.

Un documento solo puede generar una vez su movimiento Factura/NC/ND. Los pagos son idempotentes por empresa y clave. Los movimientos no aceptan actualización ni eliminación; las correcciones futuras deben usar reversos o documentos compensatorios.

## Seguridad y RLS

Las APIs autorizan en servidor y el navegador nunca recibe `service_role`. Los permisos financieros siguen limitados a `platform_admin`. Para contextos acotados, la API de pagos obtiene `company_id` de la sesión y rechaza una empresa diferente. Las tablas habilitan RLS sin políticas permisivas, revocan acceso de `anon` y `authenticated`, y solo conceden acceso técnico a `service_role` después de la autorización de aplicación.

## Estado real y limitaciones

El 10-08-2026 la conexión inicial estuvo bloqueada por `28P01`. El 11-08-2026 se validó el Session Pooler oficial mediante parámetros separados y se aplicaron las migraciones `20260802170000`, `20260810120000`, `20260810160000`, `20260810190000`, `20260810200000`, `20260810210000` y la corrección `20260810220000`.

La certificación persistente `ETAPA5-REMOTE-1786413744807` confirmó `READY_TO_ISSUE → ISSUING → ISSUED`, documento Mock aceptado, asiento Factura Debe CLP 1.190 y pago Haber CLP 400. El saldo reconstruido fue CLP 790, vencido CLP 0 y por vencer CLP 790. Repetir el pago produjo `23505` sobre `billing_payment_idempotency_uidx`. El rol `anon` recibió `42501 permission denied` al consultar los movimientos; `authenticated` tampoco posee privilegios directos y todas las tablas financieras tienen RLS habilitado.

Quedan para etapas futuras la aplicación de pagos a documentos, reversos operativos, conciliación bancaria, cobranza, intereses y el adaptador tributario/SII real.
