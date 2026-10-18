import { NextResponse } from "next/server";
import { authorizationFromDb } from "@/lib/releasedPayment/authorizationCore.mjs";
import { contractFromDb } from "@/lib/releasedPayment/releasedStayCore.mjs";
import { authorizeReleasedPayment, fail, loadModuleStates, loadPayments, loadTariffs, requireScopedParking, storageMissing } from "@/lib/releasedPayment/releasedPaymentServer";

// Detalle de Pago liberado de un estacionamiento: estado, versiones de la
// contratación (importe mensual), cupos del cliente, tarifas a beneficiarios (vigentes e historial),
// autorizaciones, pagos recibidos de beneficiarios, estadías liberadas
// abiertas e historial.

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "read");
  if (auth.response) return auth.response;
  const { parkingId } = await params;
  try {
    const parking = await requireScopedParking(auth.db, auth, parkingId);
    if (!parking) return fail("No se encontró el estacionamiento.", 404);
    const [states, tariffs, payments, contracts, authorizations, moduleEvents, authorizationEvents, openStays] = await Promise.all([
      loadModuleStates(auth.db, [parking.id]),
      loadTariffs(auth.db, parking.id),
      loadPayments(auth.db, parking.id),
      auth.db.from("released_payment_contracts").select("*").eq("parking_id", parking.id).order("version", { ascending: false }),
      auth.db.from("released_payment_authorizations").select("*").eq("parking_id", parking.id).order("status").order("license_plate").order("created_at", { ascending: false }),
      auth.db.from("released_payment_module_events").select("id,event_type,contract_id,previous_values,new_values,reason,actor_email,actor_role,created_at").eq("parking_id", parking.id).order("created_at", { ascending: false }).limit(100),
      auth.db.from("released_payment_authorization_events").select("id,authorization_id,event_type,previous_values,new_values,reason,actor_email,actor_role,created_at").eq("parking_id", parking.id).order("created_at", { ascending: false }).limit(200),
      auth.db.from("parking_stays").select("id,code,license_plate,entry_at,released_payment_authorization_id").eq("parking_id", parking.id).eq("status", "OPEN").not("released_payment_authorization_id", "is", null).order("entry_at"),
    ]);
    for (const result of [contracts, authorizations, moduleEvents, authorizationEvents, openStays]) if (result.error) throw result.error;
    return NextResponse.json({
      data: {
        parking,
        ...states.get(parking.id),
        contracts: (contracts.data || []).map(contractFromDb),
        tariffs: tariffs.current,
        tariffHistory: tariffs.all,
        authorizations: (authorizations.data || []).map(authorizationFromDb),
        moduleEvents: moduleEvents.data || [],
        authorizationEvents: authorizationEvents.data || [],
        payments,
        openReleasedStays: openStays.data || [],
      },
      permissions: { isRoot: auth.isRoot, isAdmin: auth.isAdmin },
    });
  } catch (error) {
    if (storageMissing(error)) return fail("Pago liberado aún no está habilitado en la base (migración pendiente).", 503, { code: "RELEASED_PAYMENT_STORAGE_PENDING" });
    console.error("[released-payment:parking]", error?.code, error?.message);
    return fail("No fue posible cargar Pago liberado.", 500);
  }
}
