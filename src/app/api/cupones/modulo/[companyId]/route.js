import { NextResponse } from "next/server";
import { validateMonthlyFeeInput } from "@/lib/releasedPayment/contractCore.mjs";
import { authorizeCouponModuleRoot, fail, rpcFailure, STORAGE_MISSING_CODES } from "@/lib/cupones/couponModuleRoot";
import { contractFromDb, moduleFromDb, resolveCouponModuleStatus } from "@/lib/cupones/couponModuleCore.mjs";

// Módulo Cupones de una empresa (solo Root, SOL-2026-10-19-002, etapa C).
// GET: estado, versiones de contrato y eventos. POST: nueva versión de la
// contratación (importe mensual final en UF + IVA, plazo 12/24/36, inicio;
// base, descuentos, referencia y propuesta CRM opcionales). Misma validación
// que Pago liberado. Contratar NO activa el módulo.

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await authorizeCouponModuleRoot(request);
  if (auth.response) return auth.response;
  const { companyId } = await params;
  const [moduleResult, contracts, events] = await Promise.all([
    auth.db.from("coupon_company_modules").select("*").eq("company_id", companyId).maybeSingle(),
    auth.db.from("coupon_module_contracts").select("*").eq("company_id", companyId).order("version", { ascending: false }),
    auth.db.from("coupon_module_events").select("event_type,reason,actor_email,created_at,contract_id").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
  ]);
  const storageError = [moduleResult.error, contracts.error, events.error].find(Boolean);
  if (storageError) {
    if (STORAGE_MISSING_CODES.has(storageError.code)) return fail("El módulo de cupones aún no está instalado en la base de datos.", 503, { code: "COUPON_MODULE_STORAGE_MISSING" });
    return fail("No fue posible cargar el módulo de la empresa.", 503);
  }
  const moduleRow = moduleFromDb(moduleResult.data);
  const versions = (contracts.data || []).map(contractFromDb);
  const current = versions.find((contract) => contract.id === moduleRow?.currentContractId) || null;
  return NextResponse.json({ data: { companyId, module: moduleRow, contract: current, status: resolveCouponModuleStatus({ module: moduleRow, contract: current }), versions, events: events.data || [] } });
}

export async function POST(request, { params }) {
  const auth = await authorizeCouponModuleRoot(request);
  if (auth.response) return auth.response;
  const { companyId } = await params;
  const validation = validateMonthlyFeeInput(await request.json().catch(() => ({})));
  if (!validation.ok) return fail("Revisa los datos de la contratación.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
  const { reason, monthlyFeeUf, baseMonthlyFeeUf, discountNotes, termMonths, startsAt, contractReference, crmProposalNumber, notes } = validation.value;
  const { data, error } = await auth.db.rpc("coupon_module_save_contract", {
    p_actor_id: auth.actor.id,
    p_company_id: companyId,
    p_input: { monthlyFeeUf, baseMonthlyFeeUf, discountNotes, termMonths, startsAt, contractReference, crmProposalNumber, notes },
    p_reason: reason,
  });
  if (error) return rpcFailure(error, "No fue posible guardar la contratación.");
  return NextResponse.json({ data: contractFromDb(data) }, { status: 201 });
}
