import { NextResponse } from "next/server";

import { isInternalServiceKeyValid } from "@/lib/internalServiceAuth.mjs";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";
import { isProductionEnvironment, isValidPublicReceiptsEmail, normalizePublicReceiptsEmail } from "@/lib/publicReceipts/publicReceiptsCore.mjs";
import { fetchPublicReceiptRows } from "@/lib/publicReceipts/publicReceiptsRepository.mjs";
import { tokenAuthorizesStay, verifyPublicReceiptsToken } from "@/lib/publicReceipts/publicReceiptsToken.mjs";
import { buildPublicReceiptsSendAuditEntry } from "@/lib/publicReceipts/publicReceiptsAudit.mjs";
import { buildPublicReceiptEmail } from "@/lib/publicReceipts/publicReceiptsEmailCore.mjs";
import { isMicrosoftGraphConfigurationError, sendMicrosoftGraphMail } from "@/lib/microsoftGraphMailCore.js";

// «Consulte su boleta» (SOL-2026-11-12-004), etapa 6 -- envío de UN
// documento por correo. Exige el token de la búsqueda (C5: 15 min) y que
// el stayId pedido esté entre los autorizados por esa misma consulta --
// nunca se envía una estadía que el token no listó.
//
// Remitente: info@parkfacil.cl (decisión del usuario, P8 de DISENO.md),
// NO el buzón que ya usa la facturación Root (MICROSOFT_SENDER_EMAIL) --
// variable propia, PUBLIC_RECEIPTS_SENDER_EMAIL, porque el permiso
// Mail.Send sobre info@parkfacil.cl está "no verificado" en el diseño.
//
// Límite de esta primera versión: el correo lleva el documento como HTML,
// SIN PDF adjunto (el PDF es la etapa 4, pendiente) -- ver
// publicReceiptsEmailCore.mjs.
const MAX_SENDS_PER_PLATE_PER_DAY = 10;

function isAuthorized(request) {
  const sent = String(request.headers.get("x-parkfacil-service-key") || "");
  const expected = String(process.env.PARKFACIL_INTERNAL_SERVICE_KEY || "");
  return isInternalServiceKeyValid(sent, expected);
}

export async function POST(request) {
  const db = (() => {
    try {
      return getSupabaseAdminClient();
    } catch {
      return null;
    }
  })();

  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, code: "UNAUTHORIZED", mensaje: "No autorizado." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || "");
    const stayId = String(body?.stayId || "");
    const email = normalizePublicReceiptsEmail(body?.email);

    if (!isValidPublicReceiptsEmail(email)) {
      return NextResponse.json({ ok: false, code: "INVALID_EMAIL", mensaje: "Ingrese un correo válido." }, { status: 400 });
    }

    const secret = String(process.env.PUBLIC_RECEIPTS_TOKEN_SECRET || "");
    const senderEmail = String(process.env.PUBLIC_RECEIPTS_SENDER_EMAIL || "");
    if (!secret || !senderEmail) {
      return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED", mensaje: "Servicio no configurado." }, { status: 503 });
    }

    const verified = verifyPublicReceiptsToken(token, secret);
    if (!tokenAuthorizesStay(verified, stayId)) {
      return NextResponse.json({ ok: false, code: "TOKEN_INVALID", mensaje: "La consulta expiró. Vuelva a buscar la patente." }, { status: 401 });
    }
    const plate = verified.plate;

    if (!db) {
      return NextResponse.json({ ok: false, code: "SUPABASE_NOT_CONFIGURED", mensaje: "Supabase no está configurado." }, { status: 503 });
    }

    // Límite C3/sección 3 de DISENO.md: 10 envíos por patente por día,
    // contados sobre la misma tabla de auditoría (sin tabla aparte).
    const sinceResult = await db
      .from("public_receipt_sends")
      .select("id", { count: "exact", head: true })
      .eq("plate_hash", buildPublicReceiptsSendAuditEntry({ plate, email, stayId: "x" }).plate_hash)
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (sinceResult.error) throw sinceResult.error;
    if ((sinceResult.count || 0) >= MAX_SENDS_PER_PLATE_PER_DAY) {
      return NextResponse.json(
        { ok: false, code: "SEND_LIMIT_REACHED", mensaje: "Alcanzó el máximo de envíos para esta patente hoy. Intente mañana." },
        { status: 429 }
      );
    }

    const rows = await fetchPublicReceiptRows(db, { plate, isProduction: isProductionEnvironment(), stayIds: [stayId] });
    const row = rows.find((item) => item.stayId === stayId);
    if (!row) {
      return NextResponse.json({ ok: false, code: "RECEIPT_NOT_FOUND", mensaje: "No encontramos ese documento." }, { status: 404 });
    }

    const { subject, html } = buildPublicReceiptEmail(row);
    let result = "FAILED";
    let status = 503;
    let mensaje = "No fue posible enviar el correo en este momento.";

    try {
      await sendMicrosoftGraphMail({ para: email, asunto: subject, html, env: { ...process.env, MICROSOFT_SENDER_EMAIL: senderEmail } });
      result = "SENT";
      status = 200;
      mensaje = "";
    } catch (sendError) {
      console.error("[PUBLIC_RECEIPTS] send_failed", { code: sendError?.code, message: sendError?.message });
      if (isMicrosoftGraphConfigurationError(sendError)) {
        mensaje = "Servicio de correo no configurado.";
      }
    }

    try {
      await db.from("public_receipt_sends").insert(buildPublicReceiptsSendAuditEntry({ plate, email, stayId, result }));
    } catch (auditError) {
      console.error("No fue posible registrar la auditoría de envío de «Consulte su boleta»:", auditError?.message || auditError);
    }

    if (result !== "SENT") {
      return NextResponse.json({ ok: false, code: "SEND_FAILED", mensaje }, { status });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: false, code: "SUPABASE_NOT_CONFIGURED", mensaje: "Supabase no está configurado." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("No fue posible enviar el documento de «Consulte su boleta»:", message);
    return NextResponse.json({ ok: false, code: "SEND_FAILED", mensaje: "No fue posible enviar el correo." }, { status: 503 });
  }
}
