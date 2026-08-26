import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { recoverWebpayTransaction } from "@/lib/onStreetPaymentService";
import { expireDueOnStreetPilotSessions } from "@/lib/onStreetPilotRepository";
import { reconcileDueOnStreetPayments as reconcileDueOnStreetPaymentsCore } from "./onStreetPaymentReconcileCore.mjs";

// Envoltorio real para el resto de la aplicación: provee Supabase real, la
// misma recuperación idempotente ya usada por el endpoint interno manual
// (recoverWebpayTransaction) y el barrido real de expiración de sesiones
// (expireDueOnStreetPilotSessions) sobre la lógica pura de
// onStreetPaymentReconcileCore.mjs. No existe una segunda implementación de
// commit/finalización ni de expiración -- este envoltorio solo decide QUÉ
// transacciones reconciliar y CUÁNDO; recoverWebpayTransaction sigue siendo
// la única fuente de verdad de CÓMO se reconcilia una transacción, y
// expire_on_street_pilot_sessions (RPC) la única fuente de verdad de CÓMO
// se expira una sesión.
export async function reconcileDueOnStreetPayments({ db = getSupabaseAdminClient(), now, thresholdMs, batchSize } = {}) {
  return reconcileDueOnStreetPaymentsCore({ db, recover: recoverWebpayTransaction, expireSessions: expireDueOnStreetPilotSessions, now, thresholdMs, batchSize });
}
