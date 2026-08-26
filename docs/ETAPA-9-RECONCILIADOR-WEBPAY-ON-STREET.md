# Etapa 9 — Reconciliador Webpay On-Street y dominio canónico

## Origen

Incidente real, 2026-08-26: una contratación QR On-Street (`ON_STREET_INITIAL`,
$600 CLP, Onepay vía Webpay) fue autorizada por Transbank, pero la finalización
local (`finalize_authorized_on_street_payment`) falló después de la
autorización y antes de persistir el resultado. La transacción quedó en
`COMMITTING` para siempre: sin `COMMITTED`, sin `FAILED`, sin sesión creada, sin
ningún mecanismo automático que lo detectara. Esta etapa resuelve la **clase**
de fallo (no ese caso puntual, que nunca queda hardcodeado en el código).

## Reconciliador — `/api/internal/on-street-payments/reconcile`

Cron interno permanente, nunca público, no acepta `transactionId` desde el
navegador. En cada ejecución:

1. Selecciona candidatos: `payment_transactions` con `provider='TRANSBANK_WEBPAY'`,
   `source_type in ('ON_STREET_INITIAL','ON_STREET_EXTENSION')`, `status='COMMITTING'`
   y `updated_at` anterior al umbral, más antiguos primero, en lotes acotados.
2. Para cada candidato, delega en `recoverWebpayTransaction` — **la misma**
   recuperación idempotente ya usada por el endpoint manual
   `/api/internal/on-street-payments/[id]/recover`. No existe una segunda
   lógica de commit/finalización: `getTransactionStatus` → si autoriza,
   `claimTransactionCommit` + `finalize_authorized_on_street_payment` (misma
   RPC del flujo normal, con `for update` y corte temprano si ya está
   `COMMITTED`).
3. Nunca llama `createTransaction()` — reconciliar una transacción existente
   jamás inicia un cobro nuevo (ver `onStreetPaymentReconcileCore.test.mjs`,
   bloque H).

### Umbral — `RECONCILE_STALE_THRESHOLD_MS = 120_000` (2 minutos)

Un ciclo `COMMITTING` normal (claim → `commitTransaction()` real → RPC de
finalización) dura milisegundos a un par de segundos, todo dentro de una sola
petición HTTP. `claim_on_street_webpay_commit` ya define **30 segundos** como
su propia ventana de "podría seguir procesándose" (`busy`). El umbral de 2
minutos es un múltiplo holgado (4×) de esa misma constante: nunca compite con
una operación legítima en curso, y resuelve un incidente real dentro de un
par de ciclos de cron.

### Lote — `RECONCILE_BATCH_SIZE = 10`

El volumen actual del piloto On-Street es bajo. 10 por ejecución cada 2
minutos (hasta 300/hora) excede ampliamente cualquier acumulación plausible,
y acota el peor caso de llamadas reales secuenciales a Transbank
(`getTransactionStatus`) por invocación dentro del timeout de la función.

### Frecuencia — cada 2 minutos (`vercel.json`)

Coincide con el umbral: no tiene sentido revisar con más frecuencia que la
ventana mínima que define un candidato. Se agregó como entrada **separada**
del cron de SMS (`/api/internal/on-street-sms/process`, cada minuto) — mismo
`vercel.json`, sin tocar ni desplazar esa entrada.

### Autorización

Reutiliza `authorizeCronRequest`/`CRON_SECRET`, el mismo patrón ya usado por
el procesador de SMS. No se introdujo ningún secreto nuevo. Deliberadamente
**no** usa `PARKFACIL_INTERNAL_SERVICE_KEY`: ese secreto protege una acción
manual iniciada por un operador humano contra un `transactionId` específico;
el reconciliador es una tarea programada server-to-server que decide sus
propios candidatos, un caso de uso distinto.

### Estados y resultados

| Resultado | Significado |
|---|---|
| `RECOVERED` | `recoverWebpayTransaction` confirmó autorización y finalizó (sesión creada/extendida). |
| `PENDING` | Transbank todavía no confirma autorización. No se marca `COMMITTED`, no se crea sesión, no se marca `PAID` — la fila permanece `COMMITTING` para el próximo ciclo. Semántica reutilizada de `recoverWebpayTransaction`, sin inventar estados nuevos. |
| `SKIPPED` | Ya estaba resuelta (`COMMITTED`) por otra vía antes de que este ciclo la tocara. |
| `FAILED` | Error de red hacia Transbank, o excepción de la RPC (incluye un `23505` genuino de la regla de sesión activa única, ver abajo). Nunca se asume éxito ni rechazo definitivo; la fila permanece `COMMITTING` para reintento futuro. |

El endpoint devuelve únicamente `{ processed, recovered, pending, failed }` —
nunca `sessionToken`, `token_ws` ni credenciales.

### Idempotencia y concurrencia

`recoverWebpayTransaction` se apoya en dos garantías ya existentes a nivel de
RPC, con `for update` (bloqueo de fila):

- `claim_on_street_webpay_commit`: dos invocaciones concurrentes sobre la
  misma fila nunca proceden ambas — la segunda ve el `updated_at` recién
  actualizado por la primera y se retira (`busy`).
- `finalize_authorized_on_street_payment`: corta temprano con
  `ALREADY_COMMITTED` si la fila ya está `COMMITTED` al momento de tomar el
  lock — dos ejecuciones nunca insertan dos sesiones ni acreditan dos veces.

Por esto, ejecutar el reconciliador repetidamente sobre la misma transacción
—o solaparlo con un callback de usuario real en curso— es seguro sin cambios
adicionales.

### `INITIAL` y `EXTENSION`

`finalize_authorized_on_street_payment` ya maneja ambos `operation_type` con
la misma función (inserta sesión nueva vs. extiende `expires_at` de una
existente); el reconciliador no distingue entre ellos — selecciona ambos
`source_type` y delega igual en `recoverWebpayTransaction`. Una extensión
puede sufrir exactamente el mismo problema financiero que una contratación
inicial.

### Análisis del `23505` (índice de sesión activa)

Confirmado por eliminación en el incidente real: el intent nunca llegó a
`status='PAID'` (descarta el `raise` manual de `PAYMENT_INTENT_ALREADY_PAID`),
así que el `unique_violation` real solo puede provenir de
`on_street_one_active_phone_location_idx` (una sesión `ACTIVE` por
`qr_location_id`+`phone_normalized`). Esta es una regla de negocio legítima
(evita dos permanencias simultáneas para el mismo teléfono en la misma
ubicación) — **no se relaja, no se bypasea**. El reconciliador simplemente
deja la transacción para el próximo ciclo; si la sesión bloqueante expira
naturalmente antes de un reintento posterior, la reconciliación se completa
sola sin ninguna intervención manual de datos.

## Dominio canónico On-Street — `onStreetPublicOrigin.mjs`

`resolveOnStreetPublicOrigin()` centraliza la resolución de dominio para
`returnUrl` de Webpay, el redirect final del retorno, y el enlace del SMS
T-15 — los tres puntos que antes usaban
`process.env.PARKFACIL_PUBLIC_BASE_URL || request.origin` (causa exacta de
que el incidente terminara en `parkfacil-2027.vercel.app` en vez de
`onstreet.parkfacilapp.cl`, el dominio desde el que el conductor inició el
flujo).

En producción, sin un `ON_STREET_PUBLIC_BASE_URL` explícito, siempre resuelve
al dominio canónico fijo `https://onstreet.parkfacilapp.cl` — sin importar
por cuál alias llegó la petición (`root.parkfacilapp.cl`,
`parkfacil-2027.vercel.app`, etc.), y sin depender de que un cron (sin ningún
usuario/alias real detrás) adivine el dominio correcto. Fuera de producción,
sin override, usa el origin real de la petición (`localhost:3000` sigue
funcionando sin cambios).

No afecta `root.parkfacilapp.cl` ni `cliente.parkfacilapp.cl`: ninguna de sus
rutas (login, RBAC, portal selection, `contextCore`) importa este helper.

## Índices

No se creó ningún índice nuevo. El volumen actual del piloto On-Street es
bajo (evidencia: una única transacción real hasta la fecha); un filtro sobre
`payment_transactions` por `status='COMMITTING'` (valor infrecuente) cada 2
minutos no justifica una migración adicional. Si el volumen crece, evaluar
un índice parcial sobre `(status, updated_at) where status='COMMITTING'`.
