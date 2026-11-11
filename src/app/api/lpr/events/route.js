// LPR Off Street — Fase 1 (SOL-2026-11-01-001)
// POST /api/lpr/events: el equipo local del estacionamiento informa una lectura
// de patente y recibe la decisión. Autenticación: «Authorization: Bearer <clave>»
// del equipo local (lpr_gateways.key_hash). No usa sesión de usuario.
//
// Respuesta: { ok, eventId, decision, detail, plate, open, commandId, duplicate }
// open = true solo si se creó una orden de apertura (lpr_barrier_commands
// PENDING); el equipo local la ejecuta (fase 2).

import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { leerClaveGateway, validarCuerpoEvento } from "@/lib/lpr/lprCore.mjs";
import { autenticarGateway, LprError, procesarLectura } from "@/lib/lpr/lprEventsService";

export const dynamic = "force-dynamic";

const LARGO_MAXIMO_CUERPO = 256_000;

function fallar(mensaje, status) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

export async function POST(request) {
  const clave = leerClaveGateway(request.headers.get("authorization"));
  if (!clave) return fallar("No autorizado.", 401);

  const texto = await request.text().catch(() => "");
  if (texto.length > LARGO_MAXIMO_CUERPO) return fallar("El cuerpo es demasiado grande.", 413);
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return fallar("El cuerpo debe ser JSON.", 400);
  }

  try {
    const db = getSupabaseAdminClient();
    const gateway = await autenticarGateway(db, clave);
    if (!gateway) return fallar("No autorizado.", 401);

    const validacion = validarCuerpoEvento(cuerpo);
    if (!validacion.ok) return fallar(validacion.mensaje, 400);

    const { evento, comandoId, repetida } = await procesarLectura(db, gateway, validacion.datos);
    return NextResponse.json(
      {
        ok: true,
        eventId: evento.id,
        decision: evento.decision,
        detail: evento.decision_detail,
        plate: evento.plate_normalized,
        stayId: evento.stay_id,
        open: Boolean(comandoId),
        commandId: comandoId,
        duplicate: repetida,
      },
      { status: repetida ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof LprError) return fallar(error.message, error.status);
    console.error("[lpr:events]", { message: error?.message || String(error) });
    return fallar("No fue posible procesar la lectura.", 503);
  }
}
