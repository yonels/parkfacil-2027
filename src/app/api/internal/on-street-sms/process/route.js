import { NextResponse } from "next/server";
import { processDueOnStreetSms } from "@/lib/onStreetSmsService";
import { authorizeCronRequest } from "@/lib/onStreetCronAuth.mjs";

async function handle(request) {
  const authorization = authorizeCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 503 ? "Procesador no configurado." : "No autorizado." }, { status: authorization.status });
  try { const processed = await processDueOnStreetSms({ origin: new URL(request.url).origin }); return NextResponse.json({ data: { processed: processed.length } }); }
  catch { return NextResponse.json({ error: "No fue posible procesar avisos." }, { status: 503 }); }
}

// Vercel Cron invoca rutas mediante GET. POST se conserva para la operación
// interna controlada existente; ambos métodos aplican exactamente la misma
// autenticación y ejecutan el mismo procesador/outbox.
export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
