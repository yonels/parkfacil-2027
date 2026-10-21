import { NextResponse } from "next/server";
import { authorizeCouponModuleRoot, fail, rpcFailure, STORAGE_MISSING_CODES } from "@/lib/cupones/couponModuleRoot";
import { contractFromDb, moduleFromDb, resolveCouponModuleStatus } from "@/lib/cupones/couponModuleCore.mjs";

// Root → Planes → Módulos adicionales → Cupones y descuentos
// (SOL-2026-10-19-002, etapa C). GET: catálogo, auditoría y empresas cliente
// con Off Street con el estado del módulo. PATCH: liberación en propuestas.

export const dynamic = "force-dynamic";

function catalogFromDb(row) {
  if (!row) return null;
  return { modality: row.modality, currency: row.currency, availableInQuotes: row.available_in_quotes === true, notes: row.notes || "", updatedAt: row.updated_at || null };
}

export async function GET(request) {
  const auth = await authorizeCouponModuleRoot(request);
  if (auth.response) return auth.response;
  const { db } = auth;
  const catalog = await db.from("coupon_module_catalog").select("*").eq("modality", "MONTHLY_FEE").maybeSingle();
  if (catalog.error) {
    if (STORAGE_MISSING_CODES.has(catalog.error.code)) return NextResponse.json({ data: { storageReady: false, catalog: null, audit: [], companies: [] } });
    return fail("No fue posible cargar el módulo de cupones.", 503);
  }
  const [audit, companies, modules, contracts] = await Promise.all([
    db.from("coupon_module_catalog_audit").select("previous_values,new_values,changed_by_email,changed_at").order("changed_at", { ascending: false }).limit(30),
    db.from("companies").select("id,business_name,trade_name,enabled_products").eq("status", "active").eq("relationship_type", "client").order("trade_name"),
    db.from("coupon_company_modules").select("*"),
    db.from("coupon_module_contracts").select("*").is("superseded_at", null),
  ]);
  if (companies.error || modules.error || contracts.error) return fail("No fue posible cargar las empresas.", 503);
  const moduleByCompany = new Map((modules.data || []).map((row) => [row.company_id, moduleFromDb(row)]));
  const contractByCompany = new Map((contracts.data || []).map((row) => [row.company_id, contractFromDb(row)]));
  const list = (companies.data || [])
    .filter((company) => Array.isArray(company.enabled_products) && company.enabled_products.includes("OFF_STREET"))
    .map((company) => {
      const moduleRow = moduleByCompany.get(company.id) || null;
      const contract = contractByCompany.get(company.id) || null;
      return { id: company.id, name: company.trade_name || company.business_name || company.id, module: moduleRow, contract, status: resolveCouponModuleStatus({ module: moduleRow, contract }) };
    });
  return NextResponse.json({ data: { storageReady: true, catalog: catalogFromDb(catalog.data), audit: audit.error ? [] : audit.data || [], companies: list } });
}

export async function PATCH(request) {
  const auth = await authorizeCouponModuleRoot(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.availableInQuotes !== "boolean") return fail("Indica si el módulo se ofrece en propuestas.", 400, { code: "COUPON_MODULE_CATALOG_INVALID" });
  const { data, error } = await auth.db.rpc("update_coupon_module_catalog", {
    p_actor_id: auth.actor.id,
    p_available: body.availableInQuotes,
    p_notes: String(body.notes || "").slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible guardar el catálogo del módulo.");
  return NextResponse.json({ data: catalogFromDb(Array.isArray(data) ? data[0] : data) });
}
