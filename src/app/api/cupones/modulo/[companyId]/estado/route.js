import { NextResponse } from "next/server";
import { authorizeCouponModuleRoot, fail, rpcFailure } from "@/lib/cupones/couponModuleRoot";
import { moduleFromDb } from "@/lib/cupones/couponModuleCore.mjs";

// Activar / desactivar el módulo Cupones de una empresa (solo Root, con motivo;
// SOL-2026-10-19-002, etapa C). Activar exige contrato vigente (la RPC lo
// verifica). Desactivar bloquea emitir, enviar y canjear; el historial y los
// reportes quedan en solo lectura (D3).

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeCouponModuleRoot(request);
  if (auth.response) return auth.response;
  const { companyId } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") return fail("Indica si el módulo se activa o se desactiva.", 400, { code: "COUPON_MODULE_STATE_INVALID" });
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return fail("Indica el motivo del cambio.", 400, { code: "COUPON_MODULE_REASON_REQUIRED" });
  const { data, error } = await auth.db.rpc("coupon_module_set_state", {
    p_actor_id: auth.actor.id,
    p_company_id: companyId,
    p_enabled: body.enabled,
    p_reason: reason.slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible cambiar el estado del módulo.");
  return NextResponse.json({ data: moduleFromDb(data) });
}
