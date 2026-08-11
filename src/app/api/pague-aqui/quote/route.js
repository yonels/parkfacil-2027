import { NextResponse } from "next/server";

import { quoteParkingStayById } from "@/lib/parkingStayQuoteService";
import { getSupabaseAdminClient, isSupabaseConfigurationError } from "@/lib/supabaseServer";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function isAuthorized(request) {
  const sent = String(request.headers.get("x-parkfacil-service-key") || "");
  const expected = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

  return Boolean(sent && expected && sent === expected);
}

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", mensaje: "No autorizado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const stayId = String(body?.stayId || "").trim();

    if (!isValidUuid(stayId)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_STAY_ID", mensaje: "Identificador de estadía inválido." },
        { status: 400 }
      );
    }

    const db = getSupabaseAdminClient();
    const result = await quoteParkingStayById(db, stayId, { now: new Date() });

    if (!result.ok) {
      const status = result.code === "STAY_NOT_FOUND" ? 404 : 409;
      return NextResponse.json(
        { ok: false, code: result.code, mensaje: result.message },
        { status }
      );
    }

    return NextResponse.json(
      { ok: true, quote: result.quote },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json(
        { ok: false, code: "SUPABASE_NOT_CONFIGURED", mensaje: "Supabase no está configurado." },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("No fue posible cotizar la estadía para Pague Aquí:", message);

    return NextResponse.json(
      { ok: false, code: "QUOTE_FAILED", mensaje: "No fue posible calcular la estadía." },
      { status: 503 }
    );
  }
}
