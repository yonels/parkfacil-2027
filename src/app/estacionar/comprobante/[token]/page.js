import Link from "next/link";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getPublicPaymentIntent } from "@/lib/onStreetPaymentService";
import { formatChileDateTime, isPublicToken } from "@/lib/onStreetPilot.mjs";
import LiveRemainingTime from "@/components/on-street/LiveRemainingTime";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comprobante | ParkFacil", robots: { index: false, follow: false } };
const money = (n, c = "CLP") => new Intl.NumberFormat("es-CL", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n || 0);

// Mensajería de "no completado" unificada: siempre dice explícitamente que
// no hubo cambios en el tiempo de estacionamiento, para que quede claro
// tanto en una extensión rechazada (había una sesión activa antes y sigue
// igual) como en un pago inicial rechazado (nunca existió sesión).
const NOT_COMPLETED_MESSAGE = "El pago no fue completado. No se realizaron cambios en su tiempo de estacionamiento.";

export default async function Page({ params, searchParams }) {
  const { token } = await params;
  const { estado } = await searchParams;

  // Caso sin token en absoluto (abort de Webpay sin buy_order resoluble):
  // no hay ninguna operación que consultar, así que no hay sesión a la que
  // volver -- solo se ofrece un enlace de vuelta al inicio.
  if (token === "error" || !isPublicToken(token)) {
    return (
      <Receipt title="Pago no completado" message={estado === "ABORTED" ? "El pago fue cancelado antes de autorizarse. No se realizaron cambios en su tiempo de estacionamiento." : NOT_COMPLETED_MESSAGE}>
        <Link href="/" className="mt-6 block text-center font-bold text-[#3150D8]">Volver al inicio</Link>
      </Receipt>
    );
  }

  const db = getSupabaseAdminClient();
  let intent;
  try {
    intent = await getPublicPaymentIntent(db, token);
  } catch {
    // Error de infraestructura (DB caída, etc.) -- nunca se debe informar
    // esto como "no se encontró la operación", porque eso implica una
    // conclusión (la operación no existe) que no se pudo verificar. Mismo
    // criterio ya aplicado en la página de aterrizaje de QR.
    return (
      <Receipt title="No fue posible verificar tu pago" message="Hubo un problema técnico al consultar el estado de tu pago. Vuelve a intentar en unos segundos.">
        <Link href={`/estacionar/comprobante/${token}`} className="mt-6 block rounded-2xl bg-[#3150D8] p-4 text-center font-black text-white">REINTENTAR</Link>
      </Receipt>
    );
  }
  if (!intent) return <Receipt title="Comprobante no disponible" message="No se encontró la operación solicitada." />;

  const paid = intent.status === "PAID";
  const processing = !paid && estado === "PROCESSING";
  const isExtension = intent.operation_type === "EXTENSION";
  const payment = paid ? await paymentReference(db, intent.id) : null;

  // A qué sesión "volver": si el pago se confirmó, resulting_session_id ya
  // apunta a la sesión correcta (nueva para INITIAL, la misma actualizada
  // para EXTENSION -- ver finalize_authorized_on_street_payment). Si no se
  // confirmó pero es una extensión, target_session_id ya existía desde que
  // se creó el intento y sigue siendo la sesión activa del usuario (no se
  // le tocó nada). Un INITIAL no confirmado nunca tuvo sesión.
  const sessionId = paid ? intent.resulting_session_id : isExtension ? intent.target_session_id : null;
  const session = sessionId ? await getSessionSummary(db, sessionId) : null;

  const title = paid ? "Pago confirmado" : processing ? "Pago en verificación" : "Pago no completado";
  const message = paid
    ? isExtension ? "Su estacionamiento ha sido extendido correctamente." : "Su estacionamiento ha sido activado correctamente."
    : processing ? "Estamos verificando el estado de su pago." : NOT_COMPLETED_MESSAGE;

  return (
    <Receipt title={title} message={message}>
      {paid ? (
        <>
          <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800">
            {isExtension ? `Tiempo agregado: ${intent.purchased_minutes} minutos` : `Tiempo contratado: ${intent.purchased_minutes} minutos`}
          </p>
          {session ? (
            <>
              <div className="mt-4 rounded-3xl bg-[#041E42] p-6 text-center text-white">
                <p className="text-sm text-slate-300">Tiempo restante</p>
                <p className="mt-1 text-5xl font-black tabular-nums"><LiveRemainingTime expiresAt={session.expiresAt} /></p>
              </div>
              <Link href={`/estacionar/sesion/${session.token}`} className="mt-5 block min-h-16 rounded-2xl bg-[#3150D8] p-5 text-center text-lg font-black text-white">
                VOLVER A MI ESTACIONAMIENTO
              </Link>
            </>
          ) : (
            <Link href={`/estacionar/comprobante/${token}`} className="mt-5 block rounded-2xl bg-[#3150D8] p-4 text-center font-black text-white">ACTUALIZAR</Link>
          )}
          <dl className="mt-6 grid gap-3 text-sm">
            <Row label="Número de operación" value={payment?.buy_order || intent.public_token} />
            <Row label="Ubicación" value={`${intent.location_snapshot.sectorName} · ${intent.location_snapshot.streetName} · ${intent.location_snapshot.segmentName}`} />
            <Row label="Patente" value={intent.license_plate_normalized || "No registrada"} />
            <Row label="Monto" value={money(intent.amount, intent.currency)} />
            <Row label="Fecha/hora" value={formatChileDateTime(intent.paid_at)} />
            <Row label="Medio de pago" value="Transbank Webpay Plus" />
            <Row label="Autorización" value={payment?.authorization_code || "Confirmada"} />
          </dl>
        </>
      ) : processing ? (
        <>
          <Link href={`/estacionar/comprobante/${token}`} className="mt-6 block rounded-2xl bg-[#3150D8] p-4 text-center font-black text-white">ACTUALIZAR ESTADO</Link>
          {session ? (
            <Link href={`/estacionar/sesion/${session.token}`} className="mt-3 block min-h-14 rounded-2xl border-2 border-[#3150D8] p-4 text-center font-black text-[#3150D8]">
              VOLVER A MI ESTACIONAMIENTO
            </Link>
          ) : null}
        </>
      ) : (
        session ? (
          <Link href={`/estacionar/sesion/${session.token}`} className="mt-6 block min-h-16 rounded-2xl bg-[#3150D8] p-5 text-center text-lg font-black text-white">
            VOLVER A MI ESTACIONAMIENTO
          </Link>
        ) : (
          <Link href="/" className="mt-6 block text-center font-bold text-[#3150D8]">Volver al inicio</Link>
        )
      )}
    </Receipt>
  );
}

async function getSessionSummary(db, id) {
  const r = await db.from("on_street_pilot_sessions").select("public_token,expires_at").eq("id", id).maybeSingle();
  if (r.error || !r.data) return null;
  return { token: r.data.public_token, expiresAt: r.data.expires_at };
}
async function paymentReference(db, intentId) {
  const r = await db.from("payment_transactions").select("buy_order,authorization_code,provider_status").eq("source_id", intentId).eq("status", "COMMITTED").maybeSingle();
  return r.data || null;
}
function Receipt({ title, message, children }) { return <main className="grid min-h-dvh place-items-center bg-[#EEF4FF] p-4 text-[#041E42]"><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><p className="font-black text-[#3150D8]">ParkFacil</p><h1 className="mt-2 text-3xl font-black">{title}</h1><p className="mt-3 text-slate-600">{message}</p>{children}</section></main>; }
function Row({ label, value }) { return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-all font-bold">{value}</dd></div>; }
