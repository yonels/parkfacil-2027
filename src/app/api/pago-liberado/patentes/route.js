import { NextResponse } from "next/server";
import { validateReleasedPlateInput, releasedPlateFromDb } from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { authorizeReleasedPlates, fail, listCompanyAuthorizations, listCompanyParkings, rpcFailure, storageMissing } from "@/lib/releasedPlates/releasedPlateServer";

// Pago liberado gestionado por el cliente (SOL-2026-10-28-003).
// GET: estacionamientos de la empresa con su activación y patentes liberadas.
// POST: nueva patente liberada. Solo el administrador de la empresa.

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  try {
    const [parkings, authorizations] = await Promise.all([
      listCompanyParkings(auth.db, auth.actor.companyId),
      listCompanyAuthorizations(auth.db, auth.actor.companyId),
    ]);
    return NextResponse.json({ data: { parkings, authorizations, storageReady: true } });
  } catch (error) {
    if (storageMissing(error)) return NextResponse.json({ data: { parkings: [], authorizations: [], storageReady: false } });
    console.error("[released-plates:GET]", error?.code, error?.message);
    return fail("No fue posible cargar Pago liberado.", 500);
  }
}

export async function POST(request) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const validation = validateReleasedPlateInput(body);
  if (!validation.ok) return fail("Revisa la patente liberada.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
  const { data, error } = await auth.db.rpc("released_plate_save", {
    p_actor_id: auth.actor.id, p_company_id: auth.actor.companyId, p_authorization_id: null,
    p_expected_updated_at: null, p_input: validation.row, p_imported: false,
  });
  if (error) return rpcFailure(error, "No fue posible guardar la patente liberada.");
  return NextResponse.json({ data: releasedPlateFromDb(data) }, { status: 201 });
}
