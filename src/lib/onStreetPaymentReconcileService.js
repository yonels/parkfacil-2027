import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { recoverWebpayTransaction } from "@/lib/onStreetPaymentService";
import { markTransactionFailed } from "@/lib/payments/paymentTransactionRepository";
import { expireDueOnStreetPilotSessions } from "@/lib/onStreetPilotRepository";
import { reconcileDueOnStreetPayments as reconcileDueOnStreetPaymentsCore } from "./onStreetPaymentReconcileCore.mjs";

// Cierra definitivamente una transacción REDIRECTED abandonada (Transbank
// sigue sin confirmar autorización mucho después de haber enviado al
// usuario a Webpay). Reutiliza exactamente el mismo helper que ya usa el
// rechazo/aborto normal (abortPaymentTransactionByBuyOrder), con el mismo
// status ya existente en el modelo ('ABORTED') -- no se inventa un estado
// nuevo ni una segunda ruta de cierre. markTransactionFailed también deja
// el intent en PAYMENT_FAILED, sin tocar sesión ni expires_at.
async function markOnStreetPaymentAbandoned(db, transactionId, { providerStatus } = {}) {
  return markTransactionFailed(db, transactionId, { status: "ABORTED", providerStatus: providerStatus || "ABANDONED_BY_PARKFACIL" });
}

// Envoltorio real para el resto de la aplicación: provee Supabase real, la
// misma recuperación idempotente ya usada por el endpoint interno manual
// (recoverWebpayTransaction), el mismo cierre de aborto ya existente
// (markTransactionFailed) y el barrido real de expiración de sesiones
// (expireDueOnStreetPilotSessions) sobre la lógica pura de
// onStreetPaymentReconcileCore.mjs. No existe una segunda implementación de
// commit/finalización, de aborto ni de expiración -- este envoltorio solo
// decide QUÉ transacciones reconciliar y CUÁNDO; recoverWebpayTransaction
// sigue siendo la única fuente de verdad de CÓMO se reconcilia una
// transacción (para COMMITTING y para REDIRECTED por igual, sin lógica
// especial por cola), markTransactionFailed la única fuente de verdad de
// CÓMO se cierra una abandonada, y expire_on_street_pilot_sessions (RPC) la
// única fuente de verdad de CÓMO se expira una sesión.
export async function reconcileDueOnStreetPayments({ db = getSupabaseAdminClient(), now, thresholdMs, redirectedRecheckThresholdMs, redirectedAbandonThresholdMs, batchSize } = {}) {
  return reconcileDueOnStreetPaymentsCore({
    db,
    recover: recoverWebpayTransaction,
    markAbandoned: markOnStreetPaymentAbandoned,
    expireSessions: expireDueOnStreetPilotSessions,
    now, thresholdMs, redirectedRecheckThresholdMs, redirectedAbandonThresholdMs, batchSize,
  });
}
