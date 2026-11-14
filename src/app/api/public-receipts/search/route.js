import { NextResponse } from "next/server";

import { isInternalServiceKeyValid } from "@/lib/internalServiceAuth.mjs";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { isProductionEnvironment, isValidPublicReceiptsPlate, normalizePublicReceiptsPlate } from "@/lib/publicReceipts/publicReceiptsCore.mjs";
import { fetchPublicReceiptRows } from "@/lib/publicReceipts/publicReceiptsRepository.mjs";
import { issuePublicReceiptsToken } from "@/lib/publicReceipts/publicReceiptsToken.mjs";
import { buildPublicReceiptsAuditEntry } from "@/lib/publicReceipts/publicReceiptsAudit.mjs";

// «Consulte su boleta» (SOL-2026-11-12-004), etapa 1 -- llamada desde
// parkfacil-v2 (sitio www) con x-parkfacil-service-key, igual que
// /api/pague-aqui/quote. El sitio v2 ya aplicó el límite de consultas y el
// captcha (Turnstile) antes de llegar hasta acá (C3/C4); esta API es dueña
// de los datos y de la sesión corta (C5).
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
    const plate = normalizePublicReceiptsPlate(body?.plate);
    if (!isValidPublicReceiptsPlate(plate)) {
      return NextResponse.json({ ok: false, code: "INVALID_PLATE", mensaje: "Patente inválida." }, { status: 400 });
    }

    const secret = String(process.env.PUBLIC_RECEIPTS_TOKEN_SECRET || "");
    if (!secret) {
      return NextResponse.json(
        { ok: false, code: "TOKEN_SECRET_NOT_CONFIGURED", mensaje: "Servicio no configurado." },
        { status: 503 }
      );
    }

    const db = getSupabaseAdminClient();
    const rows = await fetchPublicReceiptRows(db, { plate, isProduction: isProductionEnvironment() });
    const token = issuePublicReceiptsToken({ plate, stayIds: rows.map((r) => r.stayId), secret });

    // Auditoría (C8): best-effort, nunca bloquea la respuesta al cliente.
    try {
      await db.from("public_receipt_queries").insert(buildPublicReceiptsAuditEntry({ plate, resultCount: rows.length }));
    } catch (auditError) {
      console.error("No fue posible registrar la auditoría de «Consulte su boleta»:", auditError?.message || auditError);
    }

    return NextResponse.json(
      { ok: true, plate, token, rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: false, code: "SUPABASE_NOT_CONFIGURED", mensaje: "Supabase no está configurado." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("No fue posible consultar «Consulte su boleta»:", message);
    return NextResponse.json({ ok: false, code: "SEARCH_FAILED", mensaje: "No fue posible consultar los tickets." }, { status: 503 });
  }
}
