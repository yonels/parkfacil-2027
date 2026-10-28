import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

// GET /api/planes/empresas/[companyId] (SOL-2026-10-28-002): contratos de la
// empresa con su plan vigente e historial de planes, y los planes activos que
// se pueden asignar. Solo Root.
export async function GET(request, { params }) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!actor.isPlatformAdmin) return NextResponse.json({ error: "Solo ParkFacil Root puede ver los planes por empresa." }, { status: 403 });

  const { companyId } = await params;
  const db = getSupabaseAdminClient();
  const empresa = await db.from("companies").select("id,business_name,trade_name,rut_number,rut_dv").eq("id", companyId).maybeSingle();
  if (empresa.error) return NextResponse.json({ error: "No fue posible cargar la empresa." }, { status: 500 });
  if (!empresa.data) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const contratos = await db.from("company_contracts")
    .select("id,contract_number,status,starts_on,ends_on,currency,commercial_plan_version_id")
    .eq("company_id", companyId).order("starts_on", { ascending: false });
  if (contratos.error) return NextResponse.json({ error: "No fue posible cargar los contratos." }, { status: 500 });
  const ids = (contratos.data || []).map((c) => c.id);

  const historial = ids.length
    ? await db.from("contract_plan_assignments")
      .select("id,contract_id,valid_from,valid_to,reason,end_reason,assigned_at,ended_at,commercial_plan_versions(id,version,currency,rules,commercial_plans(id,code,name))")
      .in("contract_id", ids).order("valid_from", { ascending: false })
    : { data: [], error: null };
  if (historial.error) return NextResponse.json({ error: "No fue posible cargar el historial de planes." }, { status: 500 });

  const planes = await db.from("commercial_plans").select("id,code,name,currency").eq("status", "active").order("code");
  if (planes.error) return NextResponse.json({ error: "No fue posible cargar los planes." }, { status: 500 });

  const tramo = (a) => ({
    id: a.id, desde: a.valid_from, hasta: a.valid_to, motivo: a.reason, motivoTermino: a.end_reason,
    planId: a.commercial_plan_versions?.commercial_plans?.id, codigo: a.commercial_plan_versions?.commercial_plans?.code,
    nombre: a.commercial_plan_versions?.commercial_plans?.name, version: a.commercial_plan_versions?.version,
    moneda: a.commercial_plan_versions?.currency, valores: a.commercial_plan_versions?.rules || {},
  });
  const porContrato = new Map();
  for (const a of historial.data || []) porContrato.set(a.contract_id, [...(porContrato.get(a.contract_id) || []), tramo(a)]);

  return NextResponse.json({
    data: {
      empresa: empresa.data,
      contratos: (contratos.data || []).map((c) => {
        const tramos = porContrato.get(c.id) || [];
        return {
          id: c.id, numero: c.contract_number, estado: c.status, desde: c.starts_on, hasta: c.ends_on, moneda: c.currency,
          planVigente: tramos.find((t) => !t.hasta) || null, historial: tramos,
        };
      }),
      planesActivos: (planes.data || []).map((p) => ({ id: p.id, codigo: p.code, nombre: p.name, moneda: p.currency })),
    },
  });
}
