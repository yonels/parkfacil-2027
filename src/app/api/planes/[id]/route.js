import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { mapPlan, validarPlanInput } from "@/lib/commercialPlanInput.mjs";

// PATCH /api/planes/[id] (2026-10-28): editar, archivar o reactivar un plan
// comercial. Solo Root. Sin borrado: un plan se archiva (estado "archived")
// para no perder planes que luego queden asociados a contratos. El código no
// se edita. Control de concurrencia: expectedUpdatedAt debe coincidir con el
// updated_at vigente; si otra persona guardó antes, responde 409.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request, { params }) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isPlatformAdmin) return NextResponse.json({ error: "Solo ParkFacil Root puede modificar planes." }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(String(id || ""))) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  const input = await request.json().catch(() => null);
  const accion = String(input?.accion || "editar");
  const expected = String(input?.expectedUpdatedAt || "");
  if (!expected || Number.isNaN(Date.parse(expected))) return NextResponse.json({ error: "Falta la versión del plan. Recarga la página." }, { status: 400 });

  let cambios;
  if (accion === "archivar") cambios = { status: "archived" };
  else if (accion === "reactivar") cambios = { status: "active" };
  else if (accion === "editar") {
    const validacion = validarPlanInput(input);
    if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });
    cambios = validacion.row;
  } else return NextResponse.json({ error: "Acción no válida." }, { status: 400 });

  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("commercial_plans")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("updated_at", expected)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No fue posible guardar el plan.", code: error.code }, { status: 500 });
  if (!data) {
    const existe = await db.from("commercial_plans").select("id").eq("id", id).maybeSingle();
    return existe.data
      ? NextResponse.json({ error: "Otra persona modificó este plan mientras lo editabas. Recarga la página antes de guardar." }, { status: 409 })
      : NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  }
  // Si cambiaron valores o moneda, queda una versión nueva y la anterior se retira
  // (SOL-2026-10-28-002); los contratos conservan su versión hasta reasignarlos.
  if (accion === "editar") {
    const version = await db.rpc("commercial_plan_ensure_version", { p_plan: data.id, p_actor: actor.id });
    if (version.error) console.error("[planes] versión no actualizada", version.error.code, version.error.message);
  }
  return NextResponse.json({ data: mapPlan(data) });
}
