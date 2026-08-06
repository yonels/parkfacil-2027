import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

const selection = "*,company:companies!coupons_company_id_fkey(business_name,trade_name),issuing_merchant:coupon_merchants!coupons_merchant_id_fkey(code,name),redeeming_merchant:coupon_merchants!coupons_redeeming_merchant_id_fkey(code,name)";
const responseError = (error, status = 400) => NextResponse.json({ error }, { status });
const mapCoupon = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.company?.trade_name || row.company?.business_name || row.company_id, merchantId: row.merchant_id, redeemingMerchantId: row.redeeming_merchant_id, merchantName: row.issuing_merchant?.name || "", merchantCode: row.issuing_merchant?.code || "", redeemingMerchantName: row.redeeming_merchant?.name || "", code: row.code, name: row.name, benefitType: row.benefit_type, value: Number(row.benefit_value), qrToken: row.delivered_at ? null : row.qr_token, qrPayload: row.delivered_at ? null : `PFC-COUPON:${row.qr_token}`, status: row.redeemed_at ? "REDEEMED" : row.status === "ACTIVE" && new Date(row.expires_at) <= new Date() ? "EXPIRED" : row.status, validFrom: row.valid_from, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, deliveredAt: row.delivered_at, deliveryMethod: row.delivery_method });

export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_READ); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context);
  let query = auth.db.from("coupons").select(selection).order("created_at", { ascending: false });
  if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data, error } = await query;
  if (["PGRST205", "42P01"].includes(error?.code)) return responseError("El modulo de cupones esta pendiente de activacion en la base de datos.", 503);
  if (error) return responseError("No fue posible cargar los cupones.", 503);
  return NextResponse.json({ data: (data || []).map(mapCoupon) });
}

export async function POST(request) {
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
  const { data: redeeming } = await auth.db.from("coupon_merchants").select("id").eq("id", input.redeemingMerchantId).eq("status", "ACTIVE").eq("company_id", merchant.company_id).maybeSingle();
  if (!redeeming) return responseError("Selecciona una tienda valida para recibir el descuento.", 404);
  const requested = String(input.code || "").trim().toUpperCase();
  const code = /^PF-[A-F0-9]{8}$/.test(requested) ? requested : `PF-${randomBytes(4).toString("hex").toUpperCase()}`;
  const { data, error } = await auth.db.from("coupons").insert({ company_id: merchant.company_id, merchant_id: merchant.id, redeeming_merchant_id: redeeming.id, code, name: input.name.trim(), benefit_type: input.benefitType, benefit_value: Number(input.value), status: input.status === "ACTIVE" ? "ACTIVE" : "DRAFT", valid_from: validFrom.toISOString(), expires_at: expiresAt.toISOString(), created_by: actor.id }).select(selection).single();
  if (error?.code === "23505") return responseError("El codigo del cupon ya existe.", 409);
  if (error) return responseError("No fue posible crear el cupon.", 503);
  return NextResponse.json({ data: mapCoupon(data) }, { status: 201 });
}

export async function PATCH(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context); const input = await request.json();
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(String).filter(Boolean))].slice(0, 100);
  if (!ids.length || !["PRINT", "EMAIL"].includes(input.method)) return responseError("La entrega del cupon no es valida.");
  let query = auth.db.from("coupons").update({ delivered_at: new Date().toISOString(), delivery_method: input.method }).in("id", ids);
  if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data, error } = await query.select("id,delivered_at,delivery_method");
  if (error) return responseError("No fue posible registrar la entrega de los cupones.", 503);
  return NextResponse.json({ data });
}
