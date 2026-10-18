import { NextResponse } from "next/server";
import { authorizeReleasedPayment, fail, listScopedParkings, loadModuleStates, storageMissing } from "@/lib/releasedPayment/releasedPaymentServer";

// Off Street — Pago liberado: estacionamientos con su estado del módulo.
// Root ve todos (supervisión y contratación); el administrador, los de su
// empresa. El operador POS no tiene acceso.

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authorizeReleasedPayment(request, "read");
  if (auth.response) return auth.response;
  try {
    const parkings = await listScopedParkings(auth.db, auth);
    const states = await loadModuleStates(auth.db, parkings.map((row) => row.id));
    return NextResponse.json({
      data: parkings.map((parking) => ({ parking, ...states.get(parking.id) })),
      permissions: { isRoot: auth.isRoot, isAdmin: auth.isAdmin },
    });
  } catch (error) {
    if (storageMissing(error)) return NextResponse.json({ data: [], storageReady: false, permissions: { isRoot: auth.isRoot, isAdmin: auth.isAdmin } });
    console.error("[released-payment:parkings]", error?.code, error?.message);
    return fail("No fue posible cargar Pago liberado.", 500);
  }
}
