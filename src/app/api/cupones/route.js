import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { randomBytes } from "node:crypto";

const mapCoupon = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.company?.trade_name || row.company?.business_name || row.company_id, merchantId: row.merchant_id, redeemingMerchantId: row.redeeming_merchant_id, merchantName: row.issuing_merchant?.name || "", merchantCode: row.issuing_merchant?.code || "", redeemingMerchantName: row.redeeming_merchant?.name || "", code: row.code, name: row.name, benefitType: row.benefit_type, value: Number(row.benefit_value), qrToken: row.delivered_at ? null : row.qr_token, qrPayload: row.delivered_at ? null : `PFC-COUPON:${row.qr_token}`, status: row.redeemed_at ? "REDEEMED" : row.status === "ACTIVE" && new Date(row.expires_at) <= new Date() ? "EXPIRED" : row.status, validFrom: row.valid_from, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, deliveredAt: row.delivered_at, deliveryMethod: row.delivery_method });
const couponSelection = "*,company:companies!coupons_company_id_fkey(business_name,trade_name),issuing_merchant:coupon_merchants!coupons_merchant_id_fkey(code,name),redeeming_merchant:coupon_merchants!coupons_redeeming_merchant_id_fkey(code,name)";
const errorResponse = (message, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request) {
  const actor = await authenticateRequest(request); if (!actor) return errorResponse("Debes iniciar sesión.", 401);
  const db = getSupabaseAdminClient(); let query = db.from("coupons").select(couponSelection).order("created_at", { ascending: false });
  if (!actor.isPlatformAdmin) {
    if (!actor.companyId) return NextResponse.json({ data: [] });
    query = query.eq("company_id", actor.companyId);
  }
  const { data, error } = await query;
  if (["PGRST205", "42P01"].includes(error?.code)) return errorResponse("El módulo de cupones está pendiente de activación en la base de datos.", 503);
  if (error) return errorResponse("No fue posible cargar los cupones.", 503);
  return NextResponse.json({ data: (data || []).map(mapCoupon) });
}

export async function POST(request) {
  const actor = await authenticateRequest(request); if (!actor) return errorResponse("Debes iniciar sesión.", 401);
  if (!actor.isAdmin && !actor.isSupervisor) return errorResponse("No tienes permisos para crear cupones.", 403);
  const input = await request.json(); const validFrom = new Date(input.validFrom); const expiresAt = new Date(input.expiresAt);
  if (!input.name?.trim()) return errorResponse("El nombre es obligatorio.");
  if (!['PERCENTAGE','FIXED_AMOUNT','FREE_MINUTES'].includes(input.benefitType) || !(Number(input.value) > 0)) return errorResponse("El beneficio no es válido.");
  if (!(expiresAt > validFrom)) return errorResponse("La expiración debe ser posterior al inicio de vigencia.");
  const db = getSupabaseAdminClient();
  let merchantQuery = db.from("coupon_merchants").select("id,company_id").eq("id", input.merchantId).eq("status", "ACTIVE");
  if (!actor.isPlatformAdmin) merchantQuery = merchantQuery.eq("company_id", actor.companyId);
  const { data: merchant } = await merchantQuery.maybeSingle();
  if (!merchant) return errorResponse("Selecciona una tienda válida para emitir el cupón.");
  let redeemingQuery = db.from("coupon_merchants").select("id,company_id").eq("id", input.redeemingMerchantId).eq("status", "ACTIVE").eq("company_id", merchant.company_id);
  const { data: redeemingMerchant } = await redeemingQuery.maybeSingle();
  if (!redeemingMerchant) return errorResponse("Selecciona una tienda válida para recibir el descuento.");
  const requestedCode = String(input.code || "").trim().toUpperCase();
  const code = /^PF-[A-F0-9]{8}$/.test(requestedCode) ? requestedCode : `PF-${randomBytes(4).toString("hex").toUpperCase()}`;
  const { data, error } = await db.from("coupons").insert({ company_id: merchant.company_id, merchant_id: merchant.id, redeeming_merchant_id: redeemingMerchant.id, code, name: input.name.trim(), benefit_type: input.benefitType, benefit_value: Number(input.value), status: input.status === "ACTIVE" ? "ACTIVE" : "DRAFT", valid_from: validFrom.toISOString(), expires_at: expiresAt.toISOString(), created_by: actor.id }).select(couponSelection).single();
  if (error?.code === "23505") return errorResponse("El código del cupón ya existe.", 409);
  if (["PGRST205", "42P01"].includes(error?.code)) return errorResponse("El módulo de cupones está pendiente de activación en la base de datos.", 503);
  if (error) return errorResponse("No fue posible crear el cupón.", 503);
  return NextResponse.json({ data: mapCoupon(data) }, { status: 201 });
}

export async function PATCH(request) {
  const actor = await authenticateRequest(request); if (!actor) return errorResponse("Debes iniciar sesión.", 401);
  if (!actor.isAdmin && !actor.isSupervisor) return errorResponse("No tienes permisos para entregar cupones.", 403);
  const input = await request.json();
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(String).filter(Boolean))].slice(0, 100);
  if (!ids.length || !["PRINT", "EMAIL"].includes(input.method)) return errorResponse("La entrega del cupón no es válida.");
  let query = getSupabaseAdminClient().from("coupons").update({ delivered_at: new Date().toISOString(), delivery_method: input.method }).in("id", ids);
  if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data, error } = await query.select("id,delivered_at,delivery_method");
  if (error) return errorResponse("No fue posible registrar la entrega de los cupones.", 503);
  return NextResponse.json({ data });
}
