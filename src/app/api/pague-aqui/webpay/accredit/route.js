import { NextResponse } from "next/server";

import { isInternalServiceKeyValid } from "@/lib/internalServiceAuth.mjs";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { accreditAuthorizedWebpayStay, StayAccreditationError } from "@/lib/webpayStayAccreditation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUY_ORDER_PATTERN = /^[A-Za-z0-9_-]{1,26}$/;

function isAuthorized(request) {
  const sent = String(request.headers.get("x-parkfacil-service-key") || "");
  const expected = String(process.env.PARKFACIL_INTERNAL_SERVICE_KEY || "");
  return isInternalServiceKeyValid(sent, expected);
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED", mensaje: "No autorizado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const stayId = String(body?.stayId || "").trim();
    const quoteId = String(body?.quoteId || "").trim();
    const buyOrder = String(body?.buyOrder || "").trim();
    const amount = Number(body?.amount);

    if (!UUID_PATTERN.test(stayId) || !UUID_PATTERN.test(quoteId) || !BUY_ORDER_PATTERN.test(buyOrder) || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, code: "INVALID_REQUEST", mensaje: "Solicitud inválida." }, { status: 400 });
    }
    if (body?.paymentProvider !== "TRANSBANK" || body?.paymentProduct !== "WEBPAY_PLUS") {
      return NextResponse.json({ ok: false, code: "INVALID_PAYMENT_SOURCE", mensaje: "Origen de pago inválido." }, { status: 400 });
    }

    const result = await accreditAuthorizedWebpayStay(getSupabaseAdminClient(), { stayId, quoteId, buyOrder, amount });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StayAccreditationError) {
      return NextResponse.json({ ok: false, code: error.code, mensaje: error.message }, { status: error.status });
    }
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: false, code: "SUPABASE_NOT_CONFIGURED", mensaje: "Servicio no disponible." }, { status: 503 });
    }
    console.error("[WEBPAY_ACCREDITATION] failed", {
      code: error?.code || "ACCREDITATION_FAILED",
      type: error?.name || "Error",
    });
    return NextResponse.json({ ok: false, code: "ACCREDITATION_FAILED", mensaje: "No fue posible acreditar la estadía." }, { status: 503 });
  }
}
