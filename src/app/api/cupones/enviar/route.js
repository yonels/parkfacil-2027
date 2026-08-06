import { NextResponse } from "next/server";
import { isMicrosoftGraphConfigurationError, MicrosoftGraphSendError, sendMicrosoftGraphMail } from "@/lib/microsoftGraphMail";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import QRCode from "qrcode";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export const dynamic = "force-dynamic";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.COUPONS_MANAGE);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return NextResponse.json({ ok: false, message: "Debes iniciar sesión." }, { status: 401 });
  try {
    const input = await request.json();
    const destinatario = String(input.destinatario || "").trim().toLowerCase();
    let couponQuery = getSupabaseAdminClient().from("coupons").select("*,company:companies!coupons_company_id_fkey(business_name,trade_name),recipient:coupon_merchants!coupons_redeeming_merchant_id_fkey(name)").eq("id", input.couponId);
    if (!actor.isPlatformAdmin) {
      if (!actor.companyId) return NextResponse.json({ ok: false, message: "No tienes acceso al cupón." }, { status: 403 });
      couponQuery = couponQuery.eq("company_id", actor.companyId);
    }
    const { data: coupon, error } = await couponQuery.maybeSingle();
    if (!validEmail(destinatario)) return NextResponse.json({ ok: false, message: "Ingresa un correo destinatario válido." }, { status: 400 });
    if (error || !coupon) return NextResponse.json({ ok: false, message: "El cupón no existe." }, { status: 404 });
    const payload = `PFC-COUPON:${coupon.qr_token}`;
    const qrBase64 = (await QRCode.toBuffer(payload, { type: "png", width: 420, margin: 2, errorCorrectionLevel: "M" })).toString("base64");
    const benefit = coupon.benefit_type === "FREE_MINUTES" ? `${Number(coupon.benefit_value)} minutos gratis` : coupon.benefit_type === "FIXED_AMOUNT" ? `$${Number(coupon.benefit_value).toLocaleString("es-CL")} de descuento` : `${Number(coupon.benefit_value)}% de descuento`;
    const companyName = coupon.company?.trade_name || coupon.company?.business_name || "Empresa no identificada";
    const recipientName = coupon.recipient?.name || "Tienda no identificada";
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#041e42"><div style="background:#3150d8;color:white;padding:24px;border-radius:24px 24px 0 0"><h1 style="margin:0;font-size:28px">ParkFacil</h1><p style="margin:6px 0 0;font-size:15px">Cupón de estacionamiento de un solo uso</p></div><div style="padding:30px;border:1px solid #dbe3f0;border-top:0;text-align:center"><h2>${escapeHtml(coupon.name)}</h2><p style="margin:4px 0"><b>Generado por:</b> ${escapeHtml(companyName)}</p><p style="margin:4px 0 14px"><b>Para:</b> ${escapeHtml(recipientName)}</p><img src="cid:coupon-qr" width="260" height="260" alt="Código QR"><div style="margin:18px 0;font-size:26px;font-weight:bold;letter-spacing:3px">${escapeHtml(coupon.code)}</div><p style="font-size:22px;font-weight:bold;color:#3150d8">${escapeHtml(benefit)}</p><p><b>Expira:</b> ${escapeHtml(new Date(coupon.expires_at).toLocaleString("es-CL"))}</p><p style="margin-top:24px;color:#64748b;font-size:13px">Este QR quedará invalidado inmediatamente después de utilizarse en el POS.</p></div></div>`;
    const result = await sendMicrosoftGraphMail({ para: destinatario, asunto: `Cupón ParkFacil: ${coupon.code}`, html, attachments: [{ name: `cupon-${coupon.code}.png`, contentType: "image/png", contentBytes: qrBase64, isInline: true, contentId: "coupon-qr" }] });
    await getSupabaseAdminClient().from("coupons").update({ delivered_at: new Date().toISOString(), delivery_method: "EMAIL" }).eq("id", coupon.id);
    return NextResponse.json({ ok: true, message: "Cupón enviado correctamente.", sender: result.remitente });
  } catch (error) {
    if (isMicrosoftGraphConfigurationError(error)) return NextResponse.json({ ok: false, message: "Office 365 no está configurado." }, { status: 503 });
    if (error instanceof MicrosoftGraphSendError) return NextResponse.json({ ok: false, message: "Microsoft 365 rechazó el envío." }, { status: 502 });
    console.error("[coupons:email]", error?.message || error);
    return NextResponse.json({ ok: false, message: "No fue posible enviar el cupón." }, { status: 500 });
  }
}
