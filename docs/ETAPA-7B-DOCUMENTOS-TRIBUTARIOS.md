# Etapa 7B — Documentos comerciales y correcciones

ParkFacil mantiene un modelo neutral y no implementa DTE, XML, CAF, firma ni comunicación directa con SII. En esta etapa `MockBillingProviderAdapter` representa al futuro proveedor externo.

## Modelo

- `billing_documents` conserva `INVOICE`, `CREDIT_NOTE` y `DEBIT_NOTE`. Una nota referencia estructuralmente su factura mediante `document_reference_id`.
- `billing_document_lines` congela descripción, cantidad, precio, subtotal, moneda, clasificación tributaria y referencia de origen. `customer_snapshot` congela los datos del receptor.
- Una factura emitida es inmutable y nunca se elimina. Su estado derivado es `ACTIVE`, `PARTIALLY_CREDITED` o `FULLY_CREDITED`.
- Estado documental (`ISSUING`, `ISSUED`, `PROVIDER_PENDING`, `PROVIDER_REJECTED`, `ISSUE_ERROR`) y financiero (`PENDING`, `PARTIAL`, `PAID`, `OVERDUE`) son dominios separados.

## Correcciones y Cuenta Corriente

La NC total o parcial genera un documento `CREDIT_NOTE` y un Haber. La ND genera `DEBIT_NOTE` y un Debe. El trigger existente contabiliza una sola vez cada documento emitido. Una NC no revierte aplicaciones de pago: si pago más NC exceden la deuda, el haber permanece como crédito o saldo a favor reconstruible desde movimientos. `PAYMENT` sigue siendo dinero, `CREDIT_NOTE` una corrección documental y `RECONCILIATION` evidencia externa.

## Integridad y seguridad

`billing_begin_related_document` bloquea la factura con `FOR UPDATE`, calcula el monto corregible incluyendo reservas concurrentes y rechaza sobrecorrección. La clave de idempotencia es única. `billing_finalize_related_document` persiste el resultado Mock y dispara Cuenta Corriente. Documentos y líneas emitidos no admiten DELETE ni edición comercial.

Las tablas tienen RLS habilitado, sin políticas permisivas, y `anon`/`authenticated` carecen de acceso directo. Las APIs derivan empresa y actor de la sesión server-side y exigen `billing:read` o `billing:issue`; `company_admin` no recibe capacidad nueva.

## Proveedor futuro

El adapter real recibirá el request neutral con tipo, fecha, moneda, emisor, receptor snapshot, líneas, totales, referencia y motivo; retornará identificador, folio y estado. No se fija ningún payload tributario específico.
