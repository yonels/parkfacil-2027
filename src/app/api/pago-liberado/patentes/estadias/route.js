import { NextResponse } from "next/server";
import { regularizationFromDb } from "@/lib/releasedPayment/regularizationCore.mjs";
import { authorizeReleasedPlatesRead, fail, storageMissing } from "@/lib/releasedPlates/releasedPlateServer";

// Pago liberado gestionado por el cliente — regularización (SOL-2026-11-04-001,
// decisión D2). Estadías liberadas de la empresa: abiertas y cerradas en los
// últimos 30 días, más las regularizaciones registradas. Administrador: su
// empresa; Root: supervisión de la empresa elegida (?companyId=), sin acciones.

export const dynamic = "force-dynamic";

const STAY_COLUMNS = "id,code,parking_id,license_plate,status,entry_at,exit_at,total_amount,payment_code,released_plate_authorization_id";

export async function GET(request) {
  const auth = await authorizeReleasedPlatesRead(request);
  if (auth.response) return auth.response;
  if (!auth.companyId) return NextResponse.json({ data: { openStays: [], closedStays: [], regularizations: [] } });
  try {
    const parkings = await auth.db.from("parkings").select("id").eq("company_id", auth.companyId);
    if (parkings.error) throw parkings.error;
    const ids = (parkings.data || []).map((row) => row.id);
    if (!ids.length) return NextResponse.json({ data: { openStays: [], closedStays: [], regularizations: [] } });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [open, closed, regularizations] = await Promise.all([
      auth.db.from("parking_stays").select(STAY_COLUMNS).in("parking_id", ids).eq("status", "OPEN").not("released_plate_authorization_id", "is", null).order("entry_at", { ascending: false }).limit(500),
      auth.db.from("parking_stays").select(STAY_COLUMNS).in("parking_id", ids).eq("status", "PAID").not("released_plate_authorization_id", "is", null).gte("exit_at", since).order("exit_at", { ascending: false }).limit(500),
      auth.db.from("released_plate_stay_regularizations").select("*").eq("company_id", auth.companyId).order("created_at", { ascending: false }).limit(500),
    ]);
    for (const result of [open, closed, regularizations]) if (result.error) throw result.error;
    // Una estadía abierta con beneficio anulado ya no tiene autorización: se
    // muestra en el historial de regularizaciones.
    return NextResponse.json({
      data: {
        openStays: open.data || [],
        closedStays: closed.data || [],
        regularizations: (regularizations.data || []).map(regularizationFromDb),
      },
    });
  } catch (error) {
    if (storageMissing(error)) return NextResponse.json({ data: { openStays: [], closedStays: [], regularizations: [], storageReady: false } });
    console.error("[released-plates:stays]", error?.code, error?.message);
    return fail("No fue posible cargar las estadías liberadas.", 500);
  }
}
