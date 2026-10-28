import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { PREFIJO_PLAN, siguienteCodigoPlan } from "@/lib/commercialPlanCode.mjs";
import { mapPlan as map, validarPlanInput } from "@/lib/commercialPlanInput.mjs";

export async function GET(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.COMPANY_READ);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const { data, error } = await getSupabaseAdminClient().from("commercial_plans").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No fue posible cargar los planes.", code: error.code }, { status: 500 });
  return NextResponse.json({ data: (data || []).map(map), permissions: { canCreate: actor.isPlatformAdmin } });
}

export async function POST(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isPlatformAdmin) return NextResponse.json({ error: "Solo ParkFacil Root puede crear planes." }, { status: 403 });
  const input = await request.json().catch(() => null);
  const validacion = validarPlanInput(input);
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });
  // El código lo asigna el sistema (PF-PLAN-NNN); un código enviado por el cliente se ignora.
  const row = { ...validacion.row, created_by: actor.id };
  const db = getSupabaseAdminClient();
  const existentes = await db.from("commercial_plans").select("code").ilike("code", `${PREFIJO_PLAN}%`);
  if (existentes.error) return NextResponse.json({ error: "No fue posible asignar el código del plan.", code: existentes.error.code }, { status: 500 });
  const codigos = (existentes.data || []).map((item) => item.code);
  let data = null;
  let error = null;
  for (let intento = 0; intento < 5; intento += 1) {
    ({ data, error } = await db.from("commercial_plans").insert({ ...row, code: siguienteCodigoPlan(codigos, intento) }).select("*").single());
    if (!error || error.code !== "23505") break;
  }
  if (error) return NextResponse.json({ error: error.code === "23505" ? "No fue posible asignar un código único. Intenta nuevamente." : "No fue posible crear el plan.", code: error.code }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ data: map(data) }, { status: 201 });
}
