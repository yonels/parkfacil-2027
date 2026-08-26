// Núcleo puro del reconciliador de pagos Webpay On-Street: sin "server-only"
// ni imports "@/..." para poder testearlo en directo con node --test,
// inyectando un `db`/`recover` en memoria. onStreetPaymentReconcileService.js
// es el envoltorio real que provee los valores por defecto (Supabase real,
// recoverWebpayTransaction real) para el resto de la aplicación — mismo
// patrón que onStreetSmsCore.mjs / onStreetSmsService.js.
//
// Resuelve la clase de fallo detectada el 2026-08-26 (transacción real
// autorizada por Transbank/Onepay que quedó en COMMITTING sin llegar a
// COMMITTED ni FAILED, porque la finalización local falló después de la
// autorización): busca periódicamente transacciones On-Street que llevan
// "demasiado tiempo" en COMMITTING y reintenta la MISMA recuperación
// idempotente ya usada para la recuperación manual (recoverWebpayTransaction)
// — no existe una segunda lógica de commit/finalización paralela.
//
// IMPORTANTE: este módulo nunca debe importar ni llamar a
// createTransaction() / startWebpayPayment() — reconciliar una transacción
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

// Volumen actual del piloto On-Street es bajo; 10 por ejecución cada 2
// minutos (hasta 300/hora) excede ampliamente cualquier acumulación
// plausible de transacciones atascadas, y acota el peor caso de llamadas
// reales secuenciales a Transbank (getTransactionStatus) por invocación,
// dentro del timeout de la función serverless.
export const RECONCILE_BATCH_SIZE = 10;

export const RECONCILABLE_SOURCE_TYPES = Object.freeze(["ON_STREET_INITIAL", "ON_STREET_EXTENSION"]);

function safeLog(entry) {
  // Nunca token_ws, token_ws_encrypted, claves ni datos de tarjeta — solo
  // identificadores, el resultado y cuánto tardó.
  console.log("[ON_STREET_PAYMENT_RECONCILE]", entry);
}

async function selectStaleCommittingTransactions(db, { now, thresholdMs, batchSize }) {
  const thresholdIso = new Date(new Date(now).getTime() - thresholdMs).toISOString();
  const { data, error } = await db
    .from("payment_transactions")
    .select("id,source_id,source_type,status,updated_at")
    .eq("provider", "TRANSBANK_WEBPAY")
    .in("source_type", RECONCILABLE_SOURCE_TYPES)
    .eq("status", "COMMITTING")
    .lte("updated_at", thresholdIso)
    .order("updated_at", { ascending: true })
    .limit(batchSize);
  if (error) throw error;
  return data || [];
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
  expireSessions,
  now = new Date().toISOString(),
  thresholdMs = RECONCILE_STALE_THRESHOLD_MS,
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

  const candidates = await selectStaleCommittingTransactions(db, { now, thresholdMs, batchSize });
  const summary = { processed: 0, recovered: 0, pending: 0, skipped: 0, failed: 0, sessionsExpired };
  const results = [];

  for (const row of candidates) {
    const startedAt = Date.now();
    let outcome, providerStatus = null;
    try {
      const recovered = await recover(db, { transactionId: row.id });
      outcome = classifyRecoverOutcome(recovered);
      providerStatus = recovered?.providerStatus ?? null;
    } catch (cause) {
      // Error de red hacia Transbank, RPC (incluye un genuino 23505 de la
      // regla de negocio de sesión activa única), o cualquier otro fallo:
      // nunca se asume éxito. La fila permanece en COMMITTING para el
      // siguiente ciclo -- no se marca FAILED aquí, porque eso significaría
      // afirmar una conclusión que no tenemos evidencia de sostener.
      outcome = "FAILED";
      providerStatus = null;
      safeLog({ transactionId: row.id, sourceType: row.source_type, statusBefore: row.status, outcome, error: cause?.code || cause?.message || "RECONCILE_ERROR", durationMs: Date.now() - startedAt });
      summary.processed += 1;
      summary.failed += 1;
      results.push({ transactionId: row.id, outcome });
      continue;
    }
    safeLog({ transactionId: row.id, sourceType: row.source_type, statusBefore: row.status, providerStatus, outcome, durationMs: Date.now() - startedAt });
    summary.processed += 1;
    if (outcome === "RECOVERED") summary.recovered += 1;
    else if (outcome === "PENDING") summary.pending += 1;
    else summary.skipped += 1;
    results.push({ transactionId: row.id, outcome });
  }

  return { summary, results };
}
