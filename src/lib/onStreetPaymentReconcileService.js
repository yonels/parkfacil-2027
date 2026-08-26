import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { recoverWebpayTransaction } from "@/lib/onStreetPaymentService";
import { reconcileDueOnStreetPayments as reconcileDueOnStreetPaymentsCore } from "./onStreetPaymentReconcileCore.mjs";

// Envoltorio real para el resto de la aplicación: provee Supabase real y la
// misma recuperación idempotente ya usada por el endpoint interno manual
// (recoverWebpayTransaction) sobre la lógica pura de
// onStreetPaymentReconcileCore.mjs. No existe una segunda implementación de
// commit/finalización -- este envoltorio solo decide QUÉ transacciones
// reconciliar y CUÁNDO; recoverWebpayTransaction sigue siendo la única
// fuente de verdad de CÓMO se reconcilia una transacción.
export async function reconcileDueOnStreetPayments({ db = getSupabaseAdminClient(), now, thresholdMs, batchSize } = {}) {
  return reconcileDueOnStreetPaymentsCore({ db, recover: recoverWebpayTransaction, now, thresholdMs, batchSize });
}
