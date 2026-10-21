import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { generateShortCouponCode, SHORT_COUPON_CODE_PATTERN } from "@/lib/cupones/couponCode.mjs";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { COUPONS_DISABLED_ERROR, couponsEnabled } from "@/lib/cupones/couponsAvailability.mjs";
import { couponsActiveForCompany, loadCouponModuleState } from "@/lib/cupones/couponModuleServer";
import { adminModuleView, COUPON_MODULE_INACTIVE_ERROR } from "@/lib/cupones/couponModuleCore.mjs";

const selection = "*,company:companies!coupons_company_id_fkey(business_name,trade_name),issuing_merchant:coupon_merchants!coupons_merchant_id_fkey(code,name),redeeming_merchant:coupon_merchants!coupons_redeeming_merchant_id_fkey(code,name)";
const responseError = (error, status = 400) => NextResponse.json({ error }, { status });
const mapCoupon = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.company?.trade_name || row.company?.business_name || row.company_id, merchantId: row.merchant_id, redeemingMerchantId: row.redeeming_merchant_id, merchantName: row.issuing_merchant?.name || "", merchantCode: row.issuing_merchant?.code || "", redeemingMerchantName: row.redeeming_merchant?.name || "", code: row.code, name: row.name, benefitType: row.benefit_type, value: Number(row.benefit_value), qrToken: row.delivered_at ? null : row.qr_token, qrPayload: row.delivered_at ? null : `PFC-COUPON:${row.qr_token}`, status: row.redeemed_at ? "REDEEMED" : row.status === "ACTIVE" && new Date(row.expires_at) <= new Date() ? "EXPIRED" : row.status, validFrom: row.valid_from, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, deliveredAt: row.delivered_at, deliveryMethod: row.delivery_method });

export async function GET(request) {
  if (!couponsEnabled()) return NextResponse.json(COUPONS_DISABLED_ERROR, { status: 403 });
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_READ); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context);
  let query = auth.db.from("coupons").select(selection).order("created_at", { ascending: false });
  if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data, error } = await query;
  if (["PGRST205", "42P01"].includes(error?.code)) return responseError("El modulo de cupones esta pendiente de activacion en la base de datos.", 503);
  if (error) return responseError("No fue posible cargar los cupones.", 503);
  // Módulo de la empresa (SOL-2026-10-19-002, etapa C): el administrador ve el
  // estado y el término (sin importes, D8); inactivo = solo lectura.
  let moduleView = null;
  if (!actor.isPlatformAdmin) {
    try { const state = await loadCouponModuleState(auth.db, actor.companyId); moduleView = adminModuleView(state.status, state.contract); }
    catch { moduleView = adminModuleView(null, null); }
  }
  // canManage: la pantalla ofrece crear y eliminar solo a quien la API se lo permite.
  return NextResponse.json({ data: (data || []).map(mapCoupon), module: moduleView, canManage: actor.isAdmin });
}

export async function POST(request) {
  if (!couponsEnabled()) return NextResponse.json(COUPONS_DISABLED_ERROR, { status: 403 });
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context); const input = await request.json();
  const validFrom = new Date(input.validFrom); const expiresAt = new Date(input.expiresAt);
  if (!input.name?.trim()) return responseError("El nombre es obligatorio.");
  if (!["PERCENTAGE", "FIXED_AMOUNT", "FREE_MINUTES"].includes(input.benefitType) || !(Number(input.value) > 0)) return responseError("El beneficio no es valido.");
  if (!(expiresAt > validFrom)) return responseError("La expiracion debe ser posterior al inicio de vigencia.");
  let merchantQuery = auth.db.from("coupon_merchants").select("id,company_id").eq("id", input.merchantId).eq("status", "ACTIVE");
  if (!actor.isPlatformAdmin) merchantQuery = merchantQuery.eq("company_id", actor.companyId);
  const { data: merchant } = await merchantQuery.maybeSingle();
  if (!merchant) return responseError("Selecciona una tienda valida para emitir el cupon.", 404);
  if (!(await couponsActiveForCompany(auth.db, merchant.company_id))) return NextResponse.json({ error: COUPON_MODULE_INACTIVE_ERROR.error, code: COUPON_MODULE_INACTIVE_ERROR.code }, { status: 403 });
  const { data: redeeming } = await auth.db.from("coupon_merchants").select("id").eq("id", input.redeemingMerchantId).eq("status", "ACTIVE").eq("company_id", merchant.company_id).maybeSingle();
  if (!redeeming) return responseError("Selecciona una tienda valida para recibir el descuento.", 404);
  // Código de 4 caracteres (SOL-2026-10-19-002): se acepta el propuesto por la
  // pantalla si cumple el formato; si ya existe, el servidor genera otro.
  const requested = String(input.code || "").trim().toUpperCase();
  let code = SHORT_COUPON_CODE_PATTERN.test(requested) ? requested : generateShortCouponCode(randomInt);
  const row = { company_id: merchant.company_id, merchant_id: merchant.id, redeeming_merchant_id: redeeming.id, name: input.name.trim(), benefit_type: input.benefitType, benefit_value: Number(input.value), status: input.status === "ACTIVE" ? "ACTIVE" : "DRAFT", valid_from: validFrom.toISOString(), expires_at: expiresAt.toISOString(), created_by: actor.id };
  let data = null; let error = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    ({ data, error } = await auth.db.from("coupons").insert({ ...row, code }).select(selection).single());
    if (error?.code !== "23505") break;
    code = generateShortCouponCode(randomInt);
  }
  if (error?.code === "23505") return responseError("No fue posible asignar un codigo unico al cupon. Intenta nuevamente.", 409);
  if (error) return responseError("No fue posible crear el cupon.", 503);
  return NextResponse.json({ data: mapCoupon(data) }, { status: 201 });
}

export async function PATCH(request) {
  if (!couponsEnabled()) return NextResponse.json(COUPONS_DISABLED_ERROR, { status: 403 });
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context); const input = await request.json();
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(String).filter(Boolean))].slice(0, 100);
  if (!ids.length || !["PRINT", "EMAIL"].includes(input.method)) return responseError("La entrega del cupon no es valida.");
  // Entregar (imprimir/enviar) exige el módulo activo de cada empresa involucrada.
  let companiesQuery = auth.db.from("coupons").select("company_id").in("id", ids);
  if (!actor.isPlatformAdmin) companiesQuery = companiesQuery.eq("company_id", actor.companyId);
  const { data: deliveryCompanies, error: deliveryCompaniesError } = await companiesQuery;
  if (deliveryCompaniesError) return responseError("No fue posible registrar la entrega de los cupones.", 503);
  for (const companyId of new Set((deliveryCompanies || []).map((row) => row.company_id))) {
    if (!(await couponsActiveForCompany(auth.db, companyId))) return NextResponse.json({ error: COUPON_MODULE_INACTIVE_ERROR.error, code: COUPON_MODULE_INACTIVE_ERROR.code }, { status: 403 });
  }
  let query = auth.db.from("coupons").update({ delivered_at: new Date().toISOString(), delivery_method: input.method }).in("id", ids);
  if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data, error } = await query.select("id,delivered_at,delivery_method");
  if (error) return responseError("No fue posible registrar la entrega de los cupones.", 503);
  return NextResponse.json({ data });
}

// Eliminar cupones no utilizados (SOL-2026-10-20-002). La base decide en una sola
// transacción (delete_unused_coupon, migración 20261020170000): empresa del
// administrador, módulo activo, cupón sin canje ni estadía asociada y sin pago con
// tarjeta en curso. Los utilizados se conservan en el historial y los reportes.
const COUPON_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETE_ERRORS = Object.freeze({
  COUPON_NOT_DELETABLE: [404, "El cupón no existe o no pertenece a tu empresa."],
  COUPON_MODULE_INACTIVE: [403, COUPON_MODULE_INACTIVE_ERROR.error],
  COUPON_USED: [409, "El cupón ya fue utilizado: se conserva en el historial y en los reportes."],
  COUPON_LINKED: [409, "El cupón está asociado a una operación y se conserva en el historial."],
  COUPON_PAYMENT_IN_PROGRESS: [409, "El cupón está en un pago con tarjeta en curso o por resolver. Intenta cuando ese pago se resuelva."],
});

export async function DELETE(request) {
  if (!couponsEnabled()) return NextResponse.json(COUPONS_DISABLED_ERROR, { status: 403 });
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context);
  // La empresa sale de la sesión, nunca del cuerpo; Root (sin empresa) tiene alcance global.
  if (!actor.isPlatformAdmin && !actor.companyId) return responseError("Tu cuenta no tiene una empresa asociada.", 403);
  const input = await request.json().catch(() => null);
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  if (!COUPON_UUID_PATTERN.test(id)) return responseError("El cupón a eliminar no es válido.");
  const { data, error } = await auth.db.rpc("delete_unused_coupon", { p_coupon_id: id, p_company_id: actor.isPlatformAdmin ? null : actor.companyId });
  if (error) {
    const known = Object.entries(DELETE_ERRORS).find(([code]) => String(error.message || "").includes(code));
    if (known) return NextResponse.json({ error: known[1][1], code: known[0] }, { status: known[1][0] });
    if (["PGRST202", "42883"].includes(error.code)) return responseError("La eliminación de cupones está pendiente de activación en la base de datos.", 503);
    return responseError("No fue posible eliminar el cupón. Intenta nuevamente.", 503);
  }
  return NextResponse.json({ data: { id: data || id } });
}
