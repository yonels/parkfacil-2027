import { NextResponse } from "next/server";
import { reconcileDueOnStreetPayments } from "@/lib/onStreetPaymentReconcileService";
import { authorizeCronRequest } from "@/lib/onStreetCronAuth.mjs";

// Endpoint interno permanente: nunca público, nunca acepta un transactionId
// desde el navegador. En cada corrida, primero expira realmente (persiste
// EXPIRED) cualquier sesión ACTIVE vencida en cualquier ubicación --
// defensa contra el escenario 2026-08-26 donde una sesión vieja podía
// quedar ACTIVE para siempre y bloquear on_street_one_active_phone_
// location_idx indefinidamente -- y luego selecciona automáticamente dos
// colas de candidatos: payment_transactions On-Street en COMMITTING más
// allá del umbral seguro (autorizadas pero con finalización local fallida),
// y en REDIRECTED más allá de su propio umbral (el callback de retorno de
// Webpay nunca llegó -- incidente 2026-08-26, transacción 05909e7a-...).
// Ambas colas delegan en recoverWebpayTransaction -- el mismo mecanismo
// idempotente ya usado por /api/internal/on-street-payments/[id]/recover,
// sin lógica de commit/finalización distinta por cola. Una REDIRECTED que
// Transbank sigue sin autorizar mucho después de enviarse a Webpay se
// cierra como ABORTED (markTransactionFailed, ya existente) -- nunca se
// asume pago exitoso ni se reintenta un cobro.
// Autenticación con CRON_SECRET (mismo patrón que
// /api/internal/on-street-sms/process): no se introduce un secreto nuevo ni
// se reutiliza PARKFACIL_INTERNAL_SERVICE_KEY, que protege una acción manual
// de un operador humano, no una tarea programada server-to-server.
async function handle(request) {
  const authorization = authorizeCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 503 ? "Reconciliador no configurado." : "No autorizado." }, { status: authorization.status });
  try {
    const { summary } = await reconcileDueOnStreetPayments();
    return NextResponse.json({ data: summary });
  } catch {
    return NextResponse.json({ error: "No fue posible reconciliar pagos." }, { status: 503 });
  }
}

// Vercel Cron invoca rutas mediante GET. POST se conserva para operación
// interna controlada (misma convención que el procesador de SMS); ambos
// métodos aplican exactamente la misma autenticación y ejecutan el mismo
// reconciliador.
export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
