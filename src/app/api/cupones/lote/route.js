import { randomInt } from "node:crypto";
import { generateDistinctShortCouponCodes } from "@/lib/cupones/couponCode.mjs";
import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { COUPONS_DISABLED_ERROR, couponsEnabled } from "@/lib/cupones/couponsAvailability.mjs";
import { couponsActiveForCompany } from "@/lib/cupones/couponModuleServer";
import { COUPON_MODULE_INACTIVE_ERROR } from "@/lib/cupones/couponModuleCore.mjs";
const selection = "*,company:companies!coupons_company_id_fkey(business_name,trade_name),issuing_merchant:coupon_merchants!coupons_merchant_id_fkey(code,name),redeeming_merchant:coupon_merchants!coupons_redeeming_merchant_id_fkey(code,name)";
const map = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.company?.trade_name || row.company?.business_name || row.company_id, merchantId: row.merchant_id, redeemingMerchantId: row.redeeming_merchant_id, merchantName: row.issuing_merchant?.name || "", redeemingMerchantName: row.redeeming_merchant?.name || "", code: row.code, name: row.name, benefitType: row.benefit_type, value: Number(row.benefit_value), qrPayload: `PFC-COUPON:${row.qr_token}`, status: row.status, validFrom: row.valid_from, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, deliveredAt: row.delivered_at, deliveryMethod: row.delivery_method });
export async function POST(request) {
  if (!couponsEnabled()) return NextResponse.json(COUPONS_DISABLED_ERROR, { status: 403 });
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context); const input = await request.json(); const quantity = Math.max(1, Math.min(100, Math.floor(Number(input.quantity) || 1)));
  let query = auth.db.from("coupons").select("*").eq("id", input.sourceId); if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data: source } = await query.maybeSingle(); if (!source) return NextResponse.json({ error: "Cupon base no encontrado." }, { status: 404 });
  if (!(await couponsActiveForCompany(auth.db, source.company_id))) return NextResponse.json({ error: COUPON_MODULE_INACTIVE_ERROR.error, code: COUPON_MODULE_INACTIVE_ERROR.code }, { status: 403 });
  let created = [];
  if (quantity > 1) {
    // Códigos de 4 caracteres distintos (SOL-2026-10-19-002); si alguno ya existe, se reintenta el lote.
    const base = { company_id: source.company_id, merchant_id: source.merchant_id, redeeming_merchant_id: source.redeeming_merchant_id, name: source.name, benefit_type: source.benefit_type, benefit_value: source.benefit_value, status: source.status, valid_from: source.valid_from, expires_at: source.expires_at, created_by: actor.id };
    let result = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const codes = generateDistinctShortCouponCodes(quantity - 1, randomInt, new Set([source.code]));
      result = await auth.db.from("coupons").insert(codes.map((code) => ({ ...base, code }))).select(selection);
      if (result.error?.code !== "23505") break;
    } if (result.error) return NextResponse.json({ error: "No fue posible generar el lote de cupones." }, { status: 503 });
    created = result.data || [];
  }
  const { data: original } = await auth.db.from("coupons").select(selection).eq("id", source.id).single();
  return NextResponse.json({ data: [original, ...created].map(map) }, { status: 201 });
}
