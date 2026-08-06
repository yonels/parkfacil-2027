import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
const selection = "*,company:companies!coupons_company_id_fkey(business_name,trade_name),issuing_merchant:coupon_merchants!coupons_merchant_id_fkey(code,name),redeeming_merchant:coupon_merchants!coupons_redeeming_merchant_id_fkey(code,name)";
const map = (row) => ({ id: row.id, companyId: row.company_id, companyName: row.company?.trade_name || row.company?.business_name || row.company_id, merchantId: row.merchant_id, redeemingMerchantId: row.redeeming_merchant_id, merchantName: row.issuing_merchant?.name || "", redeemingMerchantName: row.redeeming_merchant?.name || "", code: row.code, name: row.name, benefitType: row.benefit_type, value: Number(row.benefit_value), qrPayload: `PFC-COUPON:${row.qr_token}`, status: row.status, validFrom: row.valid_from, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, deliveredAt: row.delivered_at, deliveryMethod: row.delivery_method });
export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE); if (auth.response) return auth.response;
  const actor = remainingActor(auth.context); const input = await request.json(); const quantity = Math.max(1, Math.min(100, Math.floor(Number(input.quantity) || 1)));
  let query = auth.db.from("coupons").select("*").eq("id", input.sourceId); if (!actor.isPlatformAdmin) query = query.eq("company_id", actor.companyId);
  const { data: source } = await query.maybeSingle(); if (!source) return NextResponse.json({ error: "Cupon base no encontrado." }, { status: 404 });
  let created = [];
  if (quantity > 1) { const rows = Array.from({ length: quantity - 1 }, () => ({ company_id: source.company_id, merchant_id: source.merchant_id, redeeming_merchant_id: source.redeeming_merchant_id, code: `PF-${randomBytes(4).toString("hex").toUpperCase()}`, name: source.name, benefit_type: source.benefit_type, benefit_value: source.benefit_value, status: source.status, valid_from: source.valid_from, expires_at: source.expires_at, created_by: actor.id })); const result = await auth.db.from("coupons").insert(rows).select(selection); if (result.error) return NextResponse.json({ error: "No fue posible generar el lote de cupones." }, { status: 503 }); created = result.data || []; }
  const { data: original } = await auth.db.from("coupons").select(selection).eq("id", source.id).single();
  return NextResponse.json({ data: [original, ...created].map(map) }, { status: 201 });
}
