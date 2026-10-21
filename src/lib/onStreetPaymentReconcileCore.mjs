// Núcleo puro del reconciliador de pagos Webpay On-Street: sin "server-only"
// ni imports "@/..." para poder testearlo en directo con node --test,
// inyectando un `db`/`recover` en memoria. onStreetPaymentReconcileService.js
// es el envoltorio real que provee los valores por defecto (Supabase real,
// recoverWebpayTransaction real) para el resto de la aplicación — mismo
// patrón que onStreetSmsCore.mjs / onStreetSmsService.js.
//
// Cubre DOS clases de fallo relacionadas, ambas resueltas reutilizando la
// MISMA recuperación idempotente ya usada por el endpoint manual
// (recoverWebpayTransaction) -- nunca una segunda lógica de commit:
//
// 1) COMMITTING atascado (incidente 2026-08-26, transacción 926c7144-...):
//    Transbank autorizó, pero la finalización local falló después de la
//    autorización, sin llegar a COMMITTED ni a FAILED.
//
// 2) REDIRECTED atascado (incidente 2026-08-26, transacción 05909e7a-...):
//    el usuario fue enviado a Webpay pero el callback de retorno nunca
//    llegó -- claimTransactionCommit nunca se ejecutó, así que la fila
//    nunca pasa a COMMITTING y por eso el reconciliador de COMMITTING
//    jamás la ve. No se puede asumir que estas transacciones estén
//    pagadas: se consultan contra Transbank usando su propio token
//    (recoverWebpayTransaction ya hace exactamente esto), NUNCA se generan
//    cobros nuevos.
//
// IMPORTANTE: este módulo nunca debe importar ni llamar a
// createTransaction() / startWebpayPayment() -- reconciliar una transacción
// existente jamás debe iniciar un cobro nuevo. Ver test dedicado.

// Un COMMITTING "normal" (dentro del ciclo real de un callback de Webpay)
// dura milisegundos a un par de segundos: claim -> commitTransaction() real
// -> RPC de finalización, todo en una sola invocación HTTP. El propio
// claim_on_street_webpay_commit ya define 30s como su propia ventana de
// "todavía podría estar procesándose" (busy). Usamos un múltiplo holgado
// (4x) de esa misma constante como umbral de "anormal" para el
// reconciliador: nunca compite con una operación legítimamente en curso,
// pero resuelve un incidente real dentro de un par de ciclos de cron.
export const RECONCILE_STALE_THRESHOLD_MS = 120_000; // 2 minutos

// createInitialPaymentIntent/createExtensionPaymentIntent ya establecen 10
// minutos como la ventana legítima de un intento de pago
// (on_street_payment_intents.expires_at = created_at + 10 min;
// startWebpayPayment la hace cumplir con PAYMENT_INTENT_EXPIRED). Reutilizamos
// esa misma constante de negocio ya existente como ancla, en vez de inventar
// un número nuevo:
//
// - Recién enviado a Webpay: un checkout real (ingresar tarjeta, 3DS/OTP,
//   confirmación del banco) puede tardar varios minutos legítimamente. No
//   tiene sentido, ni es necesario, consultar a Transbank antes de que haya
//   transcurrido al menos la mitad de esa ventana -- consultar es de solo
//   lectura y no interfiere con un checkout en curso, pero tampoco hay
//   ninguna razón para llamar a Transbank repetidamente durante los
//   primeros minutos, cuando lo más probable es que el usuario simplemente
//   siga completando el pago.
export const REDIRECTED_RECHECK_THRESHOLD_MS = 300_000; // 5 minutos (mitad de la ventana de 10 min del intent)

// - Abandono definitivo: confirmado contra documentación oficial vigente de
//   Transbank Developers (transbankdevelopers.cl/documentacion/webpay-plus,
//   revisado 2026-08-26): el token de creación vive 5 minutos, y si el
//   usuario llega al formulario de Webpay pero no lo completa, Transbank
//   aborta la transacción automáticamente a los 4 minutos en Production
//   (10 minutos en Integration) y **ya intenta devolver el control al
//   comercio por sí solo** (con TBK_ID_SESION/TBK_ORDEN_COMPRA, sin
//   token_ws -- el mismo camino que abortWebpayReturn ya maneja). Es decir:
//   en el caso normal, Transbank resuelve un abandono real en <=4 minutos y
//   nos avisa. 30 minutos es entonces un margen deliberadamente holgado
//   (>=7x ese máximo documentado): para cuando este umbral se cumple,
//   Transbank ya debería haber resuelto la transacción de un modo u otro:
//   si seguimos sin verlo, es evidencia suficiente de que algo más allá del
//   comportamiento normal de Webpay ocurrió (ej. el propio callback de
//   abandono de Transbank tampoco llegó, como en 05909e7a-...), y cerrar
//   como abandonada dejando de reintentar indefinidamente es razonable.
export const REDIRECTED_ABANDON_THRESHOLD_MS = 1_800_000; // 30 minutos

// Volumen actual del piloto On-Street es bajo; 10 por ejecución cada 2
// minutos (hasta 300/hora) excede ampliamente cualquier acumulación
// plausible de transacciones atascadas, y acota el peor caso de llamadas
// reales secuenciales a Transbank (getTransactionStatus) por invocación,
// dentro del timeout de la función serverless. Se aplica igual a cada cola
// (COMMITTING y REDIRECTED) por separado, no combinado.
export const RECONCILE_BATCH_SIZE = 10;

export const RECONCILABLE_SOURCE_TYPES = Object.freeze(["ON_STREET_INITIAL", "ON_STREET_EXTENSION"]);

function safeLog(entry) {
  // Nunca token_ws, token_ws_encrypted, claves ni datos de tarjeta — solo
  // identificadores, el resultado y cuánto tardó.
  console.log("[ON_STREET_PAYMENT_RECONCILE]", entry);
}

// Selección genérica: mismo filtro base (provider + source_type + status +
// columna de antigüedad <= umbral), solo cambia qué status/columna se usa.
// Evita duplicar la consulta entre la cola COMMITTING y la cola REDIRECTED.
async function selectStaleTransactions(db, { status, timestampColumn, now, thresholdMs, batchSize }) {
  const thresholdIso = new Date(new Date(now).getTime() - thresholdMs).toISOString();
  const { data, error } = await db
    .from("payment_transactions")
    .select(`id,source_id,source_type,status,${timestampColumn}`)
    .eq("provider", "TRANSBANK_WEBPAY")
    .in("source_type", RECONCILABLE_SOURCE_TYPES)
    .eq("status", status)
    .lte(timestampColumn, thresholdIso)
    .order(timestampColumn, { ascending: true })
    .limit(batchSize);
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, queue: status, staleAt: row[timestampColumn] }));
}

// Clasifica el resultado de recover() (misma forma que recoverWebpayTransaction)
// en el vocabulario del reconciliador. No inventa un estado de éxito: solo
// "COMMITTED" con datos de finalización propios de esta llamada cuenta como
// RECOVERED; un "COMMITTED" sin ellos significa que alguien más (otra
// ejecución, o el callback original recuperándose solo) ya la resolvió.
function classifyRecoverOutcome(result) {
  if (result?.status === "COMMITTED") return result.sessionId || result.sessionToken ? "RECOVERED" : "SKIPPED";
  if (result?.status === "PENDING") return "PENDING";
  return "SKIPPED";
}

export async function reconcileDueOnStreetPayments({
  db,
  recover,
  markAbandoned,
  expireSessions,
  now = new Date().toISOString(),
  thresholdMs = RECONCILE_STALE_THRESHOLD_MS,
  redirectedRecheckThresholdMs = REDIRECTED_RECHECK_THRESHOLD_MS,
  redirectedAbandonThresholdMs = REDIRECTED_ABANDON_THRESHOLD_MS,
  batchSize = RECONCILE_BATCH_SIZE,
} = {}) {
  // Defensa obligatoria: antes de intentar recuperar cualquier pago, se
  // garantiza que ninguna sesión ACTIVE vencida siga bloqueando
  // on_street_one_active_phone_location_idx. expireSessions() es un
  // barrido global (no depende de que este ciclo conozca de antemano qué
  // ubicación/teléfono es "relevante" para cada candidato) -- por eso se
  // ejecuta una sola vez por invocación, no una vez por candidato. No se
  // depende únicamente de esta corrida periódica para la corrección: la
  // operación en sí (un UPDATE con status='ACTIVE' AND expires_at<=now())
  // es válida y segura sin importar cuándo ni cuántas veces se ejecute.
  let sessionsExpired = 0;
  if (expireSessions) {
    try { sessionsExpired = Number(await expireSessions(db)) || 0; }
    catch (cause) { safeLog({ outcome: "EXPIRY_SWEEP_FAILED", error: cause?.code || cause?.message || "EXPIRE_ERROR" }); }
  }

  const [committing, redirected] = await Promise.all([
    selectStaleTransactions(db, { status: "COMMITTING", timestampColumn: "updated_at", now, thresholdMs, batchSize }),
    selectStaleTransactions(db, { status: "REDIRECTED", timestampColumn: "redirected_at", now, thresholdMs: redirectedRecheckThresholdMs, batchSize }),
  ]);
  const candidates = [...committing, ...redirected];

  const summary = { processed: 0, recovered: 0, pending: 0, skipped: 0, abandoned: 0, failed: 0, sessionsExpired };
  const results = [];

  for (const row of candidates) {
    const startedAt = Date.now();
    let outcome, providerStatus = null;
    try {
      const recovered = await recover(db, { transactionId: row.id });
      outcome = classifyRecoverOutcome(recovered);
      providerStatus = recovered?.providerStatus ?? null;

      // Caso B/abandono: Transbank todavía no confirma autorización (PENDING)
      // y, si viene de la cola REDIRECTED, ya pasó el margen de abandono
      // medido desde que se envió al usuario a Webpay (redirected_at) -- no
      // desde "ahora". No se crea sesión, no se agregan minutos, no se toca
      // expires_at: solo se cierra la transacción con el estado final ya
      // existente en el modelo (ABORTED, vía markTransactionFailed, el
      // mismo helper que ya usa el flujo de rechazo normal).
      if (outcome === "PENDING" && row.queue === "REDIRECTED" && markAbandoned) {
        const staleForMs = new Date(now).getTime() - new Date(row.staleAt).getTime();
        if (staleForMs >= redirectedAbandonThresholdMs) {
          await markAbandoned(db, row.id, { providerStatus });
          outcome = "ABANDONED";
        }
      }
    } catch (cause) {
      // Error de red hacia Transbank, RPC (incluye un genuino 23505 de la
      // regla de negocio de sesión activa única), o cualquier otro fallo:
      // nunca se asume éxito. La fila permanece como está para el
      // siguiente ciclo -- no se marca FAILED aquí, porque eso significaría
      // afirmar una conclusión que no tenemos evidencia de sostener.
      outcome = "FAILED";
      providerStatus = null;
      safeLog({ transactionId: row.id, sourceType: row.source_type, queue: row.queue, statusBefore: row.status, outcome, error: cause?.code || cause?.message || "RECONCILE_ERROR", durationMs: Date.now() - startedAt });
      summary.processed += 1;
      summary.failed += 1;
      results.push({ transactionId: row.id, queue: row.queue, outcome });
      continue;
    }
    safeLog({ transactionId: row.id, sourceType: row.source_type, queue: row.queue, statusBefore: row.status, providerStatus, outcome, durationMs: Date.now() - startedAt });
    summary.processed += 1;
    if (outcome === "RECOVERED") summary.recovered += 1;
    else if (outcome === "PENDING") summary.pending += 1;
    else if (outcome === "ABANDONED") summary.abandoned += 1;
    else summary.skipped += 1;
    results.push({ transactionId: row.id, queue: row.queue, outcome });
  }

  return { summary, results };
}
