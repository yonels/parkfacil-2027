# Etapa 8B — Robustez documental

## Objetivo

La emisión deja de depender de una llamada HTTP completa. La reserva de la factura y la creación de su trabajo de emisión ocurren atómicamente en PostgreSQL. El proveedor activo continúa siendo `MockBillingProviderAdapter`.

## Outbox persistente

`billing_document_jobs` registra un job `ISSUE` por documento. Sus estados son `PENDING`, `PROCESSING`, `COMPLETED`, `RETRY` y `FAILED`. La unicidad por documento/operación e idempotency key impide duplicados.

`billing_enqueue_invoice` bloquea la prefactura, crea documento, snapshot de líneas y job en una sola transacción. `billing_claim_document_job` reclama el job con `FOR UPDATE`, incrementa intentos y entrega un `lock_token`. Sólo ese token puede finalizar el intento.

## Reintentos y recuperación

Los fallos reintentables usan backoff exponencial y un máximo de tres intentos. Los rechazos definitivos y los intentos agotados terminan en `FAILED`. La UI Facturación → Facturas muestra jobs pendientes/error y permite “Reintentar emisión”. Un documento `ISSUED` nunca puede reencolarse.

## Provider y preparación EasyDoc

El processor construye un request neutral con tipo, fecha, emisor, receptor snapshot, líneas, totales, referencia, motivo e idempotency key. El resultado admite identificador, folio, estado y referencias PDF/XML. El Mock genera identificadores determinísticos y no conserva estado en memoria; la fuente de verdad es PostgreSQL.

## APIs

- `POST /api/billing/preinvoices/[id]/issue`: encola y realiza un primer intento.
- `GET /api/billing/document-jobs`: consulta estado operacional.
- `POST /api/billing/documents/[id]/retry`: reencola y procesa un documento recuperable.

Todas requieren permisos billing existentes y derivan actor/empresa desde el contexto server-side.

## Migración y pruebas

La migración `20260812100000_billing_document_jobs.sql` crea tabla, índices, RLS y RPC. Las pruebas verifican idempotencia, locks, límite de intentos, rechazo de reemisión, aislamiento, auditoría y sanitización.
