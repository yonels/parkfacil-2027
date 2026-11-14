import { NextResponse } from "next/server";

import { isInternalServiceKeyValid } from "@/lib/internalServiceAuth.mjs";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { isProductionEnvironment } from "@/lib/publicReceipts/publicReceiptsCore.mjs";
import { fetchPublicReceiptRows } from "@/lib/publicReceipts/publicReceiptsRepository.mjs";
import { tokenAuthorizesStay, verifyPublicReceiptsToken } from "@/lib/publicReceipts/publicReceiptsToken.mjs";
import { fetchPublicReceiptPdf } from "@/lib/publicReceipts/publicReceiptsDocument.mjs";

// «Consulte su boleta» (SOL-2026-11-12-004), etapa 4 -- PDF de UN
// documento. Mismo control de acceso que /send: exige el token de la
// consulta y que el stayId pedido esté entre los autorizados (C5).
function isAuthorized(request) {
  const sent = String(request.headers.get("x-parkfacil-service-key") || "");
  const expected = String(process.env.PARKFACIL_INTERNAL_SERVICE_KEY || "");
  return isInternalServiceKeyValid(sent, expected);
}

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, code: "UNAUTHORIZED", mensaje: "No autorizado." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || "");
    const stayId = String(body?.stayId || "");

    const secret = String(process.env.PUBLIC_RECEIPTS_TOKEN_SECRET || "");
    const verified = verifyPublicReceiptsToken(token, secret);
    if (!tokenAuthorizesStay(verified, stayId)) {
      return NextResponse.json({ ok: false, code: "TOKEN_INVALID", mensaje: "La consulta expiró. Vuelva a buscar la patente." }, { status: 401 });
    }

    const db = getSupabaseAdminClient();
    const rows = await fetchPublicReceiptRows(db, { plate: verified.plate, isProduction: isProductionEnvironment(), stayIds: [stayId] });
    const row = rows.find((item) => item.stayId === stayId);
    if (!row) {
      return NextResponse.json({ ok: false, code: "RECEIPT_NOT_FOUND", mensaje: "No encontramos ese documento." }, { status: 404 });
    }

    const result = await fetchPublicReceiptPdf(db, { row });
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code, mensaje: result.mensaje }, { status: 503 });
    }

    return NextResponse.json(
      { ok: true, pdf: result.pdf, fileName: result.fileName },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: false, code: "SUPABASE_NOT_CONFIGURED", mensaje: "Supabase no está configurado." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("No fue posible obtener el PDF de «Consulte su boleta»:", message);
    return NextResponse.json({ ok: false, code: "DOCUMENT_FAILED", mensaje: "No fue posible obtener el documento." }, { status: 503 });
  }
}
