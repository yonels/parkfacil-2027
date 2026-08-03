import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { isMicrosoftGraphConfigurationError, MicrosoftGraphSendError, sendMicrosoftGraphMail } from "@/lib/microsoftGraphMail";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ ok: false, message: "Debes iniciar sesión." }, { status: 401 });
  try {
    const input = await request.json();
    const destinatario = String(input.destinatario || "").trim().toLowerCase();
    let couponQuery = getSupabaseAdminClient().from("coupons").select("*").eq("id", input.couponId);
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
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#041e42"><div style="background:#3150d8;color:white;padding:24px;border-radius:24px 24px 0 0"><h1 style="margin:0">ParkFacil</h1><p style="margin:6px 0 0">Cupón de estacionamiento de un solo uso</p></div><div style="padding:30px;border:1px solid #dbe3f0;border-top:0;text-align:center"><h2>${escapeHtml(coupon.name)}</h2><img src="data:image/png;base64,${qrBase64}" width="260" height="260" alt="Código QR"><div style="margin:18px 0;font-size:26px;font-weight:bold;letter-spacing:3px">${escapeHtml(coupon.code)}</div><p style="font-size:22px;font-weight:bold;color:#3150d8">${escapeHtml(benefit)}</p><p><b>Expira:</b> ${escapeHtml(new Date(coupon.expires_at).toLocaleString("es-CL"))}</p><p style="margin-top:24px;color:#64748b;font-size:13px">Este QR quedará invalidado inmediatamente después de utilizarse en el POS.</p></div></div>`;
    const result = await sendMicrosoftGraphMail({ para: destinatario, asunto: `Cupón ParkFacil: ${coupon.code}`, html, attachments: [{ name: `cupon-${coupon.code}.png`, contentType: "image/png", contentBytes: qrBase64, isInline: true, contentId: "coupon-qr" }] });
    return NextResponse.json({ ok: true, message: "Cupón enviado correctamente.", sender: result.remitente });
  } catch (error) {
    if (isMicrosoftGraphConfigurationError(error)) return NextResponse.json({ ok: false, message: "Office 365 no está configurado." }, { status: 503 });
    if (error instanceof MicrosoftGraphSendError) return NextResponse.json({ ok: false, message: "Microsoft 365 rechazó el envío." }, { status: 502 });
    console.error("[coupons:email]", error?.message || error);
    return NextResponse.json({ ok: false, message: "No fue posible enviar el cupón." }, { status: 500 });
  }
}
