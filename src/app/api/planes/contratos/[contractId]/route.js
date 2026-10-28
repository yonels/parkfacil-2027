import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { esUuid, traducirErrorPlan, validarAccionPlan } from "@/lib/contractPlanCore.mjs";

// POST /api/planes/contratos/[contractId] (SOL-2026-10-28-002): asignar o
// cambiar el plan de un contrato (accion=asignar, con fecha de vigencia) o
// quitarlo (accion=quitar, con fecha de término). Solo Root. Las funciones
// SQL cierran el tramo anterior y guardan el historial en la misma transacción.
export async function POST(request, { params }) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isPlatformAdmin) return NextResponse.json({ error: "Solo ParkFacil Root puede asignar planes." }, { status: 403 });

  const { contractId } = await params;
  if (!esUuid(contractId)) return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
  const validacion = validarAccionPlan(await request.json().catch(() => null));
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });

  const db = getSupabaseAdminClient();
  const { data, error } = validacion.accion === "asignar"
    ? await db.rpc("contract_assign_plan", { p_contract: contractId, p_plan: validacion.planId, p_valid_from: validacion.fecha, p_actor: actor.id, p_reason: validacion.motivo })
    : await db.rpc("contract_unassign_plan", { p_contract: contractId, p_valid_to: validacion.fecha, p_actor: actor.id, p_reason: validacion.motivo });
  if (error) {
    const traducido = traducirErrorPlan(error);
    if (traducido.status === 500) console.error("[planes/contratos]", error.code, error.message);
    return NextResponse.json({ error: traducido.error, code: traducido.codigo }, { status: traducido.status });
  }
  return NextResponse.json({ data });
}
