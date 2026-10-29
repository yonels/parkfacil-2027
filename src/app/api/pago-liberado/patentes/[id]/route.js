import { NextResponse } from "next/server";
import { releasedPlateFromDb, validateReleasedPlateInput } from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { authorizeReleasedPlates, fail, loadAuthorizationEvents, loadCompanyAuthorization, rpcFailure } from "@/lib/releasedPlates/releasedPlateServer";

// Pago liberado gestionado por el cliente (SOL-2026-10-28-003).
// GET: detalle con historial. PATCH: editar, finalizar ahora, eliminar
// (lógico) o restaurar, con control de concurrencia (expectedUpdatedAt).

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = { finalizar: "FINISH", eliminar: "DELETE", restaurar: "RESTORE" };

export async function GET(request, { params }) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID.test(String(id || ""))) return fail("No se encontró la patente liberada.", 404);
  try {
    const authorization = await loadCompanyAuthorization(auth.db, auth.actor.companyId, id);
    if (!authorization) return fail("No se encontró la patente liberada.", 404);
    const events = await loadAuthorizationEvents(auth.db, auth.actor.companyId, id);
    return NextResponse.json({ data: { authorization, events } });
  } catch (error) {
    console.error("[released-plates:GET:id]", error?.code, error?.message);
    return fail("No fue posible cargar la patente liberada.", 500);
  }
}

export async function PATCH(request, { params }) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID.test(String(id || ""))) return fail("No se encontró la patente liberada.", 404);
  const body = await request.json().catch(() => ({}));
  const expected = String(body.expectedUpdatedAt || "");
  if (!expected || Number.isNaN(Date.parse(expected))) return fail("Falta la versión del registro. Recarga la página.", 400);
  const accion = String(body.accion || "editar");

  if (accion === "editar") {
    const current = await loadCompanyAuthorization(auth.db, auth.actor.companyId, id).catch(() => null);
    if (!current) return fail("No se encontró la patente liberada.", 404);
    const validation = validateReleasedPlateInput(body, { current });
    if (!validation.ok) return fail("Revisa la patente liberada.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
    const { data, error } = await auth.db.rpc("released_plate_save", {
      p_actor_id: auth.actor.id, p_company_id: auth.actor.companyId, p_authorization_id: id,
      p_expected_updated_at: expected, p_input: validation.row, p_imported: false,
    });
    if (error) return rpcFailure(error, "No fue posible guardar la patente liberada.");
    return NextResponse.json({ data: releasedPlateFromDb(data) });
  }

  if (!ACTIONS[accion]) return fail("Acción no válida.", 400);
  const { data, error } = await auth.db.rpc("released_plate_set_status", {
    p_actor_id: auth.actor.id, p_company_id: auth.actor.companyId, p_authorization_id: id,
    p_expected_updated_at: expected, p_action: ACTIONS[accion],
  });
  if (error) return rpcFailure(error, "No fue posible actualizar la patente liberada.");
  return NextResponse.json({ data: releasedPlateFromDb(data) });
}
